import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, Clock, Phone, Mail, MapPin, Calendar } from "lucide-react";
import { EmployeeProfile, User } from "@shared/schema";

// Tipo extendido que incluye la relación user
interface EmployeeWithUser extends EmployeeProfile {
  user: User;
  hireDate?: Date;
}

export default function Team() {
  const { data: employees, isLoading } = useQuery({
    queryKey: ["/api/employees"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: string }) => {
      return apiRequest("PATCH", `/api/users/${userId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "busy":
        return "bg-yellow-100 text-yellow-800";
      case "break":
        return "bg-gray-100 text-gray-800";
      case "offline":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Activo";
      case "busy":
        return "Ocupado";
      case "break":
        return "Descanso";
      case "offline":
        return "Desconectado";
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <UserCheck className="h-4 w-4" />;
      case "busy":
        return <UserX className="h-4 w-4" />;
      case "break":
        return <Clock className="h-4 w-4" />;
      case "offline":
        return <UserX className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ✅ VALIDACIÓN MEJORADA: Procesar empleados con y sin usuarios
  const allEmployees = Array.isArray(employees) ? employees : [];
  
  const validEmployees: EmployeeWithUser[] = allEmployees.filter((emp: any): emp is EmployeeWithUser => 
    emp && emp.user && emp.user.role && emp.user.id
  );

  const invalidEmployees = allEmployees.filter((emp: any) => 
    emp && (!emp.user || !emp.user.role || !emp.user.id)
  );

  console.log(`📊 Empleados: ${validEmployees.length} válidos, ${invalidEmployees.length} sin usuario`);

  // Mostrar empleados válidos disponibles
  const employeeData = validEmployees;

  // ✅ VALIDACIÓN AGREGADA: Verificar que user y role existan antes de filtrar
  const safeFilter = (role: string) => 
    employeeData.filter((emp: EmployeeWithUser) => emp.user.role === role);

  const technicians = safeFilter("technical");
  const sellers = safeFilter("sales");
  const admins = safeFilter("admin");
  const support = safeFilter("support");
  const delivery = safeFilter("delivery");

  return (
    <div className="space-y-6">
      {/* Team Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Técnicos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{technicians.length}</div>
            <p className="text-sm text-gray-500 mt-1">
              {technicians.filter(t => t.user.status === "active").length} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Vendedores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sellers.length}</div>
            <p className="text-sm text-gray-500 mt-1">
              {sellers.filter(s => s.user.status === "active").length} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Soporte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{support.length}</div>
            <p className="text-sm text-gray-500 mt-1">
              {support.filter(s => s.user.status === "active").length} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Delivery</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{delivery.length}</div>
            <p className="text-sm text-gray-500 mt-1">
              {delivery.filter(d => d.user.status === "active").length} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Administradores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{admins.length}</div>
            <p className="text-sm text-gray-500 mt-1">
              {admins.filter(a => a.user.status === "active").length} activos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warning for employees without users */}
      {invalidEmployees.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-orange-800">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                {invalidEmployees.length} empleado(s) sin usuario válido encontrado(s)
              </span>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Algunos perfiles de empleados no tienen usuarios asociados. Contacte al administrador.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle>Miembros del Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {employeeData.map((employee: EmployeeWithUser) => (
              <div key={employee.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white">
                    <span className="text-sm font-medium">
                      {employee.user.name?.split(" ").map(n => n[0]).join("").slice(0, 2) || "??"}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{employee.user.name || "Sin nombre"}</h3>
                      <Badge variant="outline" className="text-xs">
                        {employee.employeeId}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-sm text-gray-500 capitalize flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {employee.user.role === "technical" ? "Técnico" : 
                         employee.user.role === "sales" ? "Vendedor" :
                         employee.user.role === "admin" ? "Administrador" :
                         employee.user.role === "support" ? "Soporte" :
                         employee.user.role === "delivery" ? "Delivery" : 
                         employee.user.role || "Sin rol"}
                      </p>
                      {employee.department && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {employee.department}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      {employee.user.phone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {employee.user.phone}
                        </p>
                      )}
                      {employee.user.email && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {employee.user.email}
                        </p>
                      )}
                      {employee.hireDate && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(employee.hireDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Badge className={getStatusColor(employee.user.status || "offline")}>
                    <div className="flex items-center space-x-1">
                      {getStatusIcon(employee.user.status || "offline")}
                      <span>{getStatusText(employee.user.status || "offline")}</span>
                    </div>
                  </Badge>

                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant={employee.user.status === "active" ? "default" : "outline"}
                      onClick={() => updateStatusMutation.mutate({ 
                        userId: employee.user.id, 
                        status: "active" 
                      })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Activo
                    </Button>
                    <Button
                      size="sm"
                      variant={employee.user.status === "busy" ? "default" : "outline"}
                      onClick={() => updateStatusMutation.mutate({ 
                        userId: employee.user.id, 
                        status: "busy" 
                      })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Ocupado
                    </Button>
                    <Button
                      size="sm"
                      variant={employee.user.status === "break" ? "default" : "outline"}
                      onClick={() => updateStatusMutation.mutate({ 
                        userId: employee.user.id, 
                        status: "break" 
                      })}
                      disabled={updateStatusMutation.isPending}
                    >
                      Descanso
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}