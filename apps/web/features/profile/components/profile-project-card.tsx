import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SafeImage } from '@/shared/ui/safe-image';
import type { RoomProject } from '@/shared/api/types';

type ProfileProjectCardProps = {
  project: RoomProject;
};

export function ProfileProjectCard({ project }: ProfileProjectCardProps) {
  let cover;

  if (project.designVariants) cover = project.designVariants?.imageUrl;
  else cover = null;

  const productsCount = 0;

  const href = project.selectedDesignVariantId
    ? `/designs/${project.selectedDesignVariantId}`
    : `/generation/${project.latestGenerationJobId}/result`;

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-card border border-line/60 transition-colors hover:border-brand/60"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-line/20">
        {cover ? (
          <SafeImage
            src={cover}
            alt={project.title ?? ''}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(min-width: 1024px) 33vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-soft">
            Нет изображения
          </div>
        )}

        <div className="absolute left-4 top-4 rounded-pill bg-white/90 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-ink-soft backdrop-blur">
          {project.style}
        </div>
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="text-lg font-medium tracking-tight text-ink transition-colors group-hover:text-brand">
            {project.title}
          </h3>

          <ArrowUpRight className="mt-1 size-4 shrink-0 text-line transition-colors group-hover:text-brand" />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft">{project.roomType}</span>
          <span className="text-line">{formatDate(project.createdAt)}</span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-line/40 pt-4 text-xs text-ink-soft">
          <span>{productsCount} товаров в подборке</span>
          <span className="font-medium text-brand">Открыть</span>
        </div>
      </div>
    </Link>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
