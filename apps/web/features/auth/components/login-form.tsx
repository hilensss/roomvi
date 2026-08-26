'use client';

import { useForm } from 'react-hook-form';
import { FormField } from '@/shared/ui/form-field';
import { getAuthErrorMessage, useLoginMutation } from '../api/auth-queries';
import type { LoginInput } from '../api/auth-api';

type LoginFormProps = {
  onSuccess?: () => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const submit = (values: LoginInput) => {
    loginMutation.mutate(values, {
      onSuccess,
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <FormField label="Email" error={errors.email?.message}>
        <input
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          className="rv-input"
          {...register('email', {
            required: 'Введите email',
            pattern: {
              value: /^\S+@\S+\.\S+$/,
              message: 'Введите корректный email',
            },
          })}
        />
      </FormField>

      <FormField label="Пароль" error={errors.password?.message}>
        <input
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          className="rv-input"
          {...register('password', {
            required: 'Введите пароль',
            minLength: {
              value: 8,
              message: 'Пароль должен быть не короче 8 символов',
            },
          })}
        />
      </FormField>

      {loginMutation.isError ? (
        <div className="rounded-md bg-brand-soft px-4 py-3 text-sm text-brand">
          {getAuthErrorMessage(loginMutation.error)}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loginMutation.isPending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-dark px-6 text-sm font-semibold text-white transition hover:bg-brand disabled:pointer-events-none disabled:opacity-60"
      >
        {loginMutation.isPending ? 'Входим...' : 'Войти'}
      </button>
    </form>
  );
}
