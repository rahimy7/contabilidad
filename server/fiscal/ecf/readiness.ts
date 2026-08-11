import type { SqlClient } from "../../accounting/types";
import { loadEcfSettings, gatewayFor, signerFor, signingIdentity } from "./ecf-config";
import { buildEcfXml } from "./xml-builder";
import { ECF_TYPES } from "./ecf-types";

/**
 * Diagnóstico de preparación para emitir e-CF.
 *
 * Responde una pregunta que no es "¿está configurado?" sino "¿si un cliente
 * intenta facturar ahora, va a salir bien?". Corre cinco chequeos: los datos
 * mínimos del emisor, el certificado, el firmante, el enlace con DGII y una
 * firma real sobre un documento de prueba. Cada uno con verdadero/falso y una
 * línea explicando qué falta cuando no.
 *
 * Todo el diagnóstico corre en la BD de la empresa: no toca nada persistente
 * y no consume secuencias eNCF.
 */

export type ReadinessSeverity = "ok" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessSeverity;
  message: string;
}

export interface ReadinessReport {
  ready: boolean;
  environment: string;
  isEnabled: boolean;
  checks: ReadinessCheck[];
  nextSteps: string[];
}

function fmtDaysLeft(expiresAt: string | undefined): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

async function checkIssuer(client: SqlClient, companyId: number): Promise<ReadinessCheck> {
  const s = await loadEcfSettings(client, companyId);
  const missing: string[] = [];
  if (!s.issuerRnc || s.issuerRnc.length < 9) missing.push("RNC");
  if (!s.issuerName) missing.push("razón social");
  if (missing.length) {
    return {
      id: "issuer",
      label: "Datos del emisor",
      status: "fail",
      message: `Falta ${missing.join(", ")} en la configuración.`,
    };
  }
  return {
    id: "issuer",
    label: "Datos del emisor",
    status: "ok",
    message: `RNC ${s.issuerRnc} — ${s.issuerName}.`,
  };
}

async function checkCertificate(client: SqlClient, companyId: number): Promise<ReadinessCheck> {
  const s = await loadEcfSettings(client, companyId);
  if (s.environment === "simulated") {
    return {
      id: "certificate",
      label: "Certificado digital",
      status: "warn",
      message: "En ambiente simulado se firma con una llave efímera; no aplica para producción.",
    };
  }
  if (!s.hasCertificate) {
    return {
      id: "certificate",
      label: "Certificado digital",
      status: "fail",
      message:
        "No hay certificado cargado. Solicítalo con una CA autorizada por DGII (Avansi o Cámara TC) y cárgalo en la pestaña de configuración.",
    };
  }
  const daysLeft = fmtDaysLeft(s.certificateExpiresAt);
  if (daysLeft != null && daysLeft <= 0) {
    return {
      id: "certificate",
      label: "Certificado digital",
      status: "fail",
      message: `El certificado venció hace ${Math.abs(daysLeft)} días. Renuévalo antes de continuar.`,
    };
  }
  if (daysLeft != null && daysLeft <= 30) {
    return {
      id: "certificate",
      label: "Certificado digital",
      status: "warn",
      message: `El certificado vence en ${daysLeft} días. Renuévalo pronto para no interrumpir la facturación.`,
    };
  }
  return {
    id: "certificate",
    label: "Certificado digital",
    status: "ok",
    message: daysLeft != null ? `Vence en ${daysLeft} días.` : "Cargado.",
  };
}

async function checkSigner(client: SqlClient, companyId: number): Promise<ReadinessCheck> {
  const s = await loadEcfSettings(client, companyId);
  try {
    const identity = await signingIdentity(client, companyId);
    const signer = signerFor(s);
    // Firmar un XML mínimo confirma que la llave/cert cargados sirven y que
    // el firmante seleccionado (Dev para simulated, XAdES para el resto)
    // arranca sin errores.
    const sample = `<Prueba><eNCF>E310000000001</eNCF><Timestamp>${new Date().toISOString()}</Timestamp></Prueba>`;
    const signed = await signer.sign(sample, identity);
    if (!signed.xml || !signed.securityCode) {
      throw new Error("firma sin código de seguridad");
    }
    return { id: "signer", label: "Firmante", status: "ok", message: "Firma un documento de prueba correctamente." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: "signer",
      label: "Firmante",
      status: "fail",
      message: `No se pudo firmar un documento de prueba: ${msg}`,
    };
  }
}

async function checkGateway(client: SqlClient, companyId: number): Promise<ReadinessCheck> {
  const s = await loadEcfSettings(client, companyId);
  try {
    const gateway = gatewayFor(s);
    // El gateway simulado siempre responde; los reales dependen de la red y
    // del token de DGII, que se obtiene al primer transmit. Un ping ligero
    // valida que la URL configurada al menos exista.
    if (s.environment === "simulated") {
      return {
        id: "gateway",
        label: "Enlace con DGII",
        status: "ok",
        message: "Simulador local activo.",
      };
    }
    const ping = await gateway.health?.().catch(() => null);
    if (ping == null) {
      return {
        id: "gateway",
        label: "Enlace con DGII",
        status: "warn",
        message: "El chequeo de red no se pudo completar; se verificará al primer envío.",
      };
    }
    return {
      id: "gateway",
      label: "Enlace con DGII",
      status: ping.ok ? "ok" : "warn",
      message: ping.detail ?? (ping.ok ? "DGII responde." : "DGII no respondió."),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: "gateway",
      label: "Enlace con DGII",
      status: "warn",
      message: `No se pudo consultar DGII: ${msg}`,
    };
  }
}

async function checkSequences(client: SqlClient, companyId: number): Promise<ReadinessCheck> {
  const { rows } = await client.query(
    `SELECT ncf_type, next_number, range_to
       FROM ncf_sequences
      WHERE company_id = $1 AND is_active = true AND ncf_type LIKE 'E%'`,
    [companyId],
  );
  if (!rows.length) {
    return {
      id: "sequences",
      label: "Secuencias eNCF autorizadas",
      status: "fail",
      message:
        "No hay rangos de eNCF activos. Solicita las secuencias en la Oficina Virtual de DGII (Autorización eNCF) y regístralas en el sistema.",
    };
  }
  const codes = rows.map((r: { ncf_type: string; next_number: number; range_to: number }) => {
    const spec = ECF_TYPES[r.ncf_type as keyof typeof ECF_TYPES];
    return `${spec?.name ?? r.ncf_type} (quedan ${Number(r.range_to) - Number(r.next_number) + 1})`;
  });
  return {
    id: "sequences",
    label: "Secuencias eNCF autorizadas",
    status: "ok",
    message: codes.join(" · "),
  };
}

const NEXT_STEPS_BY_CHECK: Record<string, string> = {
  issuer: "Completa el RNC y la razón social en la pestaña de Configuración (deben coincidir letra por letra con DGII).",
  certificate:
    "Solicita el certificado digital con una CA autorizada por DGII (Avansi o Cámara TC). El trámite es externo y toma semanas; iniciarlo ahora no requiere código.",
  signer:
    "Verifica que la llave privada y el certificado cargados sean del mismo par (formato PEM, sin passphrase).",
  gateway:
    "Verifica el ambiente seleccionado (test → cert → prod) y que el servidor tenga salida a ecf.dgii.gov.do.",
  sequences:
    "En la Oficina Virtual de DGII solicita las secuencias E31 (crédito fiscal), E32 (consumo), E33/E34 (débito/crédito) y regístralas en la pestaña de secuencias.",
};

export async function runEcfReadiness(
  client: SqlClient,
  companyId: number,
): Promise<ReadinessReport> {
  const settings = await loadEcfSettings(client, companyId);
  const checks = await Promise.all([
    checkIssuer(client, companyId),
    checkCertificate(client, companyId),
    checkSigner(client, companyId),
    checkGateway(client, companyId),
    checkSequences(client, companyId),
  ]);
  const failing = checks.filter((c) => c.status === "fail");
  const ready = failing.length === 0 && settings.environment !== "simulated" && settings.isEnabled;
  const nextSteps = failing.map((c) => NEXT_STEPS_BY_CHECK[c.id]).filter(Boolean);
  if (settings.environment === "simulated") {
    nextSteps.unshift(
      "Cambia de ambiente `simulated` a `test` para conectar con DGII (se necesita certificado).",
    );
  }
  if (!settings.isEnabled) {
    nextSteps.unshift(
      "Marca 'Facturación electrónica activa' cuando todos los chequeos estén en verde.",
    );
  }
  return {
    ready,
    environment: settings.environment,
    isEnabled: settings.isEnabled,
    checks,
    nextSteps,
  };
}
