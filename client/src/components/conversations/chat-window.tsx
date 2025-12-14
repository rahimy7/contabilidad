import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiGet, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, Phone, User } from "lucide-react";
import { ConversationWithDetails, Message } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ChatWindowProps {
  conversation: ConversationWithDetails | null;
}

interface CustomerDetails {
  isVip: boolean;
  totalOrders: number;
  totalSpent: string;
}

export default function ChatWindow({ conversation }: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // ✅ Fetch messages con apiGet
  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversation?.id, "messages"],
    queryFn: () =>
      conversation?.id
        ? apiGet<Message[]>(`/api/conversations/${conversation.id}/messages`)
        : Promise.resolve([]),
    enabled: !!conversation?.id,
    refetchInterval: 5000, // Refrescar mensajes cada 5 segundos
  });

  // ✅ Fetch customer details
  const { data: customerDetails } = useQuery<CustomerDetails | null>({
    queryKey: ["/api/customers", conversation?.customer.id, "details"],
    queryFn: () =>
      conversation?.customer.id
        ? apiGet<CustomerDetails>(`/api/customers/${conversation.customer.id}/details`)
        : Promise.resolve(null),
    enabled: !!conversation?.customer.id,
  });

  // ✅ Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation) throw new Error("No conversation selected");
      return apiRequest("POST", `/api/conversations/${conversation.id}/messages`, {
        content,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/conversations", conversation?.id, "messages"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setNewMessage("");
      toast({
        title: "Mensaje enviado",
        description: "El mensaje ha sido enviado exitosamente",
      });
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    },
  });

  // ✅ Mark as read
  useEffect(() => {
    if (conversation?.id) {
      apiRequest("POST", `/api/conversations/${conversation.id}/mark-read`, {})
        .catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  }, [conversation?.id]);

  // ✅ Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(newMessage.trim());
    }
  };

  const formatMessageTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!conversation) {
    return (
      <Card className="h-full">
        <CardContent className="h-[500px] flex items-center justify-center">
          <div className="text-center">
            <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Selecciona una conversación
            </h3>
            <p className="text-gray-500">
              Elige una conversación de la lista para comenzar a chatear
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="bg-green-50 border-b border-green-100 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg">
                <User className="text-white h-6 w-6" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {conversation.customer.name}
                </CardTitle>
                {customerDetails?.isVip && (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs">
                    ⭐ VIP
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Phone className="h-3 w-3" />
                <span className="font-medium">{conversation.customer.phone}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px]">
        {isLoading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No hay mensajes en esta conversación
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.senderType === "staff" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.senderType === "staff"
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.senderType === "staff" ? "text-green-100" : "text-gray-500"
                }`}>
                  {formatMessageTime(message.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="flex-1"
            disabled={sendMessageMutation.isPending}
          />
          <Button 
            type="submit" 
            size="sm"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
          >
            {sendMessageMutation.isPending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}