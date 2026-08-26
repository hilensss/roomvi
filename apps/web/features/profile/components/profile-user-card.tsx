import { Mail, MapPin, Phone } from 'lucide-react';
import type { AuthUser } from '@/shared/api/types';
import { formatNumber } from '@/shared/i18n/locale';
import { useLocale } from '@/shared/providers/locale-provider';

type ProfileUserCardProps = {
  user: AuthUser;
  projectsCount: number;
  ordersCount: number;
  bonuses: number;
};

export function ProfileUserCard({
  user,
  projectsCount,
  ordersCount,
  bonuses,
}: ProfileUserCardProps) {
  const { locale } = useLocale();
  const displayName = user.name || user.email;
  const initial = displayName[0]?.toUpperCase() ?? 'R';

  return (
    <div className="relative h-full overflow-hidden rounded-card bg-dark p-8 text-white">
      <div className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-pill bg-brand/30 blur-3xl" />

      <div className="relative">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-pill bg-brand text-xl font-semibold">
            {initial}
          </div>

          <div>
            <div className="text-lg font-semibold">{displayName}</div>
            <div className="text-sm text-line">Клиент Roomvi</div>
          </div>
        </div>

        <div className="space-y-3">
          <InfoRow icon={Mail} value={user.email} />

          {user.phone ? <InfoRow icon={Phone} value={user.phone} /> : null}

          <InfoRow icon={MapPin} value="Адрес пока не указан" />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
          <Stat label="Проектов" value={projectsCount} locale={locale} />
          <Stat label="Заказов" value={ordersCount} locale={locale} />
          <Stat label="Бонусы" value={bonuses} locale={locale} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  value,
}: {
  icon: React.ElementType;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="size-4 shrink-0 text-brand" />
      <span className="text-line">{value}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  locale,
}: {
  label: string;
  value: number;
  locale: 'ru' | 'en';
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-[0.2em] text-line">
        {label}
      </div>
      <div className="text-2xl font-semibold">
        {formatNumber(value, locale)}
      </div>
    </div>
  );
}
