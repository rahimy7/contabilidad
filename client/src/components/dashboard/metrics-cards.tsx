import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, MessageCircle, Users, DollarSign, TrendingUp } from "lucide-react";

interface DashboardMetrics {
  ordersToday: number;
  activeConversations: number;
  activeTechnicians: number;
  dailyRevenue: number;
}

export default function MetricsCards() {
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["/api/dashboard/metrics"],
  });

  const metrics = metricsData as DashboardMetrics | undefined;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-3 md:p-6">
              <div className="h-16 md:h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const dailyRevenue = parseFloat(String(metrics?.dailyRevenue || 0));
  const formattedRevenue = dailyRevenue.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const cards = [
    {
      title: "Pedidos Hoy",
      value: parseInt(String(metrics?.ordersToday || 0)),
      change: "+12% vs ayer",
      icon: ShoppingCart,
      iconBg: "bg-primary bg-opacity-10",
      iconColor: "text-primary",
    },
    {
      title: "Conversaciones Activas",
      value: parseInt(String(metrics?.activeConversations || 0)),
      change: "+3 nuevas",
      icon: MessageCircle,
      iconBg: "whatsapp-bg bg-opacity-10",
      iconColor: "whatsapp-text",
    },
    {
      title: "Técnicos Activos",
      value: parseInt(String(metrics?.activeTechnicians || 0)),
      change: "de 12 disponibles",
      icon: Users,
      iconBg: "success-bg bg-opacity-10",
      iconColor: "success-text",
    },
    {
      title: "Ingresos del Día",
      value: `$${formattedRevenue}`,
      change: "+8.5%",
      icon: DollarSign,
      iconBg: "warning-bg bg-opacity-10",
      iconColor: "warning-text",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} className="border border-gray-200 shadow-sm">
            <CardContent className="p-3 md:p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                  <p className="text-xs md:text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-lg md:text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                  <p className="text-xs md:text-sm success-text mt-1 flex items-center">
                    <TrendingUp className="h-2 md:h-3 w-2 md:w-3 mr-1" />
                    {card.change}
                  </p>
                </div>
                <div className={`w-8 h-8 md:w-12 md:h-12 ${card.iconBg} rounded-lg flex items-center justify-center mt-2 md:mt-0 self-end md:self-auto`}>
                  <Icon className={`${card.iconColor} h-4 md:h-6 w-4 md:w-6`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
