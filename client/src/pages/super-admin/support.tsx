import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Eye,
  MessageCircle,
  User,
  Calendar,
  Filter,
  Plus,
  Search
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SupportTicket {
  id: number;
  ticketNumber: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'processing' | 'waiting_response' | 'closed';
  category: 'technical' | 'billing' | 'feature_request' | 'bug_report' | 'general';
  storeId?: number;
  storeName?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  lastResponse?: string;
  responseCount: number;
}

interface SupportMetrics {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  closedTickets: number;
  avgResponseTime: number;
  customerSatisfaction: number;
  newTicketsToday: number;
  urgentTickets: number;
}

export default function Support() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [responseText, setResponseText] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: metrics, isLoading: metricsLoading } = useQuery<SupportMetrics>({
    queryKey: ["/api/super-admin/support-metrics"],
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/super-admin/support-tickets"],
  });

  const updateTicketStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: number; status: string }) => {
      return apiRequest("PUT", `/api/super-admin/tickets/${ticketId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/support-tickets"] });
      toast({
        title: "Ticket actualizado",
        description: "El estado del ticket ha sido actualizado exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el ticket",
        variant: "destructive",
      });
    },
  });

  const addResponseMutation = useMutation({
    mutationFn: async ({ ticketId, response }: { ticketId: number; response: string }) => {
      return apiRequest("POST", `/api/super-admin/tickets/${ticketId}/responses`, { message: response });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/support-tickets"] });
      setResponseText("");
      toast({
        title: "Respuesta enviada",
        description: "La respuesta ha sido enviada al cliente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo enviar la respuesta",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'waiting_response': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'technical': return 'bg-purple-100 text-purple-800';
      case 'billing': return 'bg-green-100 text-green-800';
      case 'feature_request': return 'bg-blue-100 text-blue-800';
      case 'bug_report': return 'bg-red-100 text-red-800';
      case 'general': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertTriangle className="h-4 w-4" />;
      case 'processing': return <Clock className="h-4 w-4" />;
      case 'waiting_response': return <MessageCircle className="h-4 w-4" />;
      case 'closed': return <CheckCircle className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const filteredTickets = tickets?.filter(ticket => {
    const matchesSearch = 
      ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ticket.storeName && ticket.storeName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  }) || [];

  const handleViewDetails = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setIsDetailsDialogOpen(true);
  };

  const handleStatusChange = (ticketId: number, newStatus: string) => {
    updateTicketStatusMutation.mutate({ ticketId, status: newStatus });
  };

  const handleAddResponse = () => {
    if (selectedTicket && responseText.trim()) {
      addResponseMutation.mutate({ 
        ticketId: selectedTicket.id, 
        response: responseText 
      });
    }
  };

  if (metricsLoading || ticketsLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">7️⃣ Soporte / Tickets</h1>
          <p className="text-muted-foreground">Gestión de tickets de soporte y atención al cliente</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Ticket
        </Button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalTickets || 0}</div>
            <p className="text-xs text-muted-foreground">Tickets registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abiertos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.openTickets || 0}</div>
            <p className="text-xs text-muted-foreground">Requieren atención</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.inProgressTickets || 0}</div>
            <p className="text-xs text-muted-foreground">Siendo atendidos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cerrados</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.closedTickets || 0}</div>
            <p className="text-xs text-muted-foreground">Resueltos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tiempo Respuesta</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.avgResponseTime || 0).toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">Promedio de respuesta</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Satisfacción</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.customerSatisfaction || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Satisfacción del cliente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nuevos Hoy</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.newTicketsToday || 0}</div>
            <p className="text-xs text-muted-foreground">Tickets de hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.urgentTickets || 0}</div>
            <p className="text-xs text-muted-foreground">Prioridad urgente</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abiertos</option>
              <option value="processing">En proceso</option>
              <option value="waiting_response">Esperando respuesta</option>
              <option value="closed">Cerrados</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todas las prioridades</option>
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todas las categorías</option>
              <option value="technical">Técnico</option>
              <option value="billing">Facturación</option>
              <option value="feature_request">Solicitud de función</option>
              <option value="bug_report">Reporte de error</option>
              <option value="general">General</option>
            </select>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Más filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de tickets */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets de Soporte ({filteredTickets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(ticket.status)}
                      <div>
                        <h3 className="font-semibold">{ticket.ticketNumber}</h3>
                        <p className="text-sm text-muted-foreground">{ticket.title}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getStatusColor(ticket.status)}>
                        {ticket.status === 'open' && 'Abierto'}
                        {ticket.status === 'processing' && 'En Proceso'}
                        {ticket.status === 'waiting_response' && 'Esperando Respuesta'}
                        {ticket.status === 'closed' && 'Cerrado'}
                      </Badge>
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority === 'low' && 'Baja'}
                        {ticket.priority === 'medium' && 'Media'}
                        {ticket.priority === 'high' && 'Alta'}
                        {ticket.priority === 'urgent' && 'Urgente'}
                      </Badge>
                      <Badge className={getCategoryColor(ticket.category)}>
                        {ticket.category === 'technical' && 'Técnico'}
                        {ticket.category === 'billing' && 'Facturación'}
                        {ticket.category === 'feature_request' && 'Función'}
                        {ticket.category === 'bug_report' && 'Error'}
                        {ticket.category === 'general' && 'General'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">
                      {ticket.responseCount} respuestas
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Cliente:</span>
                    <div className="font-medium">{ticket.customerName}</div>
                    <div className="text-xs text-muted-foreground">{ticket.customerEmail}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tienda:</span>
                    <div className="font-medium">{ticket.storeName || 'No asignada'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Asignado a:</span>
                    <div className="font-medium">{ticket.assignedTo || 'Sin asignar'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Creado:</span>
                    <div className="font-medium">{new Date(ticket.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {ticket.description}
                  </p>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleViewDetails(ticket)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalles
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleStatusChange(ticket.id, 'processing')}
                      disabled={ticket.status === 'processing' || ticket.status === 'closed'}
                    >
                      Tomar Ticket
                    </Button>
                  </div>
                  <div className="flex space-x-2">
                    {ticket.status !== 'closed' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleStatusChange(ticket.id, 'closed')}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Cerrar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de detalles de ticket */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalles del Ticket</DialogTitle>
          </DialogHeader>
          {selectedTicket && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{selectedTicket.ticketNumber}</h2>
                  <p className="text-muted-foreground">{selectedTicket.title}</p>
                </div>
                <div className="flex space-x-2">
                  <Badge className={getStatusColor(selectedTicket.status)}>
                    {selectedTicket.status}
                  </Badge>
                  <Badge className={getPriorityColor(selectedTicket.priority)}>
                    {selectedTicket.priority}
                  </Badge>
                  <Badge className={getCategoryColor(selectedTicket.category)}>
                    {selectedTicket.category}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Información del Cliente</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Nombre:</span>
                      <span className="ml-2 font-medium">{selectedTicket.customerName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <span className="ml-2 font-medium">{selectedTicket.customerEmail}</span>
                    </div>
                    {selectedTicket.customerPhone && (
                      <div>
                        <span className="text-muted-foreground">Teléfono:</span>
                        <span className="ml-2 font-medium">{selectedTicket.customerPhone}</span>
                      </div>
                    )}
                    {selectedTicket.storeName && (
                      <div>
                        <span className="text-muted-foreground">Tienda:</span>
                        <span className="ml-2 font-medium">{selectedTicket.storeName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Información del Ticket</h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Creado:</span>
                      <span className="ml-2 font-medium">{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actualizado:</span>
                      <span className="ml-2 font-medium">{new Date(selectedTicket.updatedAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Asignado a:</span>
                      <span className="ml-2 font-medium">{selectedTicket.assignedTo || 'Sin asignar'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Respuestas:</span>
                      <span className="ml-2 font-medium">{selectedTicket.responseCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Descripción</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm">{selectedTicket.description}</p>
                </div>
              </div>

              {selectedTicket.status !== 'closed' && (
                <div>
                  <h3 className="font-semibold mb-2">Agregar Respuesta</h3>
                  <div className="space-y-3">
                    <Textarea
                      placeholder="Escriba su respuesta al cliente..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={4}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="outline"
                        onClick={() => setResponseText("")}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleAddResponse}
                        disabled={!responseText.trim() || addResponseMutation.isPending}
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Enviar Respuesta
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}