import { ShieldCheck, Truck } from 'lucide-react';

export function CartBenefitsCard() {
  return (
    <div className="space-y-3 rounded-lg border border-line/60 p-5">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-soft">
          <Truck size={16} className="text-brand" />
        </div>

        <div>
          <div className="font-medium text-ink">Доставка по Москве</div>
          <div className="text-xs text-ink-soft">
            2–4 дня · бесплатно от 50 000 ₽
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-brand-soft">
          <ShieldCheck size={16} className="text-brand" />
        </div>

        <div>
          <div className="font-medium text-ink">Гарантия 24 месяца</div>
          <div className="text-xs text-ink-soft">Возврат в течение 14 дней</div>
        </div>
      </div>
    </div>
  );
}
