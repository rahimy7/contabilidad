import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { loginSchema, type LoginRequest } from "@shared/auth";
import { useAuth } from "@/contexts/AuthContext";
import { Building2, Shield, User } from "lucide-react";

export default function MultiTenantLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [loginMode, setLoginMode] = useState<"tenant" | "super_admin">("tenant");
  const { toast } = useToast();
  const { login } = useAuth();

  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      companyId: "",
    },
  });

  const onSubmit = async (data: LoginRequest) => {
    setIsLoading(true);
    setError("");

    try {
      const companyId = loginMode === "super_admin" ? undefined : data.companyId;
      
      await login(data.username, data.password, companyId);
      
      toast({
        title: "Inicio de sesión exitoso",
        description: "Bienvenido al sistema",
      });

      // La redirección la maneja el contexto de autenticación automáticamente
    } catch (error: any) {
      setError(error.message || "Error de conexión");
      toast({
        title: "Error",
        description: "No se pudo iniciar sesión",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Selector de modo de login */}
        <div className="flex space-x-2 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm">
          <Button
            type="button"
            variant={loginMode === "tenant" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setLoginMode("tenant")}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Empresa
          </Button>
          <Button
            type="button"
            variant={loginMode === "super_admin" ? "default" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setLoginMode("super_admin")}
          >
            <Shield className="w-4 h-4 mr-2" />
            Super Admin
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              {loginMode === "super_admin" ? (
                <Shield className="w-12 h-12 text-red-600" />
              ) : (
                <User className="w-12 h-12 text-blue-600" />
              )}
            </div>
            <CardTitle className="text-2xl text-center">
              {loginMode === "super_admin" ? "Administración Global" : "Iniciar Sesión"}
            </CardTitle>
            <CardDescription className="text-center">
              {loginMode === "super_admin" 
                ? "Acceso al panel de administración del sistema"
                : "Accede a tu cuenta empresarial"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Campo ID de Empresa - Solo para modo tenant */}
                {loginMode === "tenant" && (
                  <FormField
                    control={form.control}
                    name="companyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID de Empresa</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="ID de tu empresa"
                            {...field}
                            disabled={isLoading}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usuario</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={loginMode === "super_admin" ? "superadmin" : "Tu usuario"}
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Tu contraseña"
                          {...field}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
                </Button>
              </form>
            </Form>

         
          </CardContent>
        </Card>
      </div>
    </div>
  );
}