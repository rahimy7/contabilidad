// client/src/pages/conversations.tsx
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Phone, MoreVertical, Search, ArrowLeft, Check, CheckCheck, User } from "lucide-react";
import { apiGet, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: number;
  name?: string;
  phone?: string;
  email?: string;
}

interface LastMessage {
  id: number;
  content: string;
  senderType: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  customerId: number;
  conversationType: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
  customer?: Customer;
  lastMessage?: LastMessage;
  // Campos planos para compatibilidad
  customerName?: string;
  customerPhone?: string;
}

interface Message {
  id: number;
  conversationId: number;
  senderType: string;
  content: string;
  sentAt: string;
  deliveryStatus?: string;
}

export default function ConversationsPage() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query para obtener conversaciones
  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 5000, // Refrescar cada 5 segundos
  });

  // Debug: Log de las conversaciones recibidas
  useEffect(() => {
    console.log('📋 Conversaciones recibidas:', conversations);
    console.log('📊 Total conversaciones:', conversations.length);
    if (conversations.length > 0) {
      console.log('🔍 Primera conversación:', conversations[0]);
    }
  }, [conversations]);

  // Query para obtener mensajes de la conversación seleccionada
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    queryFn: () =>
      selectedConversation?.id
        ? apiGet<Message[]>(`/api/conversations/${selectedConversation.id}/messages`)
        : Promise.resolve([]),
    enabled: !!selectedConversation?.id,
    refetchInterval: 3000, // Refrescar mensajes cada 3 segundos
  });

  // Mutation para enviar mensajes
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number; content: string }) => {
      return apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        content,
        messageType: "text",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setNewMessage("");
      toast({
        title: "Mensaje enviado",
        description: "El mensaje ha sido enviado correctamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error al enviar mensaje",
        description: error.message || "No se pudo enviar el mensaje",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 24) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
      return 'Ayer';
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;

    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      content: newMessage.trim(),
    });
  };

  const filteredConversations = conversations.filter((conv) => {
    const name = conv.customer?.name || conv.customerName || '';
    const phone = conv.customer?.phone || conv.customerPhone || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           phone.includes(searchTerm);
  });

  const MessageStatus = ({ status }: { status?: string }) => {
    if (status === 'read' || status === 'delivered') {
      return <CheckCheck className="w-4 h-4 text-blue-400" />;
    } else if (status === 'sent') {
      return <Check className="w-4 h-4 text-gray-400" />;
    } else {
      return <Check className="w-4 h-4 text-gray-400" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando conversaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-100 overflow-hidden rounded-lg shadow-lg">
      {/* Panel de conversaciones */}
      <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 bg-white border-r border-gray-200`}>
        {/* Header de conversaciones - FIJO */}
        <div className="flex-shrink-0 bg-emerald-600 p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-white text-xl font-semibold">Conversaciones</h1>
            <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
          
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar conversación..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Lista de conversaciones con scroll independiente */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
              <p className="text-gray-500">Cargando conversaciones...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <User className="w-16 h-16 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">
                {searchTerm ? 'No se encontraron conversaciones' : 'No hay conversaciones'}
              </p>
              <p className="text-gray-400 text-sm mt-2">
                {conversations.length > 0 
                  ? `${conversations.length} conversación(es) en total` 
                  : 'Las conversaciones aparecerán aquí'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`flex items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                  selectedConversation?.id === conversation.id ? 'bg-emerald-50' : ''
                }`}
              >
                {/* Avatar */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-semibold mr-3">
                  <User className="w-6 h-6" />
                </div>

                {/* Información de la conversación */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {conversation.customer?.name || conversation.customerName || `Cliente ${conversation.customerId}`}
                    </h3>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                      {formatTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600 truncate">
                      {conversation.lastMessage?.content || conversation.customer?.phone || conversation.customerPhone || 'Sin mensajes'}
                    </p>
                    <span className={`ml-2 flex-shrink-0 px-2 py-0.5 text-xs rounded-full ${
                      conversation.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {conversation.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel de chat */}
      {selectedConversation ? (
        <div className="flex flex-col flex-1 bg-gray-50">
          {/* Header del chat - FIJO, NO SE OCULTA */}
          <div className="flex-shrink-0 bg-emerald-600 px-4 py-3 flex items-center justify-between shadow-md">
            <div className="flex items-center flex-1">
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden mr-3 text-white hover:bg-emerald-700 p-2 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white mr-3">
                <User className="w-5 h-5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-semibold truncate">
                  {selectedConversation.customer?.name || selectedConversation.customerName || `Cliente ${selectedConversation.customerId}`}
                </h2>
                <p className="text-emerald-100 text-sm truncate">
                  {selectedConversation.customer?.phone || selectedConversation.customerPhone || 'Sin teléfono'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
                <Phone className="w-5 h-5" />
              </button>
              <button className="text-white hover:bg-emerald-700 p-2 rounded-full transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Área de mensajes con scroll independiente */}
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-3"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#efeae2'
            }}
          >
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">No hay mensajes en esta conversación</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.senderType === 'staff' || message.senderType === 'agent' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm ${
                      message.senderType === 'staff' || message.senderType === 'agent'
                        ? 'bg-emerald-500 text-white rounded-br-none'
                        : 'bg-white text-gray-900 rounded-bl-none'
                    }`}
                  >
                    <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                    <div className={`flex items-center justify-end space-x-1 mt-1 ${
                      message.senderType === 'staff' || message.senderType === 'agent' ? 'text-emerald-100' : 'text-gray-500'
                    }`}>
                      <span className="text-xs">
                        {formatTime(message.sentAt)}
                      </span>
                      {(message.senderType === 'staff' || message.senderType === 'agent') && (
                        <MessageStatus status={message.deliveryStatus} />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensaje - FIJO */}
          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !sendMessageMutation.isPending && handleSendMessage()}
                placeholder="Escribe un mensaje..."
                disabled={sendMessageMutation.isPending}
                className="flex-1 px-4 py-3 rounded-full bg-gray-100 border-none focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-full transition-colors shadow-lg"
              >
                {sendMessageMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              Selecciona una conversación
            </h3>
            <p className="text-gray-500">
              Elige un chat de la lista para comenzar a conversar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}