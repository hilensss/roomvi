import { GenerationResultClient } from './generation-result-client';

type PageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { jobId } = await params;

  return <GenerationResultClient jobId={jobId} />;
}
