import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type ButtonVariant = 'brand' | 'dark' | 'glass' | 'outline';

type ButtonProps = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  withArrow?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
};

const variantClassName: Record<ButtonVariant, string> = {
  brand: 'bg-brand text-white hover:bg-white hover:text-ink',
  dark: 'bg-dark text-white hover:bg-brand hover:text-white',
  glass:
    'border border-white/40 bg-white/5 text-white backdrop-blur-md backface-hidden hover:bg-white hover:text-ink',
  outline:
    'border border-line-soft bg-white text-ink hover:border-brand hover:text-brand',
};

export function Button({
  children,
  href,
  onClick,
  variant = 'brand',
  withArrow = false,
  className,
  type = 'button',
  disabled = false,
}: ButtonProps) {
  const content = (
    <>
      <span>{children}</span>

      {withArrow ? (
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-pill',
            variant === 'dark'
              ? 'group-hover:bg-white group-hover:text-brand bg-brand text-white'
              : variant === 'brand'
                ? 'group-hover:bg-brand group-hover:text-white bg-white text-brand'
                : '',
          )}
        >
          <ArrowRight size={18} />
        </span>
      ) : null}
    </>
  );

  const classNames = cn(
    'group inline-flex min-h-14 items-center justify-center gap-3 rounded-pill px-7 text-sm font-semibold transition-colors duration-200',
    withArrow && 'py-2 pr-2',
    variantClassName[variant],
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classNames}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={classNames}
      disabled={disabled}
    >
      {content}
    </button>
  );
}
