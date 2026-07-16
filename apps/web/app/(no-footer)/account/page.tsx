import { ProfilePage } from '@/features/profile/components/profile-page';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; created?: string }>;
}) {
  const params = await searchParams;
  return (
    <ProfilePage
      initialOrderId={params.order}
      orderCreated={params.created === '1'}
    />
  );
}
