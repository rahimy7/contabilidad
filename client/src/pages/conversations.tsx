import { useState, useEffect, useRef, useCallback } from "react";
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

const INITIAL_MESSAGE_COUNT = 3;
const MESSAGES_PER_LOAD = 10;

export default function ConversationsPage() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number>(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query para obtener conversaciones
  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 5000,
  });

  // Query para obtener todos los mensajes
  const { data: allMessages = [] } = useQuery<Message[]>({
    queryKey: ["/api/conversations", selectedConversation?.id, "messages"],
    queryFn: () =>
      selectedConversation?.id
        ? apiGet<Message[]>(`/api/conversations/${selectedConversation.id}/messages`)
        : Promise.resolve([]),
    enabled: !!selectedConversation?.id,
    refetchInterval: 5000,
  });

  // Initialize with last 3 messages
  useEffect(() => {
    if (allMessages.length > 0 && selectedConversation) {
      const sortedMessages = [...allMessages].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
      const lastMessages = sortedMessages.slice(-INITIAL_MESSAGE_COUNT);
      setDisplayedMessages(lastMessages);
      setHasMoreMessages(sortedMessages.length > INITIAL_MESSAGE_COUNT);
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [allMessages.length, selectedConversation?.id]);

  // Load more messages when scrolling up
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMore || !hasMoreMessages) return;

    if (container.scrollTop < 50) {
      setIsLoadingMore(true);
      previousScrollHeight.current = container.scrollHeight;

      setTimeout(() => {
        const sortedMessages = [...allMessages].sort(
          (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
        );
        
        const currentOldestIndex = sortedMessages.findIndex(
          msg => msg.id === displayedMessages[0]?.id
        );
        
        if (currentOldestIndex > 0) {
          const startIndex = Math.max(0, currentOldestIndex - MESSAGES_PER_LOAD);
          const newMessages = sortedMessages.slice(startIndex, currentOldestIndex);
          
          setDisplayedMessages(prev => [...newMessages, ...prev]);
          setHasMoreMessages(startIndex > 0);
          
          setTimeout(() => {
            if (container) {
              const newScrollHeight = container.scrollHeight;
              container.scrollTop = newScrollHeight - previousScrollHeight.current;
            }
          }, 0);
        } else {
          setHasMoreMessages(false);
        }
        
        setIsLoadingMore(false);
      }, 500);
    }
  }, [allMessages, displayedMessages, isLoadingMore, hasMoreMessages]);

  // Mutation para enviar mensaje
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: number; content: string }) => {
      return apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        content,
        senderType: "agent",
        messageType: "text",
      });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", selectedConversation?.id, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      
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

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    sendMessageMutation.mutate({
      conversationId: selectedConversation.id,
      content: newMessage.trim()
    });
  };

  const formatDateSeparator = (date: string | Date) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return "Hoy";
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return "Ayer";
    } else {
      return messageDate.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: messageDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  const formatMessageTime = (date: string | Date) => {
    return new Date(date).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    
    messages.forEach(message => {
      const dateKey = new Date(message.sentAt).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
    });
    
    return groups;
  };

  const filteredConversations = conversations.filter(conv => {
    const searchLower = searchTerm.toLowerCase();
    const customerName = conv.customer?.name || conv.customerName || "";
    const customerPhone = conv.customer?.phone || conv.customerPhone || "";
    return (
      customerName.toLowerCase().includes(searchLower) ||
      customerPhone.includes(searchTerm)
    );
  });

  const messageGroups = groupMessagesByDate(displayedMessages);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Lista de conversaciones */}
      <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 bg-white border-r border-gray-200 h-full`}>
        {/* Header de búsqueda */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar conversaciones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No hay conversaciones</p>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation?.id === conversation.id ? 'bg-emerald-50' : ''
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white flex-shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {conversation.customer?.name || conversation.customerName || `Cliente ${conversation.customerId}`}
                      </h3>
                      {conversation.lastMessage && (
                        <span className="text-xs text-gray-500 ml-2">
                          {formatMessageTime(conversation.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {conversation.customer?.phone || conversation.customerPhone || 'Sin teléfono'}
                    </p>
                    {conversation.lastMessage && (
                      <p className="text-sm text-gray-500 truncate mt-1">
                        {conversation.lastMessage.content}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel de chat */}
      {selectedConversation ? (
        <div className="flex flex-col flex-1 h-full overflow-hidden">
          {/* Header del chat */}
          <div className="flex-shrink-0 bg-emerald-600 px-4 py-3 flex items-center justify-between shadow-md z-10">
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

          {/* Área de mensajes con scroll */}
          <div 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-scroll p-4 space-y-2"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              backgroundColor: '#efeae2',
              maxHeight: 'calc(100vh - 16rem)',
              minHeight: '400px'
            }}
          >
            {/* Loading indicator at top */}
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
              </div>
            )}

            {/* "Load more" indicator */}
            {!isLoadingMore && hasMoreMessages && displayedMessages.length > 0 && (
              <div className="flex justify-center py-2">
                <div className="text-xs text-gray-500 bg-white/80 px-3 py-1 rounded-full">
                  ↑ Desliza hacia arriba para cargar más mensajes
                </div>
              </div>
            )}

            {displayedMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-center">
                  No hay mensajes en esta conversación
                </p>
              </div>
            ) : (
              <>
                {Object.keys(messageGroups).map((dateKey) => (
                  <div key={dateKey}>
                    {/* Date separator */}
                    <div className="flex justify-center my-4">
                      <div className="bg-white/90 text-gray-600 text-xs px-3 py-1 rounded-lg shadow-sm">
                        {formatDateSeparator(messageGroups[dateKey][0].sentAt)}
                      </div>
                    </div>

                    {/* Messages */}
                    {messageGroups[dateKey].map((message, index) => {
                      const isAgent = message.senderType === 'agent';
                      const prevMessage = index > 0 ? messageGroups[dateKey][index - 1] : null;
                      const isFirstInGroup = !prevMessage || prevMessage.senderType !== message.senderType;

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isAgent ? 'justify-end' : 'justify-start'} ${
                            isFirstInGroup ? 'mt-3' : 'mt-1'
                          }`}
                        >
                          <div
                            className={`max-w-[70%] px-4 py-2 rounded-lg shadow-sm ${
                              isAgent
                                ? 'bg-emerald-500 text-white rounded-br-none'
                                : 'bg-white text-gray-900 rounded-bl-none'
                            }`}
                          >
                            <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                            <div className={`flex items-center justify-end space-x-1 mt-1 ${
                              isAgent ? 'text-emerald-100' : 'text-gray-500'
                            }`}>
                              <span className="text-xs">{formatMessageTime(message.sentAt)}</span>
                              {isAgent && (
                                <span className="text-xs">
                                  {message.deliveryStatus === 'delivered' ? (
                                    <CheckCheck className="h-3 w-3" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de mensaje */}
          <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={sendMessageMutation.isPending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendMessageMutation.isPending ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
          <div className="text-center text-gray-500">
            <div className="w-32 h-32 mx-auto mb-6 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-16 h-16 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">WhatsApp Business</h2>
            <p>Selecciona una conversación para comenzar a chatear</p>
          </div>
        </div>
      )}
    </div>
  );
}