import { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

type FormFieldProps = {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({
  label,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>

      {children}

      {error ? (
        <span className="mt-2 block text-sm text-brand">{error}</span>
      ) : null}
    </label>
  );
}
