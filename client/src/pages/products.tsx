import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Edit, Eye, ShoppingBag, ExternalLink } from "lucide-react";
import { Product } from "@shared/schema";
import { Link } from "wouter";

export default function Products() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["/api/products"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-secondary rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const services = Array.isArray(products) ? products.filter((product: Product) => product.category === "service") : [];
  const physicalProducts = Array.isArray(products) ? products.filter((product: Product) => product.category === "product") : [];

  return (
    <div className="space-y-6">
      {/* Header with title and catalog button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Administrar Productos</h1>
          <p className="text-muted-foreground mt-1">Gestiona el catálogo completo de productos y servicios</p>
        </div>
        <Button 
          variant="outline" 
          className="flex items-center gap-2"
          onClick={() => window.open('/public-catalog', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes')}
        >
          <ShoppingBag className="w-4 h-4" />
          Abrir Catálogo Público
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>

      {/* Product Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Array.isArray(products) ? products.length : 0}</div>
            <p className="text-sm text-muted-foreground mt-1">En catálogo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{services.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Servicios activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Productos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{physicalProducts.length}</div>
            <p className="text-sm text-muted-foreground mt-1">Productos físicos</p>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Productos y Servicios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.isArray(products) ? products.map((product: Product) => (
              <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-foreground">{product.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">{product.description}</p>
                    <div className="flex items-center space-x-2 mt-2 flex-wrap">
                      <Badge variant={product.category === "service" ? "secondary" : "default"}>
                        {product.category === "service" ? "Servicio" : "Producto"}
                      </Badge>
                      <Badge variant={product.status === "active" ? "default" : "secondary"}>
                        {product.status === "active" ? "Activo" : "Inactivo"}
                      </Badge>
                      {/* 🎁 FIDELIZACIÓN - Mostrar puntos de lealtad si existen */}
                      {(product as any).loyaltyPointsPropertyName && (product as any).loyaltyPointsValue && (
                        <Badge className="bg-warning/15 text-warning hover:bg-warning/10">
                          🎁 {(product as any).loyaltyPointsValue} {(product as any).loyaltyPointsPropertyName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-foreground">
                      ${parseFloat(product.price).toLocaleString('es-MX')}
                    </p>
                    <p className="text-sm text-muted-foreground">MXN</p>
                  </div>
                  
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )) : []}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
