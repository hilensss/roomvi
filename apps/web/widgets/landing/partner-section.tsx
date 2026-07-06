import { SectionHeading } from '@/shared/ui/section-heading';
import { IconBadge } from '@/shared/ui/icon-badge';
import { partnerFeatures } from './landing.data';

export function PartnerSection() {
  return (
    <section id="products" className="bg-white py-20">
      <div className="rv-container-wide">
        <SectionHeading
          eyebrow="Партнёры"
          align="center"
          className="mb-16"
          title={
            <>
              Только живой каталог. Никаких
              <br className="hidden md:inline" /> «как на референсе».
            </>
          }
        />

        <div className="grid gap-6 md:grid-cols-3">
          {partnerFeatures.map((feature) => (
            <article
              key={feature.title}
              className="rounded-card border border-line/50 bg-white p-8 transition-colors hover:border-brand"
            >
              <IconBadge icon={feature.icon} className="mb-6" />

              <h3 className="mb-2 text-card-title text-ink">{feature.title}</h3>

              <p className="text-body text-ink-soft">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
