import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import {
  Stethoscope, Calendar, DollarSign, Clock, User, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, CreditCard, Phone, Mail,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ================================
// API Helper
// ================================
async function apiCall(endpoint: string) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(errorData.error || `Error ${response.status}`);
  }
  return response.json();
}

// ================================
// Status Config
// ================================
const statusConfig: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  confirmed: { label: 'Confirmada', color: 'bg-green-100 text-green-800 border-green-200' },
  in_progress: { label: 'En Curso', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-200' },
  no_show: { label: 'No Asistió', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const paymentStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  paid: { label: 'Pagado', color: 'bg-green-100 text-green-800 border-green-200' },
  partial: { label: 'Parcial', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  credit: { label: 'Crédito', color: 'bg-purple-100 text-purple-800 border-purple-200' },
};

// ================================
// Component
// ================================
export default function DoctorDashboard() {
  const [selectedTitularId, setSelectedTitularId] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Fetch titulares
  const { data: titulares = [] } = useQuery({
    queryKey: ['/api/appointment-titulares'],
    queryFn: () => apiCall('/api/appointment-titulares'),
  });

  // Fetch stats for selected titular
  const { data: stats } = useQuery({
    queryKey: ['/api/appointments/titular', selectedTitularId, 'stats'],
    queryFn: () => apiCall(`/api/appointments/titular/${selectedTitularId}/stats`),
    enabled: !!selectedTitularId,
  });

  // Fetch appointments for selected titular in current month range
  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: appointments = [] } = useQuery({
    queryKey: ['/api/appointments/titular', selectedTitularId, monthStart, monthEnd],
    queryFn: () => apiCall(`/api/appointments/titular/${selectedTitularId}?startDate=${monthStart}&endDate=${monthEnd}`),
    enabled: !!selectedTitularId,
  });

  // Calendar days
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Appointments for selected date
  const dayAppointments = useMemo(() => {
    return (appointments as any[]).filter((apt: any) => {
      const aptDate = new Date(apt.appointmentDate);
      return isSameDay(aptDate, selectedDate);
    }).sort((a: any, b: any) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
  }, [appointments, selectedDate]);

  // Count appointments per day for calendar indicators
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, number>();
    (appointments as any[]).forEach((apt: any) => {
      const key = format(new Date(apt.appointmentDate), 'yyyy-MM-dd');
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [appointments]);

  const selectedTitular = (titulares as any[]).find((t: any) => String(t.id) === selectedTitularId);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-teal-600" />
            Panel de Doctores
          </h1>
          <p className="text-muted-foreground mt-1">
            Vista de citas y estadísticas por titular / doctor
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedTitularId} onValueChange={setSelectedTitularId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar doctor..." />
            </SelectTrigger>
            <SelectContent>
              {(titulares as any[]).filter((t: any) => t.isActive).map((t: any) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}{t.specialty ? ` — ${t.specialty}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedTitularId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Stethoscope className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Selecciona un doctor</h3>
            <p className="text-muted-foreground mt-1">Elige un titular para ver sus citas y estadísticas</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{stats?.totalAppointments || 0}</div>
                    <p className="text-xs text-muted-foreground">Total Citas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{stats?.todayAppointments || 0}</div>
                    <p className="text-xs text-muted-foreground">Citas Hoy</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      RD$ {parseFloat(stats?.totalRevenue || '0').toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground">Ingresos Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      RD$ {parseFloat(stats?.pendingPayment || '0').toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-muted-foreground">Pagos Pendientes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {format(currentMonth, 'MMMM yyyy', { locale: es })}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map(day => (
                    <div key={day} className="text-xs font-medium text-muted-foreground py-1">{day}</div>
                  ))}
                  {calendarDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const count = appointmentsByDay.get(key) || 0;
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          'relative p-1.5 text-sm rounded-md transition-colors',
                          !isCurrentMonth && 'text-muted-foreground/40',
                          isSelected && 'bg-primary text-primary-foreground',
                          !isSelected && isToday && 'bg-blue-50 text-blue-700 font-semibold',
                          !isSelected && !isToday && 'hover:bg-muted',
                        )}
                      >
                        {day.getDate()}
                        {count > 0 && (
                          <span className={cn(
                            'absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full',
                            isSelected ? 'bg-primary-foreground' : 'bg-teal-500',
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Day Appointments */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Citas del {format(selectedDate, "d 'de' MMMM", { locale: es })}
                  <Badge variant="outline" className="ml-2">{dayAppointments.length} citas</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayAppointments.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No hay citas para este día</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {dayAppointments.map((apt: any) => {
                      const st = statusConfig[apt.status] || statusConfig.scheduled;
                      const ps = paymentStatusConfig[apt.paymentStatus || apt.payment_status || 'pending'] || paymentStatusConfig.pending;
                      const time = format(new Date(apt.appointmentDate), 'HH:mm');
                      const endTime = apt.appointmentEndDate ? format(new Date(apt.appointmentEndDate), 'HH:mm') : null;

                      return (
                        <div key={apt.id} className="flex gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
                          <div className="text-center min-w-[60px]">
                            <div className="text-lg font-bold text-primary">{time}</div>
                            {endTime && <div className="text-xs text-muted-foreground">a {endTime}</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{apt.title}</span>
                              <Badge variant="outline" className={`text-xs ${st.color}`}>{st.label}</Badge>
                              <Badge variant="outline" className={`text-xs ${ps.color}`}>{ps.label}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {apt.customerName || apt.customer_name || 'Cliente'}
                              </span>
                              {apt.customerPhone || apt.customer_phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {apt.customerPhone || apt.customer_phone}
                                </span>
                              ) : null}
                            </div>
                            {apt.serviceTypeName || apt.service_type_name ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Servicio: {apt.serviceTypeName || apt.service_type_name}
                              </div>
                            ) : null}
                            {parseFloat(apt.price || '0') > 0 && (
                              <div className="mt-1 text-sm font-semibold text-green-700">
                                RD$ {parseFloat(apt.price).toFixed(2)}
                              </div>
                            )}
                            {apt.notes && (
                              <div className="mt-1 text-xs text-muted-foreground italic">{apt.notes}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
