import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles, X, CheckCircle2, Circle, ChevronRight,
  Search, Lightbulb, ListChecks, HelpCircle, BookOpen,
} from "lucide-react";

/**
 * Asistente interactivo flotante.
 *
 * Se activa desde un botón fijo bottom-right y ofrece:
 *   - Checklist de onboarding con % de progreso
 *   - Tips contextuales según la ruta activa
 *   - Buscador de FAQ con matching por keywords
 *
 * El estado de "cerrado/abierto" se persiste en localStorage para no molestar
 * en cada navegación.
 */

const CATEGORY_COLOR: Record<string, string> = {
  setup: "bg-blue-500",
  commercial: "bg-green-500",
  operational: "bg-purple-500",
  compliance: "bg-orange-500",
};

const CATEGORY_LABEL: Record<string, string> = {
  setup: "Configuración",
  commercial: "Comercial",
  operational: "Operacional",
  compliance: "Fiscal",
};

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const [tab, setTab] = useState("checklist");

  useEffect(() => {
    const dismissed = localStorage.getItem("assistant:dismissed");
    if (!dismissed && !open) {
      // Auto-abre en primera visita.
      setTimeout(() => setOpen(true), 1500);
      localStorage.setItem("assistant:dismissed", "1");
    }
  }, []);

  // No mostrar en login o rutas públicas.
  if (location === "/login" || location === "/multi-tenant-login" || location.startsWith("/public") || location.startsWith("/share")) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all z-40 flex items-center justify-center group"
        aria-label="Abrir asistente"
        data-testid="button-assistant-open"
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse hidden group-hover:block" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end p-4" onClick={() => setOpen(false)}>
          <Card
            className="w-full max-w-md h-full max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <div>
                  <h2 className="font-bold">Asistente ERP</h2>
                  <p className="text-xs opacity-90">¿En qué te puedo ayudar?</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-4 mt-3">
                <TabsTrigger value="checklist" className="flex-1">
                  <ListChecks className="w-4 h-4 mr-1" /> Setup
                </TabsTrigger>
                <TabsTrigger value="tips" className="flex-1">
                  <Lightbulb className="w-4 h-4 mr-1" /> Tips
                </TabsTrigger>
                <TabsTrigger value="help" className="flex-1">
                  <HelpCircle className="w-4 h-4 mr-1" /> Ayuda
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-4">
                <TabsContent value="checklist" className="mt-0"><ChecklistTab /></TabsContent>
                <TabsContent value="tips" className="mt-0"><TipsTab path={location} /></TabsContent>
                <TabsContent value="help" className="mt-0"><HelpTab /></TabsContent>
              </div>
            </Tabs>
          </Card>
        </div>
      )}
    </>
  );
}

function ChecklistTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/assistant/onboarding"],
    queryFn: () => apiRequest("GET", "/api/assistant/onboarding"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando checklist…</p>;
  if (!data) return null;

  // Agrupar por categoría.
  const grouped: Record<string, any[]> = {};
  for (const t of data.tasks) {
    grouped[t.category] = grouped[t.category] || [];
    grouped[t.category].push(t);
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-lg">
        <div className="flex justify-between items-center mb-2">
          <div>
            <p className="font-semibold">Progreso de configuración</p>
            <p className="text-xs text-muted-foreground">
              {data.completedCount} de {data.totalCount} tareas completadas
            </p>
          </div>
          <div className="text-3xl font-bold text-indigo-600">{data.progressPct}%</div>
        </div>
        <div className="h-2 bg-white/50 dark:bg-black/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
            style={{ width: `${data.progressPct}%` }}
          />
        </div>
      </div>

      {Object.entries(grouped).map(([category, tasks]) => (
        <div key={category}>
          <div className="flex items-center gap-2 mb-2">
            <Badge className={`${CATEGORY_COLOR[category]} text-white`}>
              {CATEGORY_LABEL[category] ?? category}
            </Badge>
          </div>
          <div className="space-y-1">
            {tasks.map((t: any) => (
              <Link key={t.key} href={t.href}>
                <div className={`flex items-start gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer transition ${t.done ? "opacity-50" : ""}`}>
                  {t.done ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${t.done ? "line-through" : ""}`}>{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TipsTab({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["/api/assistant/tips", path],
    queryFn: () => apiRequest("GET", `/api/assistant/tips?path=${encodeURIComponent(path)}`),
  });

  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Estás en <code className="bg-muted px-1 py-0.5 rounded">{path}</code>
      </div>

      {data.tips?.length ? (
        <div className="space-y-2">
          {data.tips.map((tip: string, i: number) => (
            <div key={i} className="flex gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-900 rounded-lg">
              <Lightbulb className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-sm">{tip}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">
          No hay tips específicos para esta pantalla.
          <br />
          Prueba el buscador en la pestaña Ayuda.
        </p>
      )}
    </div>
  );
}

function HelpTab() {
  const [query, setQuery] = useState("");

  const { data: allFaq } = useQuery({
    queryKey: ["/api/assistant/faq"],
    queryFn: () => apiRequest("GET", "/api/assistant/faq"),
    enabled: !query.trim(),
  });

  const { data: searchResults } = useQuery({
    queryKey: ["/api/assistant/search", query],
    queryFn: () => apiRequest("GET", `/api/assistant/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 1,
  });

  const entries = (query.trim() ? searchResults?.entries : allFaq?.entries) ?? [];
  const grouped: Record<string, any[]> = {};
  for (const e of entries) {
    grouped[e.category] = grouped[e.category] || [];
    grouped[e.category].push(e);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Busca: TSS, conciliación, e-CF, ITBIS…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {entries.length === 0 && query.trim() && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Sin resultados para "{query}"
        </p>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{category}</p>
          <div className="space-y-1">
            {items.map((entry: any) => (
              <details key={entry.id} className="border rounded-lg p-3 group hover:bg-muted/30 transition">
                <summary className="cursor-pointer text-sm font-medium flex justify-between items-center">
                  <span className="flex-1">{entry.question}</span>
                  <ChevronRight className="w-4 h-4 shrink-0 group-open:rotate-90 transition" />
                </summary>
                <div className="mt-2 pt-2 border-t space-y-2">
                  <p className="text-sm text-muted-foreground">{entry.answer}</p>
                  {entry.href && (
                    <Link href={entry.href}>
                      <Button size="sm" variant="outline" className="w-full">
                        <BookOpen className="w-3.5 h-3.5 mr-2" /> Ir a la sección
                      </Button>
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
