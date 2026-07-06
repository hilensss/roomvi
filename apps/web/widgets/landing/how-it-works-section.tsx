import { Button } from '@/shared/ui/button';
import { howItWorksSteps } from './landing.data';

export function HowItWorksSection() {
  return (
    <>
      <section className="relative bg-white pt-14">
        <div className="rv-container max-w-3xl text-center">
          <p className="rv-eyebrow mb-5">Дальше — как это работает</p>

          <h2 className="text-section-subtitle text-ink">
            Четыре шага между{' '}
            <span className="italic text-brand">голой комнатой</span>
            <br className="hidden md:inline" /> и заказом мебели.
          </h2>

          <div className="mt-8 flex flex-col items-center">
            <span className="h-16 w-px bg-gradient-to-b from-transparent via-line to-dark" />
            <span className="-mt-1.5 size-3 rounded-pill bg-brand shadow-soft ring-4 ring-white" />
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="isolate overflow-hidden bg-dark pt-14 pb-14 text-white"
      >
        <div className="relative rv-container-wide">
          <div className="pointer-events-none absolute right-0 top-0 size-[38rem] transform-gpu rounded-pill bg-brand/20 blur-3xl backface-hidden" />

          <div className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {howItWorksSteps.map((step) => (
              <article
                key={step.number}
                className="group transform-gpu rounded-card border border-white/10 bg-white/5 p-7 backdrop-blur backface-hidden transition-colors hover:bg-white/10"
              >
                <div className="mb-8 flex items-center justify-between">
                  <span className="text-5xl font-semibold tracking-tight text-line/35">
                    {step.number}
                  </span>

                  <div className="flex size-12 transform-gpu items-center justify-center rounded-md bg-brand text-white transition-transform will-change-transform backface-hidden group-hover:rotate-6">
                    <step.icon size={24} />
                  </div>
                </div>

                <h3 className="mb-2 text-card-title text-white">
                  {step.title}
                </h3>

                <p className="text-sm leading-6 text-line">
                  {step.description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <Button href="/create" variant="brand">
              Попробовать
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
