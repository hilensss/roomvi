import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function CatalogCtaCard() {
  return (
    <div className="relative mt-16 overflow-hidden rounded-section bg-dark p-10 text-white md:p-14">
      <div className="pointer-events-none absolute -right-20 -top-20 size-[25rem] rounded-pill bg-brand/30 blur-3xl" />

      <div className="relative grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="rv-eyebrow mb-3">AI-помощник</p>

          <h2 className="text-section-subtitle text-white">
            Не хотите листать?
            <br />
            <span className="font-medium italic text-brand">
              Соберём интерьер за вас.
            </span>
          </h2>

          <p className="mt-4 max-w-md text-line">
            Опишите комнату — AI подберёт подходящие товары из этого же каталога
            и расставит их в дизайне.
          </p>
        </div>

        <div className="md:justify-self-end">
          <Link
            href="/create"
            className="group inline-flex items-center gap-3 rounded-pill bg-brand py-3 pl-7 pr-3 text-white transition-all hover:bg-white hover:text-ink"
          >
            <span className="font-medium">Создать дизайн комнаты</span>

            <span className="flex size-9 items-center justify-center rounded-pill bg-white text-brand transition-colors group-hover:bg-brand group-hover:text-white">
              <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
