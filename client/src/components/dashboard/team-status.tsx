import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "@shared/schema";

export default function TeamStatus() {
  const { data: users, isLoading } = useQuery({
    queryKey: ["/api/employees"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "busy":
        return "bg-yellow-500";
      case "break":
        return "bg-gray-400";
      case "offline":
        return "bg-red-500";
      default:
        return "bg-gray-400";
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Estado del Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter to show only technicians and sellers
  const teamMembers = users?.filter((user: User) => 
    user.role === "technician" || user.role === "seller"
  ) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900">Estado del Equipo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {teamMembers.map((member: User) => (
            <div key={member.id} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  member.status === "active" ? "bg-green-100" : 
                  member.status === "busy" ? "bg-blue-100" : "bg-gray-100"
                }`}>
                  <span className={`text-xs font-medium ${
                    member.status === "active" ? "text-green-700" :
                    member.status === "busy" ? "text-blue-700" : "text-gray-700"
                  }`}>
                    {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${getStatusColor(member.status)}`}></span>
                <span className="text-xs text-gray-500">{getStatusText(member.status)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
