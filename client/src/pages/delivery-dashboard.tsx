import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DeliveryTripDashboard } from '@/components/trips/DeliveryTripDashboard';
import { QRScanner } from '@/components/trips/QRScanner';
import { TripOrdersList } from '@/components/trips/TripOrdersList';
import { Card, CardContent } from '@/components/ui/card';
import { Package } from 'lucide-react';

export default function DeliveryDashboardPage() {
  const { user } = useAuth();
  const [activeTripId, setActiveTripId] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showList, setShowList] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadActiveTrip();
  }, [refreshKey]);

  const loadActiveTrip = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/trips/my-active', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setActiveTripId(data?.id || null);
      }
    } catch (error) {
      console.error('Error loading active trip:', error);
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mi Viaje</h1>
          <p className="text-gray-600 mt-1">
            Bienvenido, {user?.name}
          </p>
        </div>
      </div>

      {/* Dashboard Principal */}
      <DeliveryTripDashboard
        onScanQR={() => setShowScanner(true)}
        onViewList={() => setShowList(true)}
      />

      {/* Modales */}
      {activeTripId && (
        <>
          <QRScanner
            tripId={activeTripId}
            open={showScanner}
            onClose={() => setShowScanner(false)}
            onSuccess={() => {
              setShowScanner(false);
              handleRefresh();
            }}
          />

          <TripOrdersList
            tripId={activeTripId}
            open={showList}
            onClose={() => setShowList(false)}
            onOrderMarked={handleRefresh}
          />
        </>
      )}
    </div>
  );
}