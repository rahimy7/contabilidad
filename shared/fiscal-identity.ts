/**
 * Identificación fiscal de un tercero ante la DGII: lo que clientes y
 * proveedores tienen en común.
 *
 * Las reglas de cada maestro (qué comprobante le toca a un cliente, qué
 * retención se le aplica a un proveedor) viven en `customer-fiscal.ts` y
 * `supplier-fiscal.ts`; aquí sólo lo que no depende de qué lado de la
 * operación esté el tercero.
 */

export type PersonType = "fisica" | "juridica";
export type TaxIdType = "rnc" | "cedula" | "pasaporte" | "extranjero";

export const PERSON_TYPES: Record<PersonType, string> = {
  fisica: "Persona física",
  juridica: "Persona jurídica",
};

export const TAX_ID_TYPES: Record<TaxIdType, string> = {
  rnc: "RNC",
  cedula: "Cédula",
  pasaporte: "Pasaporte",
  extranjero: "Identificación extranjera",
};

export const DGII_STATUS: Record<string, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  cese: "Cese de operaciones",
  no_verificado: "No verificado",
};

/** Provincias de la República Dominicana, para la dirección fiscal. */
export const DR_PROVINCES = [
  "Distrito Nacional", "Azua", "Bahoruco", "Barahona", "Dajabón", "Duarte",
  "El Seibo", "Elías Piña", "Espaillat", "Hato Mayor", "Hermanas Mirabal",
  "Independencia", "La Altagracia", "La Romana", "La Vega",
  "María Trinidad Sánchez", "Monseñor Nouel", "Monte Cristi", "Monte Plata",
  "Pedernales", "Peravia", "Puerto Plata", "Samaná", "San Cristóbal",
  "San José de Ocoa", "San Juan", "San Pedro de Macorís", "Sánchez Ramírez",
  "Santiago", "Santiago Rodríguez", "Santo Domingo", "Valverde",
];

export const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Dígito verificador del RNC (módulo 11 con los pesos que publica la DGII). */
export function isValidRnc(rnc: string): boolean {
  const d = onlyDigits(rnc);
  if (!/^\d{9}$/.test(d)) return false;
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  const total = weights.reduce((s, w, i) => s + w * Number(d[i]), 0);
  const r = total % 11;
  const check = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
  return check === Number(d[8]);
}

/** Dígito verificador de la cédula (Luhn sobre las 10 primeras cifras). */
export function isValidCedula(cedula: string): boolean {
  const d = onlyDigits(cedula);
  if (!/^\d{11}$/.test(d)) return false;
  let total = 0;
  for (let i = 0; i < 10; i++) {
    let p = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (p > 9) p -= 9;
    total += p;
  }
  return (10 - (total % 10)) % 10 === Number(d[10]);
}

/** RNC con guiones al estilo de la DGII: 1-01-01063-2 y 001-0000000-1. */
export function formatTaxId(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 9) return `${d[0]}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d[8]}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d[10]}`;
  return v ?? "";
}

export interface FiscalCheck {
  /** Impiden guardar. */
  errors: string[];
  /** Se muestran, pero no bloquean: hay cédulas antiguas válidas que no pasan el dígito. */
  warnings: string[];
}

export interface IdentityDocument {
  personType: PersonType;
  taxIdType?: TaxIdType | null;
  /** RNC o cédula (cifras). */
  rnc?: string | null;
  /** Pasaporte o identificación extranjera. */
  foreignId?: string | null;
  legalName?: string | null;
  /** Tercero del exterior: una persona jurídica puede no tener RNC. */
  isForeign?: boolean;
}

/** Nombre, documento y su formato: la parte de la identidad que no depende del régimen. */
export function checkIdentityDocument(f: IdentityDocument): FiscalCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const digits = onlyDigits(f.rnc);

  if (!f.legalName?.trim()) {
    errors.push(f.personType === "juridica" ? "La razón social es obligatoria." : "El nombre completo es obligatorio.");
  }

  if (f.taxIdType === "rnc") {
    if (digits.length !== 9) errors.push("El RNC debe tener 9 dígitos.");
    else if (!isValidRnc(digits)) warnings.push("El dígito verificador del RNC no coincide; verifíquelo en la DGII.");
  } else if (f.taxIdType === "cedula") {
    if (digits.length !== 11) errors.push("La cédula debe tener 11 dígitos.");
    else if (!isValidCedula(digits)) warnings.push("El dígito verificador de la cédula no coincide; verifíquela.");
  } else if (f.taxIdType === "pasaporte" || f.taxIdType === "extranjero") {
    if (!f.foreignId?.trim()) errors.push("Indique el número del documento de identidad.");
  }

  if (f.personType === "juridica" && !f.isForeign && f.taxIdType !== "rnc") {
    errors.push("Una persona jurídica dominicana se identifica con RNC.");
  }
  if (f.personType === "fisica" && f.taxIdType === "rnc" && digits.length === 9) {
    warnings.push("Un RNC de 9 dígitos suele corresponder a una persona jurídica.");
  }
  return { errors, warnings };
}
