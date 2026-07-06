import Image from 'next/image';
import { Button } from '@/shared/ui/button';

export function HeroSection() {
  return (
    <section className="relative isolate flex min-h-screen items-center justify-center overflow-hidden">
      <HeroBackground />

      <div className="relative z-10 rv-container pt-16 pb-24 text-center">
        <HeroBadge />

        <h1 className="mx-auto text-hero text-white">
          Соберите интерьер,
          <br />
          <span className="font-medium italic text-brand">пока пьёте кофе</span>
        </h1>

        <p className="mx-auto mt-8 max-w-3xl text-body-lg text-white/85">
          Нейросеть собирает фотореалистичный интерьер из мебели, которая прямо
          сейчас в наличии у партнёров. Один клик — и вся обстановка едет к вам.
        </p>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Button href="/create" variant="dark" withArrow>
            Создать мой дизайн
          </Button>

          <Button href="/examples" variant="glass">
            Смотреть примеры →
          </Button>
        </div>

        {/* <HeroSocialProof /> */}
      </div>

      <HeroScrollIndicator />
    </section>
  );
}

function HeroBackground() {
  return (
    <div className="absolute inset-0">
      <Image
        src="https://images.unsplash.com/photo-1600494448655-ae58f58bb945?auto=format&fit=crop&w=2400&q=80"
        alt=""
        fill
        priority
        className="object-cover"
        sizes="100vw"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-dark/55 to-dark/85" />
      <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />

      <div className="pointer-events-none absolute left-1/4 top-1/3 size-[32rem] transform-gpu rounded-pill bg-brand/25 blur-[120px] backface-hidden" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 size-[26rem] transform-gpu rounded-pill bg-brand/15 blur-[120px] backface-hidden" />
    </div>
  );
}

function HeroBadge() {
  return (
    <div className="mb-10 inline-flex transform-gpu items-center gap-2 rounded-pill border border-white/20 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-md backface-hidden">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full transform-gpu animate-ping rounded-pill bg-brand opacity-75 will-change-transform backface-hidden" />
        <span className="relative inline-flex size-2 rounded-pill bg-brand" />
      </span>

      <span>AI-дизайн × Реальная мебель в наличии</span>
    </div>
  );
}

// function HeroSocialProof() {
//   return (
//     <div className="mt-14 flex flex-wrap items-center justify-center gap-5">
//       <div className="flex -space-x-3">
//         {heroAvatars.map((src) => (
//           <Image
//             key={src}
//             src={src}
//             alt=""
//             width={40}
//             height={40}
//             className="size-10 rounded-pill border-2 border-white object-cover"
//           />
//         ))}
//       </div>

//       <div className="text-left">
//         <div className="mb-0.5 flex items-center gap-1">
//           {Array.from({ length: 5 }).map((_, index) => (
//             <Star key={index} size={16} className="fill-brand text-brand" />
//           ))}

//           <span className="ml-2 text-sm font-medium text-white">4.9 / 5</span>
//         </div>

//         <p className="text-xs text-white/75">12 400+ интерьеров уже собрано</p>
//       </div>
//     </div>
//   );
// }

function HeroScrollIndicator() {
  return (
    <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/70">
      <span>Scroll</span>
      <span className="h-10 w-px bg-gradient-to-b from-white/70 to-transparent" />
    </div>
  );
}
