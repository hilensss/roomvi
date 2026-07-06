'use client';

import { useForm } from 'react-hook-form';
import { FormField } from '@/shared/ui/form-field';
import { getAuthErrorMessage, useRegisterMutation } from '../api/auth-queries';
import type { RegisterInput } from '../api/auth-api';

type RegisterFormProps = {
  onSuccess?: () => void;
};

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const registerMutation = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  const submit = (values: RegisterInput) => {
    registerMutation.mutate(
      {
        ...values,
        phone: values.phone || undefined,
      },
      {
        onSuccess,
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="flex flex-col h-full min-h-0 justify-between gap-4"
    >
      <div className="space-y-4 min-h-0 flex-1 overflow-y-auto">
        <FormField label="Имя" error={errors.name?.message}>
          <input
            type="text"
            placeholder="Альберт"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            className="rv-input"
            {...register('name', {
              required: 'Введите имя',
              minLength: {
                value: 2,
                message: 'Имя должно быть не короче 2 символов',
              },
            })}
          />
        </FormField>

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

        <FormField label="Телефон" error={errors.phone?.message}>
          <input
            type="tel"
            placeholder="+7 999 000-00-00"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            className="rv-input"
            {...register('phone', {
              validate: (value) => {
                if (!value) return true;

                return (
                  value.replace(/\D/g, '').length >= 10 ||
                  'Введите корректный телефон'
                );
              },
            })}
          />
        </FormField>

        <FormField label="Пароль" error={errors.password?.message}>
          <input
            type="password"
            placeholder="Минимум 6 символов"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            className="rv-input"
            {...register('password', {
              required: 'Введите пароль',
              minLength: {
                value: 6,
                message: 'Пароль должен быть не короче 6 символов',
              },
            })}
          />
        </FormField>

        {registerMutation.isError ? (
          <div className="rounded-md bg-brand-soft px-4 py-3 text-sm text-brand">
            {getAuthErrorMessage(registerMutation.error)}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={registerMutation.isPending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-brand px-6 text-sm font-semibold text-white transition hover:bg-dark disabled:pointer-events-none disabled:opacity-60"
      >
        {registerMutation.isPending ? 'Создаём аккаунт...' : 'Создать аккаунт'}
      </button>
    </form>
  );
}
