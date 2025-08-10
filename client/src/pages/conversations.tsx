import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/queryClient";
import ConversationList from "@/components/conversations/conversation-list";
import ChatWindow from "@/components/conversations/chat-window";
import { ConversationWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ✅ Usar apiGet de queryClient para consistencia
  const { 
    data: conversations = [], 
    isLoading, 
    error,
    refetch 
  } = useQuery({
    queryKey: ["/api/conversations"],
    queryFn: () => apiGet<ConversationWithDetails[]>("/api/conversations"),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 30000,
    gcTime: 300000,
    refetchInterval: 60000, // Refrescar cada minuto
  });

  const handleSelectConversation = (conversation: ConversationWithDetails) => {
    setSelectedConversation(conversation);
  };

  const handleBackToList = () => {
    setSelectedConversation(null);
  };

  if (error) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error al cargar conversaciones</h3>
          <p className="text-red-600 text-sm mt-1">
            {error instanceof Error ? error.message : 'Error desconocido'}
          </p>
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            size="sm" 
            className="mt-2"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 h-[calc(100vh-200px)] md:h-[600px]">
        {isMobile ? (
          <>
            {!selectedConversation ? (
              <div className="col-span-1">
                <ConversationList
                  conversations={conversations}
                  isLoading={isLoading}
                  selectedConversation={selectedConversation}
                  onSelectConversation={handleSelectConversation}
                />
              </div>
            ) : (
              <div className="col-span-1">
                <div className="mb-3">
                  <Button 
                    variant="ghost" 
                    onClick={handleBackToList}
                    className="text-sm"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver a conversaciones
                  </Button>
                </div>
                <ChatWindow conversation={selectedConversation} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="lg:col-span-1">
              <ConversationList
                conversations={conversations}
                isLoading={isLoading}
                selectedConversation={selectedConversation}
                onSelectConversation={handleSelectConversation}
              />
            </div>
            
            <div className="lg:col-span-2">
              <ChatWindow conversation={selectedConversation} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
