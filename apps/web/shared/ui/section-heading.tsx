import { cn } from '@/shared/lib/cn';

type SectionHeadingProps = {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow ? <p className="rv-eyebrow mb-4">{eyebrow}</p> : null}

      <h2 className="text-section-title text-ink">{title}</h2>

      {description ? (
        <p className="mt-5 max-w-xl text-body-lg text-ink-soft">
          {description}
        </p>
      ) : null}
    </div>
  );
}
