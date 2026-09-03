// Crear client/src/pages/technician-conversations.tsx

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Phone, User, Package, Send, Search, Clock, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type TechnicianConversation = {
  id: number;
  customerId: number;
  orderId: number | null;
  conversationType: string;
  status: string;
  lastMessageAt: string;
  unreadCount: number;
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
  order: {
    id: number;
    orderNumber: string;
    status: string;
    totalAmount: string;
  } | null;
};

type Message = {
  id: number;
  conversationId: number;
  senderType: 'customer' | 'agent';
  content: string;
  sentAt: string;
  isRead: boolean;
};

export default function TechnicianConversations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<TechnicianConversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch technician conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<TechnicianConversation[]>({
    queryKey: ["/api/conversations/technician"],
    refetchInterval: 10000, // Actualizar cada 10 segundos
  });

  // Fetch messages for selected conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation,
    refetchInterval: 5000, // Actualizar mensajes cada 5 segundos
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number; content: string }) => {
      return apiRequest("POST", "/api/messages", {
        conversationId,
        content,
        senderType: "agent",
        senderId: user?.id
      });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations/technician"] });
      toast({
        title: "Mensaje enviado",
        description: "El mensaje se ha enviado correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    },
  });

  // Mark messages as read when selecting conversation
  const markAsReadMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      return apiRequest("PATCH", `/api/conversations/${conversationId}/mark-read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations/technician"] });
    },
  });

  // Handle conversation selection
  const handleSelectConversation = (conversation: TechnicianConversation) => {
    setSelectedConversation(conversation);
    if (conversation.unreadCount > 0) {
      markAsReadMutation.mutate(conversation.id);
    }
  };

  // Handle send message
  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      content: newMessage.trim()
    });
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const searchLower = searchTerm.toLowerCase();
    return (
      conv.customer.name.toLowerCase().includes(searchLower) ||
      conv.customer.phone.includes(searchTerm) ||
      conv.order?.orderNumber.toLowerCase().includes(searchLower)
    );
  });

  // Calculate totals
  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  return (
    <div className="min-h-screen bg-subtle">
      {/* Header */}
      <div className="bg-card shadow-sm border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">
                Mis Conversaciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Conversaciones de órdenes asignadas
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-accent text-accent-foreground">
              {conversations.length} conversaciones
            </Badge>
            {totalUnread > 0 && (
              <Badge variant="destructive">
                {totalUnread} sin leer
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Lista de conversaciones */}
        <div className="w-1/3 bg-card border-r flex flex-col">
          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar conversación..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Cargando conversaciones...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No hay conversaciones disponibles</p>
                <p className="text-xs mt-1">Solo se muestran conversaciones de órdenes asignadas</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`p-4 border-b cursor-pointer hover:bg-subtle transition-colors ${
                    selectedConversation?.id === conversation.id 
                      ? 'bg-accent dark:bg-primary/20 border-border' 
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {conversation.customer.name}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs px-1 py-0">
                            {conversation.unreadCount}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Phone className="w-3 h-3" />
                        {conversation.customer.phone}
                      </div>

                      {conversation.order && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                          <Package className="w-3 h-3" />
                          <span>#{conversation.order.orderNumber}</span>
                          <Badge variant="outline" className="text-xs">
                            {conversation.order.status}
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(conversation.lastMessageAt).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Content - Messages */}
        <div className="flex-1 flex flex-col bg-card">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="p-4 border-b bg-subtle">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">
                      {selectedConversation.customer.name}
                    </h2>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {selectedConversation.customer.phone}
                      </div>
                      {selectedConversation.order && (
                        <div className="flex items-center gap-1">
                          <Package className="w-4 h-4" />
                          #{selectedConversation.order.orderNumber}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedConversation.customer.address && (
                    <div className="text-right text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span className="max-w-xs truncate">
                          {selectedConversation.customer.address}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No hay mensajes en esta conversación</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.senderType === 'agent'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground'
                        }`}
                      >
                        <p>{message.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            message.senderType === 'agent' ? 'text-primary/70' : 'text-muted-foreground'
                          }`}
                        >
                          {new Date(message.sentAt).toLocaleTimeString('es-ES', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t bg-subtle">
                <div className="flex gap-2">
                  <Input
                    placeholder="Escribe tu mensaje..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    size="sm"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Selecciona una conversación</p>
                <p className="text-sm">Elige una conversación para ver los mensajes</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}