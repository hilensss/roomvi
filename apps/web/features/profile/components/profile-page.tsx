'use client';

import Link from 'next/link';
import { CheckCircle2, LogOut, Plus, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { useProfileSummaryQuery } from '../api/profile-queries';
import { ProfileUserCard } from './profile-user-card';
import { ProfileProjectCard } from './profile-project-card';
import { ProfileOrders } from '@/features/orders/components/profile-orders';
import { formatMoney } from '@/features/catalog/lib/catalog.helpers';
import { useLogoutMutation } from '@/features/auth/api/auth-queries';
import { useRouter } from 'next/navigation';

export function ProfilePage({
  initialOrderId,
  orderCreated = false,
}: {
  initialOrderId?: string;
  orderCreated?: boolean;
}) {
  const profileQuery = useProfileSummaryQuery();
  const [showCreatedBanner, setShowCreatedBanner] = useState(orderCreated);

  if (profileQuery.isLoading) {
    return (
      <div className="rv-container-wide py-12 text-ink-soft">
        Загружаем личный кабинет...
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="rv-container-wide py-12">
        <div className="rounded-card border border-line/60 p-8">
          <h1 className="text-2xl font-semibold text-ink">
            Не удалось загрузить профиль
          </h1>
          <p className="mt-2 text-ink-soft">
            {profileQuery.error?.message ?? 'Попробуйте обновить страницу.'}
          </p>
        </div>
      </div>
    );
  }

  const { user, projects, orders } = profileQuery.data;

  const firstName = user.name?.split(' ')[0] || 'друг';
  const totalSpent = orders
    .filter((order) => order.status !== 'CANCELLED')
    .reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="min-h-full bg-white">
      <ProfileTopbar />

      <div className="rv-container-wide py-12">
        {showCreatedBanner ? (
          <div className="mb-8 flex items-start gap-4 rounded-card border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Заказ успешно оформлен</div>
              <p className="mt-1 text-sm text-emerald-800">
                Менеджер свяжется с вами для подтверждения деталей.
              </p>
            </div>
            <button
              type="button"
              aria-label="Закрыть уведомление"
              onClick={() => setShowCreatedBanner(false)}
              className="rounded-pill p-1 transition hover:bg-emerald-100"
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        <section className="mb-16 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="rv-eyebrow mb-3">Аккаунт</p>

            <h1 className="text-section-title text-ink">
              Привет, {firstName}.{' '}
              <span className="font-normal italic text-brand">
                Чем займёмся?
              </span>
            </h1>

            <p className="mt-4 max-w-lg text-body-lg text-ink-soft">
              {projects.length} активных проекта, {orders.length} заказа в
              истории. Можно собрать новый интерьер за пару минут.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/create"
                className="inline-flex items-center gap-2 rounded-pill bg-dark px-6 py-3 text-white transition-colors hover:bg-brand"
              >
                <Sparkles size={16} />
                Новый дизайн-проект
              </Link>

              <Link
                href="/catalog"
                className="inline-flex items-center gap-2 rounded-pill border border-line/60 px-6 py-3 text-ink transition-colors hover:border-brand hover:text-brand"
              >
                Каталог
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <ProfileUserCard
              user={user}
              projectsCount={projects.length}
              ordersCount={orders.length}
              bonuses={2480}
            />
          </div>
        </section>

        <section className="mb-16">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <p className="rv-eyebrow mb-2">Мои проекты</p>

              <h2 className="text-section-subtitle text-ink">Дизайн-проекты</h2>
            </div>

            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-brand"
            >
              <Plus size={16} />
              Создать новый
            </Link>
          </div>

          {projects.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProfileProjectCard key={project.id} project={project} />
              ))}

              <CreateProjectCard />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <CreateProjectCard />
            </div>
          )}
        </section>

        <section>
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <p className="rv-eyebrow mb-2">История</p>

              <h2 className="text-section-subtitle text-ink">Мои заказы</h2>
            </div>

            <span className="text-sm text-ink-soft">
              Всего потрачено:{' '}
              <span className="font-semibold text-ink">
                {formatMoney(totalSpent)}
              </span>
            </span>
          </div>

          <ProfileOrders initialOrderId={initialOrderId} />
        </section>
      </div>
    </div>
  );
}

function ProfileTopbar() {
  const logoutMutation = useLogoutMutation();
  const router = useRouter();

  return (
    <div className="border-b border-line/40">
      <div className="rv-container-wide flex items-center justify-between gap-6 py-5">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-ink-soft transition hover:text-brand">
            Главная
          </Link>
          <span className="text-line">·</span>
          <span className="font-medium text-ink">Личный кабинет</span>
        </div>

        <button
          type="button"
          onClick={() => {
            logoutMutation.mutate();
            router.replace('/');
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition hover:text-brand"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </div>
  );
}

function CreateProjectCard() {
  return (
    <Link
      href="/create"
      className="group flex min-h-[280px] flex-col items-center justify-center rounded-card border border-dashed border-line p-12 text-center transition-colors hover:border-brand hover:bg-brand-soft"
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-pill bg-brand-soft transition-colors group-hover:bg-brand">
        <Sparkles className="size-6 text-brand transition-colors group-hover:text-white" />
      </div>

      <div className="mb-1 font-medium text-ink">Новый проект</div>

      <div className="text-sm text-ink-soft">
        AI соберёт интерьер за пару минут
      </div>
    </Link>
  );
}
