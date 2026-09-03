import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, User, CheckCheck } from "lucide-react";
import { ConversationWithDetails } from "@shared/schema";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  isLoading: boolean;
  selectedConversation: ConversationWithDetails | null;
  onSelectConversation: (conversation: ConversationWithDetails) => void;
}

export default function ConversationList({ 
  conversations, 
  isLoading, 
  selectedConversation,
  onSelectConversation 
}: ConversationListProps) {
  const formatTime = (date: string | Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - messageDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    return `${Math.floor(diffInHours / 24)}d`;
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Conversaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-secondary rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-r border-border">
      <CardHeader className="bg-success/10 border-b border-success/40">
        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-success" />
          Conversaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[500px] overflow-y-auto p-0">
        <div className="divide-y divide-border">
          {conversations.map((conversation: ConversationWithDetails) => (
            <div 
              key={conversation.id}
              onClick={() => onSelectConversation(conversation)}
              className={`flex items-center space-x-3 p-4 cursor-pointer transition-all duration-200 hover:bg-subtle ${
                selectedConversation?.id === conversation.id 
                  ? "bg-success/10 border-r-4 border-success" 
                  : conversation.unreadCount > 0 
                    ? "bg-accent" 
                    : ""
              }`}
            >
              {/* Avatar with status indicator */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 bg-primary/80 rounded-full flex items-center justify-center shadow-sm">
                  <User className="text-white h-6 w-6" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-success rounded-full border-2 border-white"></div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-sm truncate ${
                    conversation.unreadCount > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"
                  }`}>
                    {conversation.customer?.name || 'Cliente sin nombre'}
                  </p>
                  <div className="flex items-center gap-1">
                    {conversation.lastMessageAt && (
                      <p className="text-xs text-muted-foreground">
                        {formatTime(conversation.lastMessageAt)}
                      </p>
                    )}
                    {conversation.unreadCount > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 bg-success text-success-foreground text-xs rounded-full font-bold">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1 mb-1">
                  {conversation.lastMessage?.senderType === "staff" && (
                    <CheckCheck className="h-3 w-3 text-primary flex-shrink-0" />
                  )}
                  <p className={`text-xs truncate flex-1 ${
                    conversation.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                  }`}>
                    {conversation.lastMessage?.content || "Sin mensajes"}
                  </p>
                </div>
                
                {conversation.order && (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                      {conversation.order.orderNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {conversations.length === 0 && (
            <div className="text-center py-8 px-4">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">No hay conversaciones activas</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
