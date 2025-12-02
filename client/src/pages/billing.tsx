import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  DollarSign,
  Receipt,
  Calendar,
  FileText,
  Download,
  Eye,
  AlertCircle,
  Zap,
  TrendingUp,
  Send,
} from "lucide-react";
import { useState } from "react";

interface Invoice {
  id: number;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  issuedDate?: string;
  dueDate?: string;
  paidDate?: string;
  pdfUrl?: string;
  createdAt: string;
}

interface BillingData {
  store: {
    id: number;
    name: string;
    subscription: string;
    subscriptionExpiry?: string;
  };
  billing: {
    nextBillingDate?: string;
    billingCycle: string;
    paymentStatus: string;
    lastPaymentDate?: string;
  };
  invoices: {
    outstanding: number;
    totalDue: number;
    recentInvoices: Invoice[];
  };
  credits: {
    available: number;
    used: number;
    percentage: number;
  };
}

interface BillingSummary {
  outstandingInvoices: number;
  totalDue: number;
  averageInvoiceAmount: number;
  nextPaymentAmount: number;
  nextPaymentDate?: string;
  credits: {
    available: number;
    used: number;
    percentage: number;
  };
}

export default function Billing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "credits">("overview");

  // Obtener datos de facturación principal
  const { data: billingData, isLoading: billingLoading } = useQuery<BillingData>({
    queryKey: ["/api/billing"],
  });

  // Obtener resumen de facturación
  const { data: billingSummary, isLoading: summaryLoading } = useQuery<BillingSummary>({
    queryKey: ["/api/billing/summary"],
  });

  // Obtener créditos detallados
  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ["/api/billing/credits"],
  });

  // Obtener listado de facturas
  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/billing/invoices"],
  });

  if (billingLoading || summaryLoading) {
    return (
      <div className="p-6">
        <div className="h-screen flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-600">Loading billing information...</p>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(typeof amount === "string" ? parseFloat(amount) : amount);
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("es-MX");
  };

  const handleInitiatePayment = async (invoiceId: number) => {
    try {
      const returnUrl = `${window.location.origin}/billing?invoice=${invoiceId}&status=paid`;

      const response = await fetch(
        `/api/billing/invoices/${invoiceId}/payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnUrl }),
        }
      );

      if (!response.ok) throw new Error("Failed to initiate payment");

      const { orderUrl } = await response.json();

      if (orderUrl) {
        window.location.href = orderUrl;
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to initiate payment",
        variant: "destructive",
      });
    }
  };

  const handleViewInvoice = (invoiceId: number) => {
    window.open(`/api/billing/invoices/${invoiceId}`, "_blank");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      issued: "default",
      sent: "default",
      paid: "default",
      partially_paid: "outline",
      overdue: "destructive",
      cancelled: "secondary",
    };

    const labels: Record<string, string> = {
      draft: "Borrador",
      issued: "Emitida",
      sent: "Enviada",
      paid: "Pagada",
      partially_paid: "Parcialmente Pagada",
      overdue: "Vencida",
      cancelled: "Cancelada",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const planBadgeColor = {
    free: "secondary",
    basic: "default",
    premium: "default",
    enterprise: "default",
  } as Record<string, "default" | "secondary" | "destructive" | "outline">;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-gray-600 mt-2">
          Manage your subscription, invoices, and AI credits
        </p>
      </div>

      {/* Alert de pagos pendientes */}
      {billingSummary?.outstandingInvoices && billingSummary.outstandingInvoices > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            You have <strong>{billingSummary.outstandingInvoices} outstanding invoice(s)</strong> totaling{" "}
            <strong>{formatCurrency(billingSummary.totalDue)}</strong>
            . Due on{" "}
            <strong>{formatDate(billingSummary.nextPaymentDate)}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeTab === "overview"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeTab === "invoices"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setActiveTab("credits")}
          className={`pb-2 px-4 font-medium transition-colors ${
            activeTab === "credits"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          AI Credits
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Plan Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Current Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600">Plan Type</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-2xl font-bold capitalize">
                    {billingData?.store.subscription}
                  </p>
                  <Badge
                    variant={planBadgeColor[billingData?.store.subscription || "free"] || "default"}
                  >
                    Active
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">Billing Cycle</p>
                <p className="text-2xl font-bold mt-2 capitalize">
                  {billingData?.billing.billingCycle}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Next Billing Date</p>
                <p className="text-2xl font-bold mt-2">
                  {formatDate(billingData?.billing.nextBillingDate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Payment Status</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`w-3 h-3 rounded-full ${
                    billingData?.billing.paymentStatus === "paid"
                      ? "bg-green-500"
                      : "bg-orange-500"
                  }`}></span>
                  <p className="font-semibold capitalize">
                    {billingData?.billing.paymentStatus}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
                <DollarSign className="w-4 h-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(billingSummary?.totalDue || 0)}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {billingSummary?.outstandingInvoices} invoice(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Invoice</CardTitle>
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(billingSummary?.averageInvoiceAmount || 0)}
                </div>
                <p className="text-xs text-gray-600 mt-1">Last 12 months</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">AI Credits</CardTitle>
                <Zap className="w-4 h-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creditsData?.balance?.available || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {creditsData?.balance?.percentage || 0}% used
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* INVOICES TAB */}
      {activeTab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle>Your Invoices</CardTitle>
            <CardDescription>
              View and manage all your invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            ) : invoicesData?.invoices?.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">No invoices yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoicesData?.invoices?.map((invoice: Invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {invoice.invoiceNumber}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                      </p>
                    </div>

                    <div className="text-right mr-6">
                      <p className="font-bold text-gray-900">
                        {formatCurrency(invoice.totalAmount)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDate(invoice.issuedDate)}
                      </p>
                    </div>

                    <div className="mr-6">
                      {getStatusBadge(invoice.status)}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewInvoice(invoice.id)}
                        title="View Invoice"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>

                      {["issued", "sent", "overdue", "partially_paid"].includes(
                        invoice.status
                      ) && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleInitiatePayment(invoice.id)}
                          title="Pay Invoice"
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* CREDITS TAB */}
      {activeTab === "credits" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                AI Credits Balance
              </CardTitle>
              <CardDescription>
                Monitor your AI service usage and credits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Balance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Available Credits</p>
                  <p className="text-3xl font-bold mt-2">
                    {creditsData?.balance?.available || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Used Credits</p>
                  <p className="text-3xl font-bold mt-2">
                    {creditsData?.balance?.used || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Usage Percentage</p>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${creditsData?.balance?.percentage || 0}%`,
                        }}
                      ></div>
                    </div>
                    <p className="text-lg font-bold mt-1">
                      {creditsData?.balance?.percentage || 0}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Pricing Info */}
              <div className="space-y-3 pt-6 border-t">
                <h4 className="font-semibold text-gray-900">AI Service Pricing</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Message Analysis</span>
                    <span className="font-semibold">5 credits</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Voice Transcription</span>
                    <span className="font-semibold">20 credits/min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Order Creation</span>
                    <span className="font-semibold">15 credits</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Product Search</span>
                    <span className="font-semibold">5 credits</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Low Credits Alert */}
          {creditsData?.balance?.available < 100 && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Your AI credits are running low! Consider purchasing additional credits to avoid service interruptions.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
