'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useB2BProjectsQuery } from '../api/b2b-queries';

const statusLabels = {
  DRAFT: 'Черновик',
  READY_TO_GENERATE: 'Готов к генерации',
  GENERATING: 'Генерация',
  COMPLETED: 'Готово',
  FAILED: 'Ошибка',
} as const;

export function B2BProjectList() {
  const params = useMemo(
    () => new URLSearchParams({ limit: '50', offset: '0' }),
    [],
  );
  const projectsQuery = useB2BProjectsQuery(params);

  return (
    <div className="rv-container-wide py-10">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="rv-eyebrow mb-2">B2B workspace</p>
          <h1 className="text-section-title text-ink">Проекты визуализации</h1>
          <p className="mt-2 text-ink-soft">
            Сейчас доступен сценарий для мебельных линеек.
          </p>
        </div>
        <Link
          href="/manager/projects/new"
          className="inline-flex w-fit items-center gap-2 rounded-pill bg-dark px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand"
        >
          <Plus size={17} />
          Новый проект
        </Link>
      </div>

      {projectsQuery.isLoading ? (
        <ListState>Загружаем проекты...</ListState>
      ) : projectsQuery.isError || !projectsQuery.data ? (
        <ListState>Не удалось загрузить проекты.</ListState>
      ) : projectsQuery.data.items.length === 0 ? (
        <ListState>Проектов пока нет. Создайте первую визуализацию.</ListState>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projectsQuery.data.items.map((project) => (
            <Link
              key={project.id}
              href={`/manager/projects/${project.id}`}
              className="rounded-card border border-line/50 bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-soft">
                    {project.partnerName}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-ink">
                    {project.name}
                  </h2>
                </div>
                <span className="rounded-pill bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand">
                  {statusLabels[project.status]}
                </span>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-ink-soft">Поставщик</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {project.supplier.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Товаров</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {project._count?.products ?? project.products?.length ?? 0}
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ListState({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded-card border border-line/50 bg-white p-12 text-center text-ink-soft">
      {children}
    </div>
  );
}
