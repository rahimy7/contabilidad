import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, 
  Mail, 
  Smartphone, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  RefreshCw 
} from "lucide-react";

export default function NotificationHistory({ history, onRefresh }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'delivered': return <CheckCircle className="w-4 h-4 text-blue-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getChannelIcon = (channel) => {
    switch (channel) {
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'email': return <Mail className="w-4 h-4 text-blue-600" />;
      case 'app': return <Smartphone className="w-4 h-4 text-purple-600" />;
      default: return null;
    }
  };

  const groupedHistory = history.reduce((acc, item) => {
    if (!acc[item.channel]) acc[item.channel] = [];
    acc[item.channel].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Historial de Notificaciones</h3>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todas ({history.length})</TabsTrigger>
          <TabsTrigger value="whatsapp">
            WhatsApp ({groupedHistory.whatsapp?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="email">
            Email ({groupedHistory.email?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="app">
            App ({groupedHistory.app?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <HistoryList items={history} />
        </TabsContent>
        
        {Object.entries(groupedHistory).map(([channel, items]) => (
          <TabsContent key={channel} value={channel}>
            <HistoryList items={items} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

const HistoryList = ({ items }) => (
  <div className="space-y-3">
    {items.map((item) => (
      <Card key={item.id}>
        <CardContent className="pt-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getChannelIcon(item.channel)}
                <h4 className="font-medium">{item.title}</h4>
                <Badge variant="outline" className="text-xs">
                  Orden #{item.orderId}
                </Badge>
              </div>
              
              <p className="text-sm text-gray-600 mb-2">{item.message}</p>
              
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Para: {item.recipientType}</span>
                <span>Enviado: {new Date(item.createdAt).toLocaleString()}</span>
                {item.sentAt && (
                  <span>Entregado: {new Date(item.sentAt).toLocaleString()}</span>
                )}
              </div>
              
              {item.errorMessage && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  Error: {item.errorMessage}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {getStatusIcon(item.status)}
              <Badge variant={
                item.status === 'sent' || item.status === 'delivered' 
                  ? 'default' 
                  : item.status === 'failed' 
                    ? 'destructive' 
                    : 'secondary'
              }>
                {item.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
    
    {items.length === 0 && (
      <div className="text-center py-8 text-gray-500">
        <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No hay notificaciones en este canal</p>
      </div>
    )}
  </div>
);

function getChannelIcon(channel: any): React.ReactNode {
    throw new Error('Function not implemented.');
}
function getStatusIcon(status: any): React.ReactNode {
    throw new Error('Function not implemented.');
}

