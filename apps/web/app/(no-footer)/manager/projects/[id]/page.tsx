import { B2BProjectWorkspace } from '@/features/b2b/components/b2b-project-workspace';

export default async function ManagerProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <B2BProjectWorkspace projectId={id} />;
}
