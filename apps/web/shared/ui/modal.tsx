'use client';

import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/cn';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  closeOnOverlayClick?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
  contentClassName,
  closeOnOverlayClick = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[100] flex  items-center justify-center px-4 py-6',
        className,
      )}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Закрыть модальное окно"
        className="absolute inset-0 bg-dark/50 backdrop-blur-sm"
        onClick={closeOnOverlayClick ? onClose : undefined}
      />

      <div
        className={cn(
          'relative z-10 max-h-[calc(100vh-3rem)] flex flex-col overflow-hidden w-full max-w-md rounded-card bg-white p-6 shadow-float',
          contentClassName,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-pill border border-line/60 text-ink transition hover:border-ink rv-focus-ring"
        >
          <X size={16} />
        </button>

        {(title || description) && (
          <div className="mb-4 pr-6">
            {title ? (
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                {title}
              </h2>
            ) : null}

            {description ? (
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                {description}
              </p>
            ) : null}
          </div>
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}
