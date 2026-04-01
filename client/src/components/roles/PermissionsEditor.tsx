import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, GripVertical, Save, Info, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

interface SortableItemProps {
  id: number;
  view: any;
  isSelected: boolean;
  onToggle: (viewId: number, checked: boolean) => void;
  index: number;
}

function SortableItem({ id, view, isSelected, onToggle, index }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 border rounded-lg ${
        isSelected ? 'bg-primary/5 border-primary' : 'bg-background'
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
        {index + 1}
      </div>
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onToggle(id, checked as boolean)}
        id={`view-${id}`}
      />
      <label htmlFor={`view-${id}`} className="flex-1 cursor-pointer">
        <div className="flex items-center gap-2">
          <span className="font-medium">{view.label}</span>
          <Badge variant="outline" className="text-xs">
            {view.section}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{view.route_path}</p>
      </label>
    </div>
  );
}

interface PermissionsEditorProps {
  roleId: number;
}

export function PermissionsEditor({ roleId }: PermissionsEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Queries
  const { data: role } = useQuery({
    queryKey: [`/api/roles/${roleId}`],
    queryFn: () => apiCall(`/api/roles/${roleId}`),
  });

  const { data: allViews = [] } = useQuery({
    queryKey: ['/api/views'],
    queryFn: () => apiCall('/api/views'),
  });

  const { data: currentPermissions = [], isLoading } = useQuery({
    queryKey: [`/api/roles/${roleId}/permissions`],
    queryFn: () => apiCall(`/api/roles/${roleId}/permissions`),
  });

  // State for managing permissions
  const [selectedViewIds, setSelectedViewIds] = useState<Set<number>>(new Set());
  const [orderedViewIds, setOrderedViewIds] = useState<number[]>([]);

  // Initialize state when data loads
  React.useEffect(() => {
    if (currentPermissions.length > 0) {
      const viewIds = currentPermissions.map((p: any) => p.view_id);
      setSelectedViewIds(new Set(viewIds));
      setOrderedViewIds(viewIds);
    }
  }, [currentPermissions]);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter views based on search
  const filteredViews = useMemo(() => {
    return allViews.filter((view: any) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        view.label.toLowerCase().includes(searchLower) ||
        view.route_path.toLowerCase().includes(searchLower) ||
        view.section?.toLowerCase().includes(searchLower)
      );
    });
  }, [allViews, searchTerm]);

  // Separate selected and unselected views
  const { selectedViews, unselectedViews } = useMemo(() => {
    const selected = orderedViewIds
      .map((id) => allViews.find((v: any) => v.id === id))
      .filter(Boolean);
    
    const unselected = filteredViews.filter((view: any) => !selectedViewIds.has(view.id));
    
    return { selectedViews: selected, unselectedViews: unselected };
  }, [orderedViewIds, allViews, filteredViews, selectedViewIds]);

  // Mutation to save permissions
  const savePermissionsMutation = useMutation({
    mutationFn: (permissions: any[]) =>
      apiCall(`/api/roles/${roleId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }),
    onSuccess: () => {
      toast({ title: '✅ Permisos guardados exitosamente' });
      queryClient.invalidateQueries({ queryKey: [`/api/roles/${roleId}/permissions`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al guardar permisos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedViewIds((items) => {
        const oldIndex = items.indexOf(active.id as number);
        const newIndex = items.indexOf(over.id as number);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleToggle = (viewId: number, checked: boolean) => {
    setSelectedViewIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(viewId);
        // Add to end of ordered list
        setOrderedViewIds((prev) => [...prev, viewId]);
      } else {
        newSet.delete(viewId);
        // Remove from ordered list
        setOrderedViewIds((prev) => prev.filter((id) => id !== viewId));
      }
      return newSet;
    });
  };

  const handleSave = () => {
    const permissions = orderedViewIds.map((viewId, index) => ({
      viewId,
      canAccess: true,
      sortOrder: index + 1,
    }));

    savePermissionsMutation.mutate(permissions);
  };

  const hasChanges = useMemo(() => {
    if (currentPermissions.length !== selectedViewIds.size) return true;
    
    const currentViewIds = currentPermissions.map((p: any) => p.view_id);
    const currentViewIdsSet = new Set(currentViewIds);
    
    // Check if selection changed
    for (const id of selectedViewIds) {
      if (!currentViewIdsSet.has(id)) return true;
    }
    
    // Check if order changed
    for (let i = 0; i < currentViewIds.length; i++) {
      if (currentViewIds[i] !== orderedViewIds[i]) return true;
    }
    
    return false;
  }, [currentPermissions, selectedViewIds, orderedViewIds]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          Cargando permisos...
        </CardContent>
      </Card>
    );
  }

  // Admin role - show info message
  if (role?.is_system) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {role.display_name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Rol del Sistema:</strong> El rol "{role.display_name}" tiene acceso automático
              a todas las vistas del sistema. No se pueden editar sus permisos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Permisos de Acceso</CardTitle>
            <CardDescription>
              {role?.display_name} - Arrastra para reordenar las vistas en el sidebar
            </CardDescription>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || savePermissionsMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar vistas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Selected Views (Sortable) */}
        {selectedViews.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground">
              Vistas con Acceso ({selectedViews.length})
            </h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedViewIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {selectedViews.map((view: any, index: number) => (
                    <SortableItem
                      key={view.id}
                      id={view.id}
                      view={view}
                      isSelected={true}
                      onToggle={handleToggle}
                      index={index}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Unselected Views */}
        {unselectedViews.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-muted-foreground">
              Vistas Disponibles ({unselectedViews.length})
            </h3>
            <div className="space-y-2">
              {unselectedViews.map((view: any) => (
                <div
                  key={view.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-background"
                >
                  <div className="w-4" />
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted/50 text-sm text-muted-foreground">
                    -
                  </div>
                  <Checkbox
                    checked={false}
                    onCheckedChange={(checked) => handleToggle(view.id, checked as boolean)}
                    id={`view-unselected-${view.id}`}
                  />
                  <label htmlFor={`view-unselected-${view.id}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">{view.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {view.section}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{view.route_path}</p>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredViews.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No se encontraron vistas con el término "{searchTerm}"
          </div>
        )}
      </CardContent>
    </Card>
  );
}
