import Image from 'next/image';
import { CheckCircle, Quote } from 'lucide-react';
import { comparisonRows } from './landing.data';

export function ReviewSection() {
  return (
    <section className="bg-white py-10">
      <div className="rv-container-wide grid items-stretch gap-12 lg:grid-cols-2">
        <article className="relative overflow-hidden rounded-section bg-brand p-10 text-white md:p-12">
          <Quote className="absolute right-8 top-8 size-24 text-white/15" />

          <div className="relative">
            <p className="mb-10 text-[clamp(1.25rem,2vw,1.75rem)] font-medium leading-snug">
              «Я три месяца листала Pinterest и ничего не покупала. В Roomvi
              сделала проект за вечер — и в выходные курьеры привезли всё, что
              AI подобрал. Стыдно сказать, но я в шоке.»
            </p>

            <div className="flex items-center gap-4">
              <Image
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop"
                alt=""
                width={56}
                height={56}
                className="size-14 rounded-pill border-2 border-white object-cover"
              />

              <div>
                <p className="font-semibold">Анна К.</p>
                <p className="text-sm text-white/80">
                  обустроила гостиную 26 м²
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-section border border-line/60 p-10 md:p-12">
          <h3 className="mb-8 text-[1.75rem] font-semibold tracking-tight text-ink">
            Почему не как обычно
          </h3>

          <div className="space-y-1">
            {comparisonRows.map((row) => (
              <div
                key={row.bad}
                className="grid gap-4 border-t border-line/50 py-4 md:grid-cols-2"
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 size-5 shrink-0 rounded-pill border border-line" />
                  <p className="text-sm text-ink-soft line-through">
                    {row.bad}
                  </p>
                </div>

                <div className="flex gap-3">
                  <CheckCircle className="mt-0.5 size-5 shrink-0 text-brand" />
                  <p className="text-sm font-medium text-ink">{row.good}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
