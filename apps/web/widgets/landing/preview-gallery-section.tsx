import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { SectionHeading } from '@/shared/ui/section-heading';
import { previewGalleryItems } from './landing.data';

export function PreviewGallerySection() {
  return (
    <section id="examples" className="bg-white py-20">
      <div className="rv-container-wide">
        <div className="mb-14 flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Галерея"
            title={
              <>
                Реальные комнаты,
                <br />
                собранные за час.
              </>
            }
          />

          <p className="max-w-100 text-body-lg text-ink-soft">
            Каждый интерьер — это набор товаров с актуальной ценой. Можно купить
            в один клик.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {previewGalleryItems.map((item) => (
            <article key={item.area} className="group cursor-pointer">
              <div className="relative isolate mb-4 h-[420px] overflow-hidden rounded-card">
                <Image
                  src={item.image}
                  alt={item.style}
                  fill
                  className="transform-gpu object-cover transition-transform duration-500 will-change-transform backface-hidden group-hover:scale-105"
                  sizes="(min-width: 768px) 33vw, 100vw"
                />

                <div className="absolute left-4 top-4 transform-gpu rounded-pill bg-white/95 px-4 py-2 backdrop-blur backface-hidden">
                  <span className="text-sm font-medium text-ink">
                    {item.style}
                  </span>
                </div>

                <div className="absolute bottom-4 right-4 rounded-pill bg-brand px-4 py-2 text-white">
                  <span className="font-semibold">{item.price}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-ink-soft">{item.area}</p>

                <span className="inline-flex items-center gap-1 font-medium text-ink transition-all group-hover:gap-3">
                  Смотреть <ArrowRight size={16} />
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
