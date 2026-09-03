// client/src/pages/team-enhanced.tsx

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, UserCheck, UserX, MapPin, Briefcase, TrendingUp, Clock } from "lucide-react";

interface TechnicianWithStats {
  id: number;
  name: string;
  status: string;
  currentOrders: number;
  maxDailyOrders: number;
  province?: string;
  municipality?: string;
  sector?: string;
  specializations?: string[];
  skillLevel: number;
  availabilityPercentage: string;
  isAvailable: boolean;
}

interface TeamAvailabilityStats {
  total: number;
  available: number;
  busy: number;
  offline: number;
  byProvince: Record<string, number>;
  averageLoad: string;
  technicians: TechnicianWithStats[];
}

export default function TeamEnhanced() {
  const { data: stats, isLoading } = useQuery<TeamAvailabilityStats>({
    queryKey: ["/api/team/availability-stats"],
    refetchInterval: 30000, // Actualizar cada 30 segundos
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success/10 text-success border-success/40";
      case "busy":
        return "bg-warning/15 text-warning border-warning/40";
      case "offline":
        return "bg-destructive/10 text-destructive border-destructive/40";
      default:
        return "bg-muted text-foreground";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Disponible";
      case "busy":
        return "Ocupado";
      case "offline":
        return "Desconectado";
      default:
        return status;
    }
  };

  const getAvailabilityColor = (percentage: number) => {
    if (percentage >= 70) return "bg-success";
    if (percentage >= 40) return "bg-warning";
    return "bg-destructive";
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-secondary rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Equipo Técnico</h1>
        <p className="text-muted-foreground mt-1">Monitoreo de disponibilidad y asignaciones en tiempo real</p>
      </div>

      {/* Resumen de disponibilidad */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Técnicos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card className="border-success/40 bg-success/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-success flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Disponibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">{stats.available}</div>
            <p className="text-xs text-success mt-1">
              {((stats.available / stats.total) * 100).toFixed(0)}% del equipo
            </p>
          </CardContent>
        </Card>

        <Card className="border-warning/40 bg-warning/15">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-warning flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Ocupados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{stats.busy}</div>
            <p className="text-xs text-warning mt-1">En servicio activo</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-accent">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Carga Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.averageLoad}%</div>
            <p className="text-xs text-primary mt-1">Capacidad utilizada</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución por provincia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Distribución por Provincia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(stats.byProvince).map(([province, count]) => (
              <div key={province} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium">{province}</span>
                <Badge variant="outline">{count} técnico{count !== 1 ? 's' : ''}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lista detallada de técnicos */}
      <Card>
        <CardHeader>
          <CardTitle>Técnicos - Disponibilidad Detallada</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.technicians.map((tech) => {
              const availPct = parseInt(tech.availabilityPercentage);
              const loadPct = 100 - availPct;
              
              return (
                <div key={tech.id} className="p-4 border rounded-lg hover:bg-subtle transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/80 rounded-full flex items-center justify-center text-primary-foreground font-medium">
                        {tech.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{tech.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className={getStatusColor(tech.status)} variant="outline">
                            {getStatusText(tech.status)}
                          </Badge>
                          {tech.isAvailable && (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/40">
                              ✓ Puede recibir órdenes
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-bold text-foreground">
                        {tech.currentOrders}/{tech.maxDailyOrders}
                      </div>
                      <div className="text-xs text-muted-foreground">órdenes activas</div>
                    </div>
                  </div>

                  {/* Barra de carga */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Capacidad utilizada</span>
                      <span className="font-medium">{loadPct}%</span>
                    </div>
                    <Progress value={loadPct} className="h-2" />
                  </div>

                  {/* Información de ubicación y especialización */}
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Ubicación
                      </div>
                      <div className="text-sm">
                        {tech.sector && <div className="font-medium">{tech.sector}</div>}
                        {tech.municipality && <div className="text-muted-foreground">{tech.municipality}</div>}
                        {tech.province && <div className="text-muted-foreground">{tech.province}</div>}
                        {!tech.province && !tech.municipality && <div className="text-muted-foreground italic">No asignada</div>}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        Especialización
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tech.specializations && tech.specializations.length > 0 ? (
                          tech.specializations.slice(0, 2).map((spec, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {spec}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sin especialización</span>
                        )}
                        {tech.specializations && tech.specializations.length > 2 && (
                          <Badge variant="secondary" className="text-xs">
                            +{tech.specializations.length - 2}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-muted-foreground">Nivel:</span>
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < tech.skillLevel ? 'bg-primary' : 'bg-secondary'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}