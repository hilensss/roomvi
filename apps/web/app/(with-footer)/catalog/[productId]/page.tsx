import { CatalogProductPage } from '@/features/catalog/components/catalog-product-page';

type CatalogProductRoutePageProps = {
  params: Promise<{
    productId: string;
  }>;
};

export default async function CatalogProductRoutePage({
  params,
}: CatalogProductRoutePageProps) {
  const { productId } = await params;

  return <CatalogProductPage productId={productId} />;
}
