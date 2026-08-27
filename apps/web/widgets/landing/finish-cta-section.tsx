import { CheckCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function FinishCTASection() {
  return (
    <section className="bg-white pb-20">
      <div className="rv-container">
        <div className="relative isolate overflow-hidden rounded-section bg-dark p-10 md:p-20">
          <div className="pointer-events-none absolute -right-20 -top-20 size-[25rem] transform-gpu rounded-pill bg-brand/30 blur-3xl backface-hidden" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 size-[19rem] transform-gpu rounded-pill bg-brand/20 blur-3xl backface-hidden" />

          <div className="relative max-w-3xl">
            <h2 className="mb-6 text-section-title text-white">
              Соберите интерьер,
              <br />
              <span className="font-medium italic text-brand">
                пока пьёте кофе
              </span>
              .
            </h2>

            <p className="mb-10 max-w-xl text-body-lg text-line">
              Бесплатно. Без регистрации до момента покупки. Можно создать
              несколько вариантов и выбрать лучший.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Button href="/create" variant="brand" withArrow>
                Создать дизайн комнаты
              </Button>

              <div className="flex items-center gap-3 px-2">
                <CheckCircle className="size-5 text-brand" />
                <span className="text-sm text-white">3 минуты — и готово</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
