import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Users, Shield, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RoleModal } from './RoleModal';
import { PermissionsEditor } from './PermissionsEditor';

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(endpoint, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error en la petición');
  }
  return response.json();
}

export function RolesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<any>(null);

  // Queries
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['/api/roles'],
    queryFn: () => apiCall('/api/roles'),
  });

  // Mutations
  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: number) => apiCall(`/api/roles/${roleId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Rol eliminado exitosamente' });
      queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
      setRoleToDelete(null);
      setSelectedRoleId(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error al eliminar rol', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleDeleteRole = () => {
    if (roleToDelete) {
      deleteRoleMutation.mutate(roleToDelete.id);
    }
  };

  const handleEditRole = (role: any) => {
    setEditingRole(role);
  };

  const handleRoleCreated = (newRole: any) => {
    queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
    setIsCreateModalOpen(false);
    // Seleccionar el nuevo rol para editar permisos
    setSelectedRoleId(newRole.role.id);
    toast({ 
      title: 'Rol creado exitosamente',
      description: 'Ahora puedes asignar permisos a este rol'
    });
  };

  const handleRoleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
    setEditingRole(null);
  };

  if (rolesLoading) {
    return <div className="flex items-center justify-center p-8">Cargando roles...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Roles y Permisos</h2>
          <p className="text-muted-foreground">
            Crea roles personalizados y asigna permisos de acceso a las diferentes vistas del sistema
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Crear Rol
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de roles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Roles del Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead className="text-center">Usuarios</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role: any) => (
                  <TableRow 
                    key={role.id}
                    className={selectedRoleId === role.id ? 'bg-muted' : 'cursor-pointer hover:bg-muted/50'}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{role.display_name}</span>
                          {role.is_system && (
                            <Badge variant="secondary" className="text-xs">
                              Sistema
                            </Badge>
                          )}
                          {!role.is_active && (
                            <Badge variant="outline" className="text-xs">
                              Inactivo
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {role.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {role.user_count || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                        {!role.is_system && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditRole(role)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setRoleToDelete(role)}
                              disabled={parseInt(role.user_count) > 0}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Editor de permisos */}
        <div>
          {selectedRoleId ? (
            <PermissionsEditor roleId={selectedRoleId} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <Shield className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Selecciona un rol
                </h3>
                <p className="text-muted-foreground">
                  Haz clic en un rol de la lista para configurar sus permisos de acceso
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal de creación */}
      <RoleModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={handleRoleCreated}
      />

      {/* Modal de edición */}
      {editingRole && (
        <RoleModal
          open={true}
          onOpenChange={(open) => !open && setEditingRole(null)}
          role={editingRole}
          onSuccess={handleRoleUpdated}
        />
      )}

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              ¿Eliminar rol?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el rol "<strong>{roleToDelete?.display_name}</strong>" 
              y todos sus permisos asignados.
              {parseInt(roleToDelete?.user_count) > 0 && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-destructive font-medium">
                    ⚠️ No se puede eliminar este rol porque tiene {roleToDelete.user_count} usuario(s) asignado(s).
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={parseInt(roleToDelete?.user_count) > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
