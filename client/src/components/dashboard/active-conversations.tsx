import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { ConversationWithDetails } from "@shared/schema";

export default function ActiveConversations() {
  const { data: conversations, isLoading } = useQuery({
    queryKey: ["/api/conversations"],
  });

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
      <Card>
        <CardHeader>
          <CardTitle>Conversaciones Activas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-secondary rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show only active conversations with recent activity
  const activeConversations = conversations?.slice(0, 5) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Conversaciones Activas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activeConversations.map((conversation: ConversationWithDetails) => (
            <div 
              key={conversation.id} 
              className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                conversation.unreadCount > 0 ? "bg-subtle" : "hover:bg-subtle"
              }`}
            >
              <div className="w-10 h-10 whatsapp-bg rounded-full flex items-center justify-center">
                <MessageCircle className="text-white h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {conversation.customer?.name || 'Cliente sin nombre'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {conversation.lastMessage?.content?.slice(0, 40) || "Sin mensajes"}
                  {conversation.lastMessage?.content && conversation.lastMessage.content.length > 40 ? "..." : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {conversation.lastMessageAt ? formatTime(conversation.lastMessageAt) : ""}
                </p>
                {conversation.unreadCount > 0 && (
                  <span className="w-2 h-2 bg-destructive rounded-full block ml-auto mt-1"></span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-border mt-4">
          <Link href="/conversations" className="text-primary hover:text-primary-dark text-sm font-medium">
            Ver todas las conversaciones →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
