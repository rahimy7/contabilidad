import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Radio, Download } from "lucide-react";
import CreateOrderModal from "@/components/orders/create-order-modal";
import BulkMessageModal from "@/components/whatsapp/bulk-message-modal";

export default function QuickActions() {
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [isBulkMessageModalOpen, setIsBulkMessageModalOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Acciones Rápidas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Button 
            variant="ghost" 
            className="w-full justify-start h-auto p-3 hover:bg-subtle"
            onClick={() => setIsCreateOrderModalOpen(true)}
          >
            <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-lg flex items-center justify-center mr-3">
              <Plus className="text-primary h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-foreground">Crear Pedido Manual</span>
          </Button>

          <Button 
            variant="ghost" 
            className="w-full justify-start h-auto p-3 hover:bg-subtle"
            onClick={() => setIsBulkMessageModalOpen(true)}
          >
            <div className="w-8 h-8 whatsapp-bg bg-opacity-10 rounded-lg flex items-center justify-center mr-3">
              <Radio className="whatsapp-text h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-foreground">Mensaje Masivo</span>
          </Button>

          <Button 
            variant="ghost" 
            className="w-full justify-start h-auto p-3 hover:bg-subtle"
          >
            <div className="w-8 h-8 warning-bg bg-opacity-10 rounded-lg flex items-center justify-center mr-3">
              <Download className="warning-text h-4 w-4" />
            </div>
            <span className="text-sm font-medium text-foreground">Exportar Reportes</span>
          </Button>
        </div>

        <CreateOrderModal
          isOpen={isCreateOrderModalOpen}
          onClose={() => setIsCreateOrderModalOpen(false)}
        />

        <BulkMessageModal
          isOpen={isBulkMessageModalOpen}
          onClose={() => setIsBulkMessageModalOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
