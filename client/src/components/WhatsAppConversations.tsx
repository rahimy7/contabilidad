import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiGet, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, Phone, User, Check, CheckCheck } from "lucide-react";
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
  const [displayedMessages, setDisplayedMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousScrollHeight = useRef<number>(0);
  const { toast } = useToast();

  const INITIAL_MESSAGE_COUNT = 3;
  const MESSAGES_PER_LOAD = 10;

  // Fetch all messages
  const { data: allMessages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversation?.id, "messages"],
    queryFn: () =>
      conversation?.id
        ? apiGet<Message[]>(`/api/conversations/${conversation.id}/messages`)
        : Promise.resolve([]),
    enabled: !!conversation?.id,
    refetchInterval: 5000,
  });

  // Fetch customer details
  const { data: customerDetails } = useQuery<CustomerDetails | null>({
    queryKey: ["/api/customers", conversation?.customer.id, "details"],
    queryFn: () =>
      conversation?.customer.id
        ? apiGet<CustomerDetails>(`/api/customers/${conversation.customer.id}/details`)
        : Promise.resolve(null),
    enabled: !!conversation?.customer.id,
  });

  // Initialize with last 3 messages
  useEffect(() => {
    if (allMessages.length > 0) {
      const sortedMessages = [...allMessages].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
      const lastMessages = sortedMessages.slice(-INITIAL_MESSAGE_COUNT);
      setDisplayedMessages(lastMessages);
      setHasMoreMessages(sortedMessages.length > INITIAL_MESSAGE_COUNT);
      
      // Scroll to bottom on initial load
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [allMessages.length, conversation?.id]);

  // Load more messages when scrolling up
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMore || !hasMoreMessages) return;

    // Check if scrolled to top (with 50px threshold)
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
          
          // Maintain scroll position
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

  // Send message mutation
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
      
      // Scroll to bottom after sending
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
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

  // Mark as read
  useEffect(() => {
    if (conversation?.id) {
      apiRequest("POST", `/api/conversations/${conversation.id}/mark-read`, {})
        .catch(console.error);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  }, [conversation?.id]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate(newMessage.trim());
    }
  };

  // Format date for separators (WhatsApp style)
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

  // Group messages by date
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

  const messageGroups = groupMessagesByDate(displayedMessages);

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <CardHeader className="bg-green-50 border-b border-green-100 pb-4 flex-shrink-0">
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
                <span className="font-medium">{conversation.customer.phone}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Messages */}
      <CardContent 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-scroll scroll-smooth"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundColor: '#efeae2',
          maxHeight: '500px',
          minHeight: '300px'
        }}
      >
        {/* Contenedor interno con padding y min-height para forzar scroll */}
        <div className="min-h-full flex flex-col justify-end p-4 space-y-2">
        {/* Loading indicator at top */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500"></div>
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

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <MessageCircle className="h-16 w-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-center">
              No hay mensajes aún<br />
              <span className="text-sm">Envía el primer mensaje para iniciar la conversación</span>
            </p>
          </div>
        ) : (
          <>
            {Object.keys(messageGroups).map((dateKey) => (
              <div key={dateKey}>
                {/* Date separator - WhatsApp style */}
                <div className="flex justify-center my-4">
                  <div className="bg-white/90 text-gray-600 text-xs px-3 py-1 rounded-lg shadow-sm">
                    {formatDateSeparator(messageGroups[dateKey][0].sentAt)}
                  </div>
                </div>

                {/* Messages for this date */}
                {messageGroups[dateKey].map((message, index) => {
                  const isAgent = message.senderType === "agent";
                  const prevMessage = index > 0 ? messageGroups[dateKey][index - 1] : null;
                  const isFirstInGroup = !prevMessage || prevMessage.senderType !== message.senderType;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isAgent ? "justify-end" : "justify-start"} ${
                        isFirstInGroup ? "mt-3" : "mt-1"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                          isAgent
                            ? "bg-green-500 text-white rounded-br-none"
                            : "bg-white text-gray-900 rounded-bl-none"
                        }`}
                      >
                        <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
                        <div
                          className={`flex items-center justify-end space-x-1 mt-1 ${
                            isAgent ? "text-green-100" : "text-gray-500"
                          }`}
                        >
                          <span className="text-xs">{formatMessageTime(message.sentAt)}</span>
                          {isAgent && (
                            <span className="text-xs">
                              {message.deliveryStatus === "delivered" ? (
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
      </CardContent>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-white flex-shrink-0">
        <form onSubmit={handleSendMessage} className="flex space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            type="submit"
            disabled={!newMessage.trim() || sendMessageMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sendMessageMutation.isPending ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}