import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  BookOpen, Search, CheckCircle2, MinusCircle, Circle, ChevronRight,
  ArrowUpRight, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AREAS, resumen, resumenArea, type Area, type Capacidad, type Estado } from "./modules-catalog";

/**
 * Ayuda: qué hace cada módulo, y qué tan completo está frente al esquema ERP
 * de referencia.
 *
 * Dos documentos en uno, y a propósito. El detalle de cada capacidad sirve para
 * usar el sistema; el estado sirve para decidir qué construir. Separarlos
 * produciría un manual que promete y un backlog que nadie lee junto al manual.
 *
 * La regla de honestidad del documento: `ausente` significa que no existe, no
 * que está planificado. Un catálogo que sólo enumera lo que hay sirve para
 * vender; uno que enumera lo que falta sirve para trabajar.
 */

const ESTADO_META: Record<
  Estado,
  { label: string; icon: any; chip: string; dot: string }
> = {
  disponible: {
    label: "Disponible",
    icon: CheckCircle2,
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  parcial: {
    label: "Parcial",
    icon: MinusCircle,
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-500",
    dot: "bg-amber-500",
  },
  ausente: {
    label: "No disponible",
    icon: Circle,
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

type Filtro = "todo" | Estado;

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const total = resumen();

  const areas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return AREAS.map((a) => ({
      ...a,
      capacidades: a.capacidades.filter((c) => {
        if (filtro !== "todo" && c.estado !== filtro) return false;
        if (!q) return true;
        return `${c.nombre} ${c.detalle ?? ""} ${c.falta ?? ""} ${a.nombre}`
          .toLowerCase()
          .includes(q);
      }),
    })).filter((a) => a.capacidades.length > 0);
  }, [search, filtro]);

  const pct = (n: number) => Math.round((n / total.total) * 100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="h-6 w-6" /> Ayuda y catálogo de módulos
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Qué hace cada módulo del sistema, y cómo se compara contra un esquema ERP
          completo de {total.total} capacidades. Lo que no existe aparece marcado como no
          disponible: es más útil saber dónde está el hueco que leer una lista de promesas.
        </p>
      </header>

      {/* Cobertura: la barra dice de un vistazo lo que las tarjetas dicen en número */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobertura frente al esquema de referencia</CardTitle>
          <CardDescription>
            {total.disponible} de {total.total} capacidades operativas, {total.parcial} a medias.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="bg-emerald-500" style={{ width: `${pct(total.disponible)}%` }} />
            <div className="bg-amber-500" style={{ width: `${pct(total.parcial)}%` }} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Resumen
              estado="disponible"
              n={total.disponible}
              pct={pct(total.disponible)}
              hint="La pantalla existe y hace lo que dice"
            />
            <Resumen
              estado="parcial"
              n={total.parcial}
              pct={pct(total.parcial)}
              hint="Hay una parte real y una parte que falta"
            />
            <Resumen
              estado="ausente"
              n={total.ausente}
              pct={pct(total.ausente)}
              hint="No existe todavía"
            />
          </div>
        </CardContent>
      </Card>

      {/* Buscador y filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Buscar una capacidad… (conteo, retención, FEFO, nómina)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <Filter className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
          {(["todo", "disponible", "parcial", "ausente"] as Filtro[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setFiltro(f)}
            >
              {f === "todo" ? "Todo" : ESTADO_META[f].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Índice de áreas */}
      {!search && filtro === "todo" && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => {
            const r = resumenArea(a);
            return (
              <a
                key={a.codigo}
                href={`#area-${a.codigo}`}
                className="group flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900"
              >
                <span className="font-mono text-xs text-slate-400">{a.codigo}</span>
                <span className="flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-200">
                  {a.nombre}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {r.disponible}/{r.total}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5" />
              </a>
            );
          })}
        </div>
      )}

      {areas.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            Nada coincide con esa búsqueda.
          </CardContent>
        </Card>
      )}

      {areas.map((a) => (
        <AreaSection key={a.codigo} area={a} />
      ))}
    </div>
  );
}

function Resumen({
  estado,
  n,
  pct,
  hint,
}: {
  estado: Estado;
  n: number;
  pct: number;
  hint: string;
}) {
  const meta = ESTADO_META[estado];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {meta.label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{n}</span>
        <span className="text-xs text-slate-400">{pct}%</span>
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}

function AreaSection({ area }: { area: Area }) {
  const r = resumenArea(area);
  return (
    <section id={`area-${area.codigo}`} className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
        <span className="font-mono text-sm text-slate-400">{area.codigo}</span>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{area.nombre}</h2>
        <span className="text-sm text-slate-500">{area.proposito}</span>
        <span className="ml-auto text-xs tabular-nums text-slate-500">
          {r.disponible} de {r.total} disponibles
          {r.parcial > 0 && ` · ${r.parcial} parcial${r.parcial > 1 ? "es" : ""}`}
        </span>
      </div>

      <div className="grid gap-2.5">
        {area.capacidades.map((c) => (
          <CapacidadRow key={c.nombre} c={c} />
        ))}
      </div>
    </section>
  );
}

function CapacidadRow({ c }: { c: Capacidad }) {
  const meta = ESTADO_META[c.estado];
  return (
    <div
      className={[
        "rounded-lg border p-3.5",
        c.estado === "ausente"
          ? "border-dashed bg-slate-50/50 dark:bg-slate-900/30"
          : "bg-white dark:bg-slate-950",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* El punto codifica el estado en forma además de color, para que no
            dependa de distinguir ámbar de verde en una pantalla cualquiera. */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
        <h3
          className={[
            "text-[15px] font-medium",
            c.estado === "ausente"
              ? "text-slate-500 dark:text-slate-400"
              : "text-slate-900 dark:text-slate-100",
          ].join(" ")}
        >
          {c.nombre}
        </h3>
        <Badge variant="outline" className={`border-0 text-[11px] ${meta.chip}`}>
          {meta.label}
        </Badge>

        {c.ruta && (
          <Link
            href={c.ruta}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Abrir <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {c.detalle && (
        <p className="mt-1.5 max-w-4xl text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
          {c.detalle}
        </p>
      )}

      {c.falta && (
        <p
          className={[
            "mt-1.5 max-w-4xl text-[13px] leading-relaxed",
            c.estado === "ausente"
              ? "text-slate-500 dark:text-slate-400"
              : "text-amber-700 dark:text-amber-500",
          ].join(" ")}
        >
          {c.estado === "ausente" ? "" : "Falta: "}
          {c.falta}
        </p>
      )}
    </div>
  );
}
