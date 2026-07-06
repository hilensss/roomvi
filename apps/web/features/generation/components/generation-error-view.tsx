import Link from 'next/link';

type GenerationErrorViewProps = {
  title: string;
  message: string;
};

export function GenerationErrorView({
  title,
  message,
}: GenerationErrorViewProps) {
  return (
    <div className="rv-container flex min-h-[60vh] items-center justify-center py-16">
      <div className="max-w-xl rounded-card border border-line/60 bg-white p-8 text-center shadow-soft">
        <p className="rv-eyebrow mb-4">Ошибка</p>

        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {title}
        </h1>

        <p className="mt-4 text-ink-soft">{message}</p>

        <Link
          href="/create"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-pill bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Создать проект заново
        </Link>
      </div>
    </div>
  );
}
