'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentUserQuery } from '@/features/auth/api/auth-queries';

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const currentUserQuery = useCurrentUserQuery();

  if (currentUserQuery.isLoading) {
    return (
      <div className="rv-container-wide py-16 text-ink-soft">
        Проверяем права доступа...
      </div>
    );
  }

  if (!currentUserQuery.data) {
    return (
      <AccessState
        title="Требуется авторизация"
        description="Войдите в аккаунт администратора, чтобы открыть этот раздел."
      />
    );
  }

  if (currentUserQuery.data.role !== 'ADMIN') {
    return (
      <AccessState
        title="Доступ запрещён"
        description="Раздел доступен только менеджерам Roomvi."
      />
    );
  }

  return children;
}

function AccessState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rv-container py-16">
      <div className="mx-auto max-w-xl rounded-card border border-line/60 p-10 text-center">
        <ShieldAlert className="mx-auto mb-5 size-10 text-brand" />
        <h1 className="text-3xl font-semibold text-ink">{title}</h1>
        <p className="mt-3 text-ink-soft">{description}</p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-pill bg-dark px-6 py-3 text-white transition hover:bg-brand"
        >
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
