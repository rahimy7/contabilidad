import { Link } from "wouter";

/**
 * Mosaico del Role Center — el "cue" de Business Central.
 *
 * Un contador que además es un destino: el número dice cuánto hay pendiente y
 * el mosaico lleva a la lista filtrada. El color no decora, clasifica:
 *
 *   · accent (petróleo) — trabajo que corresponde hacer.
 *   · alert  (rojo)     — vencido o bloqueante.
 *   · quiet  (gris)     — informativo, no exige acción.
 */
export type CueTone = "accent" | "alert" | "quiet";

const TONES: Record<CueTone, string> = {
  accent: "bg-primary text-primary-foreground hover:bg-primary-hover",
  alert: "bg-destructive text-destructive-foreground hover:opacity-90",
  quiet: "bg-muted text-foreground hover:bg-secondary",
};

interface CueProps {
  label: string;
  value: number | string;
  href: string;
  tone?: CueTone;
  /** Unidad o aclaración bajo la cifra ("días", "RD$ miles"). */
  unit?: string;
}

export function Cue({ label, value, href, tone = "accent", unit }: CueProps) {
  return (
    <Link
      href={href}
      className={`flex h-[90px] w-[112px] shrink-0 flex-col rounded-sm p-2.5 transition-colors ${TONES[tone]}`}
    >
      <span className="text-[11px] leading-tight">{label}</span>
      <span className="mt-auto text-[30px] font-extralight leading-none tabular-nums">
        {value}
      </span>
      {unit && <span className="mt-0.5 text-[10px] opacity-80">{unit}</span>}
    </Link>
  );
}

/** Un grupo de mosaicos con su rótulo. */
export function CueGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12.5px] font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
