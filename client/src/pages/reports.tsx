import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { DatePickerWithRange } from "@/components/ui/date-picker";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download, TrendingUp, Calendar, DollarSign, Users, Package, FileBarChart, Filter, UserCheck, AlertTriangle, TrendingDown } from "lucide-react";
import { addDays, format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuth } from "@/contexts/AuthContext";

const parseCurrency = (value: any): number => {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  if (typeof value === 'string') {
    const cleanedValue = value.replace(/[^0-9.-]+/g, "");
    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export default function Reports() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // ✅ Only fetch store data if user has a storeId (not super_admin)
  const hasStoreContext = !!user?.storeId;

  const { data: orders } = useQuery({
    queryKey: ["/api/orders"],
    enabled: hasStoreContext,
  });

  const { data: employees } = useQuery({
    queryKey: ["/api/employees"],
    enabled: hasStoreContext,
  });

  const { data: customers } = useQuery({
    queryKey: ["/api/customers"],
    enabled: hasStoreContext,
  });

  const { data: products } = useQuery({
    queryKey: ["/api/products"],
    enabled: hasStoreContext,
  });

  const { data: metrics } = useQuery({
    queryKey: ["/api/dashboard/metrics"],
  });

  // Filter data based on selected criteria
  const filteredOrders = React.useMemo(() => {
    if (!Array.isArray(orders)) return [];
    
    let filtered = orders;
    
    // Filter by status
    if (selectedStatus !== "all") {
      filtered = filtered.filter((order: any) => order.status === selectedStatus);
    }
    
    // Filter by date range
    if (dateRange.from && dateRange.to) {
      filtered = filtered.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= dateRange.from && orderDate <= dateRange.to;
      });
    }
    
    return filtered;
  }, [orders, selectedStatus, dateRange]);

  // Calculate analytics data
  const totalOrders = filteredOrders.length;
  const completedOrders = filteredOrders.filter((order: any) => order.status === "completed").length;
  const totalRevenue = filteredOrders.reduce((sum: number, order: any) => 
    order.status === "completed" ? sum + parseCurrency(order.totalAmount) : sum, 0);
  const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;
  const completionRate = totalOrders > 0 ? (completedOrders / totalOrders * 100).toFixed(1) : "0";

  // Performance by employee (technicians)
  const employeePerformance = React.useMemo(() => {
    if (!Array.isArray(employees) || !Array.isArray(filteredOrders)) return [];
    
    // Filter employees that are technicians or field workers
    const technicians = employees.filter((employee: any) => 
      employee.department === "technical" || 
      employee.position?.toLowerCase().includes("tecnico") ||
      employee.position?.toLowerCase().includes("technician") ||
      employee.user?.status === "active"
    );
    
    return technicians.map((employee: any) => {
      const employeeOrders = filteredOrders.filter((order: any) => 
        order.assignedEmployeeId === employee.id || 
        order.assignedUserId === employee.userId ||
        order.technicianId === employee.id ||
        order.employeeId === employee.id
      );
      const completed = employeeOrders.filter((order: any) => order.status === "completed").length;
      const revenue = employeeOrders.reduce((sum: number, order: any) => 
        order.status === "completed" ? sum + parseCurrency(order.totalAmount) : sum, 0);
      
      return {
        id: employee.id,
        employeeId: employee.employeeId,
        name: employee.user?.name || "Sin usuario asignado",
        position: employee.position || "Técnico",
        department: employee.department || "Technical",
        orders: employeeOrders.length,
        completed,
        revenue,
        completionRate: employeeOrders.length > 0 ? (completed / employeeOrders.length * 100).toFixed(1) : "0",
        phone: employee.user?.phone || null,
        email: employee.user?.email || null,
        hireDate: employee.createdAt,
        isActive: employee.user?.status === "active",
        maxDailyOrders: employee.maxDailyOrders,
        currentOrders: employee.currentOrders,
        skillLevel: employee.skillLevel,
        serviceRadius: employee.serviceRadius
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [employees, filteredOrders]);

  // Employee stats for overview
  const employeeStats = React.useMemo(() => {
    if (!Array.isArray(employees)) return { total: 0, active: 0, technicians: 0 };
    
    const activeEmployees = employees.filter((emp: any) => emp.user?.status === "active");
    const technicians = employees.filter((emp: any) => 
      emp.department === "technical" || 
      emp.position?.toLowerCase().includes("tecnico") ||
      emp.position?.toLowerCase().includes("technician")
    );
    
    return {
      total: employees.length,
      active: activeEmployees.length,
      technicians: technicians.length
    };
  }, [employees]);

  // Orders by status chart data
  const statusChartData = React.useMemo(() => {
    const statuses = ["pending", "assigned", "processing", "completed", "cancelled"];
    return statuses.map((status) => {
      const count = filteredOrders.filter((order: any) => order.status === status).length;
      const statusLabels: Record<string, string> = {
        pending: "Pendiente",
        assigned: "Asignado", 
        processing: "En Proceso",
        completed: "Completado",
        cancelled: "Cancelado"
      };
      
      return {
        name: statusLabels[status],
        value: count,
        color: getStatusColor(status)
      };
    });
  }, [filteredOrders]);

  // Revenue trend data (last 7 days)
  const revenueTrendData = React.useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(new Date(), -6 + i);
      const dayOrders = filteredOrders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return format(orderDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
      });
      const dayRevenue = dayOrders.reduce((sum: number, order: any) => 
        order.status === "completed" ? sum + parseCurrency(order.totalAmount) : sum, 0);
      
      return {
        date: format(date, 'MMM dd'),
        revenue: dayRevenue,
        orders: dayOrders.length
      };
    });
    
    return last7Days;
  }, [filteredOrders]);

  // Product performance
  const productPerformance = React.useMemo(() => {
    if (!Array.isArray(products) || !Array.isArray(filteredOrders)) return [];

    return products.map((product: any) => {
      const productOrders = filteredOrders.filter((order: any) =>
        order.items?.some((item: any) => item.productId === product.id)
      );
      const revenue = productOrders.reduce((sum: number, order: any) =>
        order.status === "completed" ? sum + parseCurrency(order.totalAmount) : sum, 0);

      return {
        name: product.name,
        orders: productOrders.length,
        revenue,
        category: product.category
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [products, filteredOrders]);

  // Today's sales by product (vendido hoy)
  const todaysSalesByProduct = React.useMemo(() => {
    if (!Array.isArray(products) || !Array.isArray(orders)) return [];

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const todayOrders = orders.filter((order: any) => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= todayStart && orderDate < todayEnd && order.status === "completed";
    });

    const salesByProduct: Record<string, { name: string; quantity: number; revenue: number; productId: number }> = {};

    todayOrders.forEach((order: any) => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const product = products.find((p: any) => p.id === item.productId);
          if (product) {
            if (!salesByProduct[item.productId]) {
              salesByProduct[item.productId] = {
                name: product.name,
                quantity: 0,
                revenue: 0,
                productId: product.id
              };
            }
            salesByProduct[item.productId].quantity += Number(item.quantity || 0);
            salesByProduct[item.productId].revenue += parseCurrency(item.totalPrice);
          }
        });
      }
    });

    return Object.values(salesByProduct).sort((a, b) => b.quantity - a.quantity);
  }, [products, orders]);

  // Zero stock products (productos con stock en cero)
  const zeroStockProducts = React.useMemo(() => {
    if (!Array.isArray(products)) return [];

    return products.filter((product: any) => {
      const stock = parseInt(product.stock_quantity) || 0;
      return stock === 0;
    }).map((product: any) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: parseFloat(product.price) || 0
    }));
  }, [products]);

  // Inventory metrics
  const inventoryMetrics = React.useMemo(() => {
    if (!Array.isArray(products)) {
      return {
        totalProducts: 0,
        totalStock: 0,
        zeroStockCount: 0,
        lowStockCount: 0,
        totalInventoryValue: 0,
        averageStockPerProduct: 0
      };
    }

    const totalProducts = products.length;
    const totalStock = products.reduce((sum: number, p: any) => sum + (parseInt(p.stock_quantity) || 0), 0);
    const zeroStockCount = products.filter((p: any) => (parseInt(p.stock_quantity) || 0) === 0).length;
    const lowStockCount = products.filter((p: any) => {
      const stock = parseInt(p.stock_quantity) || 0;
      return stock > 0 && stock <= 10;
    }).length;
    const totalInventoryValue = products.reduce((sum: number, p: any) =>
      sum + ((parseInt(p.stock_quantity) || 0) * (parseFloat(p.price) || 0)), 0);
    const averageStockPerProduct = totalProducts > 0 ? Math.round(totalStock / totalProducts) : 0;

    return {
      totalProducts,
      totalStock,
      zeroStockCount,
      lowStockCount,
      totalInventoryValue,
      averageStockPerProduct
    };
  }, [products]);

  function getStatusColor(status: string) {
    const colors: Record<string, string> = {
      pending: "#ef4444",
      assigned: "#3b82f6",
      processing: "#f59e0b",
      completed: "#10b981",
      cancelled: "#6b7280"
    };
    return colors[status] || "#6b7280";
  }

  function handlePeriodChange(period: string) {
    setSelectedPeriod(period);
    const now = new Date();

    switch (period) {
      case "today":
        setDateRange({ from: now, to: now });
        break;
      case "thisWeek":
        setDateRange({
          from: addDays(now, -7),
          to: now
        });
        break;
      case "thisMonth":
        setDateRange({
          from: startOfMonth(now),
          to: endOfMonth(now)
        });
        break;
      case "lastMonth":
        const lastMonth = subMonths(now, 1);
        setDateRange({
          from: startOfMonth(lastMonth),
          to: endOfMonth(lastMonth)
        });
        break;
    }
  }

  // Export inventory to CSV
  const handleExportInventory = () => {
    if (!Array.isArray(products)) return;

    let csvContent = "data:text/csv;charset=utf-8,";

    // Headers
    const headers = ["Producto", "Stock", "Precio Unit.", "Valor Total", "Categoría"];
    csvContent += headers.join(",") + "\n";

    // Data rows
    products.forEach((product: any) => {
      const stock = parseInt(product.stock_quantity) || 0;
      const price = parseFloat(product.price) || 0;
      const totalValue = stock * price;
      const row = [
        `"${product.name}"`,
        stock,
        `$${price.toFixed(2)}`,
        `$${totalValue.toFixed(2)}`,
        product.category || "Sin categoría"
      ];
      csvContent += row.join(",") + "\n";
    });

    // Summary row
    csvContent += "\n,RESUMEN,,,\n";
    csvContent += `Total Productos,${inventoryMetrics.totalProducts},,Total Valor,$${inventoryMetrics.totalInventoryValue.toFixed(2)}\n`;
    csvContent += `Total Stock,${inventoryMetrics.totalStock},,Stock Promedio,${inventoryMetrics.averageStockPerProduct}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export today's sales to CSV
  const handleExportTodaysSales = () => {
    if (todaysSalesByProduct.length === 0) {
      alert("No hay ventas de hoy para exportar");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";

    // Headers
    const headers = ["Producto", "Cantidad Vendida", "Ingresos"];
    csvContent += headers.join(",") + "\n";

    // Data rows
    todaysSalesByProduct.forEach((sale: any) => {
      const revenue = sale.revenue || 0;
      const row = [
        `"${sale.name}"`,
        sale.quantity || 0,
        `$${revenue.toFixed(2)}`
      ];
      csvContent += row.join(",") + "\n";
    });

    // Summary row
    const totalQty = todaysSalesByProduct.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
    const totalRevenue = todaysSalesByProduct.reduce((sum: number, s: any) => sum + (s.revenue || 0), 0);
    csvContent += "\nRESUMEN,,,\n";
    csvContent += `Total Items Vendidos,${totalQty},$${totalRevenue.toFixed(2)}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ventas-hoy_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Export inventory with stock to PDF
  const handleExportInventoryPDF = () => {
    if (!Array.isArray(products)) return;

    // Filter products with stock > 0
    const productsWithStock = products.filter((product: any) => {
      const stock = parseInt(product.stock_quantity) || 0;
      return stock > 0;
    });

    if (productsWithStock.length === 0) {
      alert("No hay productos con stock para exportar");
      return;
    }

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text("Reporte de Inventario con Stock", 14, 20);

    // Date
    doc.setFontSize(11);
    doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);

    // Prepare table data
    const tableData = productsWithStock.map((product: any) => {
      const stock = parseInt(product.stock_quantity) || 0;
      const price = parseFloat(product.price) || 0;
      const totalValue = stock * price;

      return [
        product.id.toString(),
        product.name,
        stock.toString(),
        `$${price.toFixed(2)}`,
        `$${totalValue.toFixed(2)}`,
        product.category || "Sin categoría"
      ];
    });

    // Calculate totals
    const totalStock = productsWithStock.reduce((sum: number, p: any) =>
      sum + (parseInt(p.stock_quantity) || 0), 0);
    const totalValue = productsWithStock.reduce((sum: number, p: any) => {
      const stock = parseInt(p.stock_quantity) || 0;
      const price = parseFloat(p.price) || 0;
      return sum + (stock * price);
    }, 0);

    // Add table
    autoTable(doc, {
      head: [['ID', 'Producto', 'Stock', 'Precio Unit.', 'Valor Total', 'Categoría']],
      body: tableData,
      startY: 35,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'left', cellWidth: 60 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'left', cellWidth: 'auto' }
      }
    });

    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY || 35;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("RESUMEN:", 14, finalY + 10);
    doc.setFont(undefined, 'normal');
    doc.text(`Total de Productos: ${productsWithStock.length}`, 14, finalY + 17);
    doc.text(`Stock Total: ${totalStock} unidades`, 14, finalY + 24);
    doc.text(`Valor Total del Inventario: $${totalValue.toFixed(2)}`, 14, finalY + 31);

    // Save PDF
    doc.save(`inventario-con-stock_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  }

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileBarChart className="h-5 w-5 mr-2" />
            Reportes y Analytics Avanzados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4" />
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoy</SelectItem>
                  <SelectItem value="thisWeek">Esta Semana</SelectItem>
                  <SelectItem value="thisMonth">Este Mes</SelectItem>
                  <SelectItem value="lastMonth">Mes Anterior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full md:w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los Estados</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="assigned">Asignado</SelectItem>
                  <SelectItem value="processing">En Proceso</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" className="w-full md:w-auto md:ml-auto">
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Exportar Datos</span>
              <span className="sm:hidden">Exportar</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Total Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-sm text-gray-500 mt-1">Período seleccionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              Tasa de Completitud
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-sm text-gray-500 mt-1">{completedOrders} completados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <DollarSign className="h-4 w-4 mr-2" />
              Ingresos Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toLocaleString('es-MX')}</div>
            <p className="text-sm text-green-600 mt-1">Período seleccionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
              <UserCheck className="h-4 w-4 mr-2" />
              Empleados Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employeeStats.active}</div>
            <p className="text-sm text-gray-500 mt-1">{employeeStats.technicians} técnicos</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="text-xs md:text-sm">Resumen</TabsTrigger>
          <TabsTrigger value="employees" className="text-xs md:text-sm">Empleados</TabsTrigger>
          <TabsTrigger value="products" className="text-xs md:text-sm">Productos</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs md:text-sm">Inventario</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs md:text-sm">Tendencias</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 md:space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Status Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Tendencia de Ingresos (7 días)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={revenueTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${value}`, 'Ingresos']} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Desglose por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {statusChartData.map((status) => {
                  const percentage = totalOrders > 0 ? (status.value / totalOrders * 100).toFixed(1) : "0";
                  return (
                    <div key={status.name} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: status.color }}
                        />
                        <span className="font-medium">{status.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{status.value}</div>
                        <div className="text-sm text-gray-500">{percentage}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-6">
          {/* Employee Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Total Empleados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{employeeStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Empleados Activos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{employeeStats.active}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">
                  Técnicos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{employeeStats.technicians}</div>
              </CardContent>
            </Card>
          </div>

          {/* Employee Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por Empleado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {employeePerformance.map((employee) => (
                  <div key={employee.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-600">
                          {employee.employeeId || employee.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{employee.name}</h3>
                        <p className="text-sm text-gray-500">{employee.position} • {employee.department}</p>
                        <p className="text-xs text-gray-400">
                          {employee.orders} pedidos • {employee.currentOrders}/{employee.maxDailyOrders} actuales
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${employee.revenue.toLocaleString('es-MX')}</div>
                      <div className="text-sm text-gray-500">{employee.completionRate}% completitud</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant={parseFloat(employee.completionRate) >= 80 ? "default" : "secondary"}>
                          {employee.completed} completados
                        </Badge>
                        <Badge variant={employee.isActive ? "default" : "secondary"}>
                          {employee.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                        {employee.skillLevel && (
                          <Badge variant="outline">
                            Nivel {employee.skillLevel}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {employeePerformance.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No hay empleados técnicos para mostrar
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rendimiento por Producto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {productPerformance.slice(0, 10).map((product) => (
                  <div key={product.name} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-500">{product.orders} pedidos</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">${product.revenue.toLocaleString('es-MX')}</div>
                      <Badge variant={product.category === "service" ? "secondary" : "default"}>
                        {product.category === "service" ? "Servicio" : "Producto"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          {/* Inventory Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <Package className="h-4 w-4 mr-2" />
                  Stock Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inventoryMetrics.totalStock}</div>
                <p className="text-sm text-gray-500 mt-1">{inventoryMetrics.totalProducts} productos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <DollarSign className="h-4 w-4 mr-2" />
                  Valor Total Inventario
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${inventoryMetrics.totalInventoryValue.toLocaleString('es-MX')}</div>
                <p className="text-sm text-gray-500 mt-1">Valoración actual</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Stock Crítico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{inventoryMetrics.zeroStockCount}</div>
                <p className="text-sm text-gray-500 mt-1">{inventoryMetrics.lowStockCount} con stock bajo</p>
              </CardContent>
            </Card>
          </div>

          {/* Today's Sales by Product */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Vendido Hoy (Por Producto)</CardTitle>
              {todaysSalesByProduct.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportTodaysSales}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {todaysSalesByProduct.length > 0 ? (
                <div className="space-y-4">
                  {todaysSalesByProduct.map((sale) => {
                    const saleRevenue = Number(sale.revenue || 0);
                    const displayRevenue = isNaN(saleRevenue) ? '0.00' : saleRevenue.toFixed(2);
                    return (
                      <div key={sale.productId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Package className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{sale.name}</h3>
                            <p className="text-sm text-gray-500">{sale.quantity} unidades</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">${displayRevenue}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No hay ventas registradas hoy
                </div>
              )}
            </CardContent>
          </Card>

          {/* Zero Stock Products Alert */}
          {zeroStockProducts.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center text-red-700">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Productos con Stock en Cero ({zeroStockProducts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {zeroStockProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-white rounded border border-red-200">
                      <div>
                        <h3 className="font-medium text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-500">Categoría: {product.category || "Sin categoría"}</p>
                      </div>
                      <Badge variant="destructive">Sin Stock</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Products Inventory */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Inventario Completo</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportInventoryPDF}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportInventory}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-4 py-2 text-left font-semibold">Producto</th>
                      <th className="px-4 py-2 text-center font-semibold">Stock</th>
                      <th className="px-4 py-2 text-right font-semibold">Precio Unit.</th>
                      <th className="px-4 py-2 text-right font-semibold">Valor Total</th>
                      <th className="px-4 py-2 text-left font-semibold">Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(products) && products.length > 0 ? (
                      products.map((product) => {
                        const stock = parseInt(product.stock_quantity) || 0;
                        const price = parseFloat(product.price) || 0;
                        const totalValue = stock * price;
                        const isLowStock = stock > 0 && stock <= 10;
                        const isZeroStock = stock === 0;

                        return (
                          <tr key={product.id} className={`border-b ${isZeroStock ? "bg-red-50" : isLowStock ? "bg-yellow-50" : ""}`}>
                            <td className="px-4 py-3 font-medium text-gray-900">{product.name}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={isZeroStock ? "destructive" : isLowStock ? "secondary" : "default"}>
                                {stock}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">${price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-semibold">${totalValue.toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-600">{product.category || "Sin categoría"}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                          No hay productos en el inventario
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tendencias de Pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={revenueTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" name="Pedidos" />
                  <Bar yAxisId="right" dataKey="revenue" fill="#10b981" name="Ingresos ($)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Export Options */}
          <Card>
            <CardHeader>
              <CardTitle>Exportar Reportes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button variant="outline" className="justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Reporte Excel
                </Button>
                <Button variant="outline" className="justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Reporte PDF
                </Button>
                <Button variant="outline" className="justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Datos CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}