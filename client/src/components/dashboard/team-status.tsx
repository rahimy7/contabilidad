import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "@shared/schema";

export default function TeamStatus() {
 const { data: users, isLoading } = useQuery<User[]>({
  queryKey: ["/api/employees"],
});

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-success";
      case "busy":
        return "bg-warning";
      case "break":
        return "bg-muted-foreground";
      case "offline":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "technician":
        return "Técnico";
      case "sales_rep":
        return "Ventas";
      case "delivery":
        return "Delivery";
      default:
        return role;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estado del Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-secondary rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter to show technicians, sales reps, and delivery
  const teamMembers = users?.filter((user: User) => 
    user.role === "technician" || user.role === "sales_rep" || user.role === "delivery"
  ) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Estado del Equipo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {teamMembers.map((member: User) => (
            <div key={member.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  member.status === "active" ? "bg-success/10" :
                  member.status === "busy" ? "bg-accent" : "bg-muted"
                }`}>
                  <span className={`text-xs font-medium ${
                    member.status === "active" ? "text-success" :
                    member.status === "busy" ? "text-primary" : "text-foreground"
                  }`}>
                    {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{getRoleLabel(member.role)}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${getStatusColor(member.status)}`}></span>
                <span className="text-xs text-muted-foreground">{getStatusText(member.status)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}