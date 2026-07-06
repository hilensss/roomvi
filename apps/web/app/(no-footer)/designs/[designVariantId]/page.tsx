import { DesignDetailPage } from '@/features/designs/components/design-detail-page';

type DesignDetailRoutePageProps = {
  params: Promise<{
    designVariantId: string;
  }>;
};

export default async function DesignDetailRoutePage({
  params,
}: DesignDetailRoutePageProps) {
  const { designVariantId } = await params;

  return <DesignDetailPage designVariantId={designVariantId} />;
}
