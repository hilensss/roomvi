'use client';

import { useState } from 'react';
import { Modal } from '@/shared/ui/modal';
import type { AuthMode, AuthReason } from '../model/auth.types';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { reasonText } from '../model/auth.data';

type AuthModalProps = {
  open: boolean;
  initialMode?: AuthMode;
  reason?: AuthReason;
  onClose: () => void;
  onSuccess?: () => void;
};

export function AuthModal({
  open,
  initialMode = 'login',
  reason = 'default',
  onClose,
  onSuccess,
}: AuthModalProps) {
  const content = reasonText[reason];

  if (!open) {
    return null;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={content.title}
      description={content.description}
    >
      <AuthModalContent initialMode={initialMode} onSuccess={onSuccess} />
    </Modal>
  );
}

type AuthModalContentProps = {
  initialMode: AuthMode;
  onSuccess?: () => void;
};

function AuthModalContent({ initialMode, onSuccess }: AuthModalContentProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  return (
    <>
      <p className="rv-eyebrow mb-3">
        {mode === 'login' ? 'Вход' : 'Регистрация'}
      </p>

      <div className="mb-6 grid grid-cols-2 rounded-pill bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={
            mode === 'login'
              ? 'rounded-pill bg-white px-4 py-2 text-sm font-semibold text-ink shadow-soft'
              : 'rounded-pill px-4 py-2 text-sm font-medium text-ink-soft'
          }
        >
          Войти
        </button>

        <button
          type="button"
          onClick={() => setMode('register')}
          className={
            mode === 'register'
              ? 'rounded-pill bg-white px-4 py-2 text-sm font-semibold text-ink shadow-soft'
              : 'rounded-pill px-4 py-2 text-sm font-medium text-ink-soft'
          }
        >
          Создать
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {mode === 'login' ? (
          <LoginForm onSuccess={onSuccess} />
        ) : (
          <RegisterForm onSuccess={onSuccess} />
        )}
      </div>
    </>
  );
}
