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
import SendMessageModal from "@/components/whatsapp/send-message-modal";

interface ChatWindowProps {
  conversation: ConversationWithDetails | null;
}

interface CustomerDetails {
  isVip: boolean;
  totalOrders: number;
}

export default function ChatWindow({ conversation }: ChatWindowProps) {
  const [newMessage, setNewMessage] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch messages
  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversation?.id, "messages"],
    queryFn: () =>
      conversation?.id
        ? apiGet<Message[]>(`/api/conversations/${conversation.id}/messages`)
        : Promise.resolve([]),
    enabled: !!conversation?.id,
  });

  // Fetch customer details
  const { data: customerDetails } = useQuery<CustomerDetails | null>({
    queryKey: ["/api/customers", conversation?.customer?.id, "details"],
    queryFn: () =>
      conversation?.customer.id
        ? apiGet<CustomerDetails>(
            `/api/customers/${conversation.customer.id}/details`
          )
        : Promise.resolve(null),
    enabled: !!conversation?.customer?.id,
  });

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation) throw new Error("No conversation selected");
      return apiRequest("POST", `/api/conversations/${conversation.id}/messages`, {
        content,
        senderType: "staff",
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
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    },
  });

  // Mark as read
  useEffect(() => {
    if (conversation?.id) {
      apiRequest("POST", `/api/conversations/${conversation.id}/mark-read`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  }, [conversation?.id]);

  // Scroll bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessageMutation.mutate(newMessage.trim());
    }
  };

  const formatMessageTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

 if (!conversation?.customer?.id) {
  return (
    <Card className="h-full">
      <CardContent className="h-[500px] flex items-center justify-center">
        <div className="text-center text-gray-500">
          Selecciona una conversación para ver los detalles
        </div>
      </CardContent>
    </Card>
  );
}

  return (
    <div>
      <Card className="h-full flex flex-col">
        {/* Header */}
        <CardHeader className="bg-green-50 border-b border-green-100 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
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
                  <span className="font-medium">
                    {conversation.customer.phone}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs text-green-600 font-medium">
                      En línea
                    </span>
                  </div>
                  {conversation.order && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-blue-100 text-blue-700 border-blue-200"
                    >
                      {conversation.order.orderNumber}
                    </Badge>
                  )}
                  {customerDetails && customerDetails.totalOrders > 0 && (
                    <Badge
                      variant="outline"
                      className="text-xs border-gray-300 text-gray-600"
                    >
                      📊 {customerDetails.totalOrders} pedidos
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSendModal(true)}
                className="bg-green-500 text-white hover:bg-green-600 border-green-500 shadow-sm"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex space-x-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const isFromCustomer = message.senderType === "customer";
                const showAvatar =
                  index === 0 ||
                  messages[index - 1]?.senderType !== message.senderType;

                return (
                  <div
                    key={message.id}
                    className={`flex items-end gap-2 ${
                      isFromCustomer ? "justify-start" : "justify-end"
                    }`}
                  >
                    {isFromCustomer && (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          showAvatar ? "bg-blue-500" : "invisible"
                        }`}
                      >
                        {showAvatar && <User className="text-white h-4 w-4" />}
                      </div>
                    )}
                    <div
                      className={`relative max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                        isFromCustomer
                          ? "bg-white text-gray-900 border border-gray-200"
                          : "bg-green-500 text-white"
                      }`}
                      style={{
                        borderRadius: isFromCustomer
                          ? "18px 18px 18px 4px"
                          : "18px 18px 4px 18px",
                      }}
                    >
                      <p className="text-sm leading-relaxed break-words">
                        {message.content}
                      </p>
                      <div
                        className={`flex items-center justify-end gap-1 mt-2 ${
                          isFromCustomer ? "text-gray-500" : "text-green-100"
                        }`}
                      >
                        <span className="text-xs">
                          {formatMessageTime(message.sentAt)}
                        </span>
                      </div>
                    </div>
                    {!isFromCustomer && (
                      <div className="w-8 h-8 invisible flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                No hay mensajes en esta conversación
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <form onSubmit={handleSendMessage} className="flex items-end space-x-3">
            <div className="flex-1 relative">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe un mensaje..."
                className="rounded-full py-3 px-4 pr-12 resize-none border-gray-300 focus:border-green-500 focus:ring-green-500 bg-white shadow-sm"
                disabled={sendMessageMutation.isPending}
              />
            </div>
            <Button
              type="submit"
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
              className="w-12 h-12 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105"
              size="sm"
            >
              {sendMessageMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </Button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            💬 Los mensajes se envían directamente a WhatsApp
          </p>
        </div>
      </Card>

      {/* Modal */}
      <SendMessageModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        defaultPhone={conversation?.customer.phone || ""}
      />
    </div>
  );
}
