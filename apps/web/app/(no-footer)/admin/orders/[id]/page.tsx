import { AdminOrderDetailPage } from '@/features/admin-orders/components/admin-order-detail-page';
import { AdminRouteGuard } from '@/features/admin-orders/components/admin-route-guard';

export default async function AdminOrderDetailPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminRouteGuard>
      <AdminOrderDetailPage orderId={id} />
    </AdminRouteGuard>
  );
}
