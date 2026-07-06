import { GenerationPage } from '@/features/generation/components/generation-page';

type GenerationRoutePageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function GenerationRoutePage({
  params,
}: GenerationRoutePageProps) {
  const { jobId } = await params;

  return <GenerationPage jobId={jobId} />;
}
