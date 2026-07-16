import { Suspense } from 'react';
import { AdminOrdersPage } from '@/features/admin-orders/components/admin-orders-page';
import { AdminRouteGuard } from '@/features/admin-orders/components/admin-route-guard';

export default function AdminOrdersPageRoute() {
  return (
    <AdminRouteGuard>
      <Suspense fallback={<div className="rv-container-wide py-16 text-ink-soft">Загружаем заказы...</div>}>
        <AdminOrdersPage />
      </Suspense>
    </AdminRouteGuard>
  );
}
