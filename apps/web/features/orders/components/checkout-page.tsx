'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Check, LockKeyhole } from 'lucide-react';
import {
  cloneElement,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useForm, type FieldError } from 'react-hook-form';
import { useCurrentUserQuery } from '@/features/auth/api/auth-queries';
import { AuthRequiredModal } from '@/features/auth/components/auth-required-modal';
import { useCurrentCartQuery } from '@/features/cart/api/cart-queries';
import {
  formatMoney,
  getCartItemsCount,
  getCartItemsTotal,
  isRealCart,
} from '@/features/cart/lib/cart.helpers';
import { useCreateOrderMutation } from '../api/orders-queries';
import {
  getOrCreateIdempotencyKey,
  sanitizeCheckoutValues,
  validateCheckoutValues,
  type CheckoutFormValues,
} from '../lib/checkout-input';

const emptyValues: CheckoutFormValues = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  deliveryCity: '',
  deliveryAddress: '',
  deliveryPostalCode: '',
  deliveryComment: '',
  customerComment: '',
};

export function CheckoutPage() {
  const router = useRouter();
  const currentUserQuery = useCurrentUserQuery();
  const cartQuery = useCurrentCartQuery();
  const createOrderMutation = useCreateOrderMutation();
  const [authOpen, setAuthOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => getOrCreateIdempotencyKey(null));
  const form = useForm<CheckoutFormValues>({ defaultValues: emptyValues });

  useEffect(() => {
    const user = currentUserQuery.data;
    if (!user) return;

    form.reset({
      ...emptyValues,
      customerName: user.name ?? '',
      customerEmail: user.email,
      customerPhone: user.phone ?? '',
    });
  }, [currentUserQuery.data, form]);

  if (currentUserQuery.isLoading || cartQuery.isLoading) {
    return <PageMessage>Готовим оформление заказа...</PageMessage>;
  }

  if (!currentUserQuery.data) {
    return (
      <div className="rv-container py-16">
        <div className="mx-auto max-w-xl rounded-card border border-line/60 p-10 text-center">
          <LockKeyhole className="mx-auto mb-5 size-10 text-brand" />
          <h1 className="text-3xl font-semibold text-ink">Войдите в аккаунт</h1>
          <p className="mt-3 text-ink-soft">
            Оформление заказа доступно после авторизации.
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="mt-7 rounded-pill bg-brand px-6 py-3 font-medium text-white transition hover:bg-dark"
          >
            Войти или зарегистрироваться
          </button>
        </div>
        <AuthRequiredModal
          open={authOpen}
          reason="checkout-required"
          initialMode="register"
          onClose={() => setAuthOpen(false)}
          onSuccess={() => setAuthOpen(false)}
        />
      </div>
    );
  }

  if (cartQuery.isError) {
    return (
      <PageMessage>
        Не удалось загрузить корзину. Вернитесь в корзину и попробуйте снова.
      </PageMessage>
    );
  }

  const cart = cartQuery.data;
  const items = isRealCart(cart) ? cart.items : [];
  if (items.length === 0) {
    return (
      <div className="rv-container py-16">
        <div className="rounded-card border border-line/60 p-10 text-center">
          <h1 className="text-3xl font-semibold text-ink">Корзина пуста</h1>
          <p className="mt-3 text-ink-soft">
            Добавьте товары перед оформлением заказа.
          </p>
          <Link
            href="/cart"
            className="mt-7 inline-flex rounded-pill bg-dark px-6 py-3 text-white transition hover:bg-brand"
          >
            Вернуться в корзину
          </Link>
        </div>
      </div>
    );
  }

  const totalAmount = getCartItemsTotal(items);
  const itemsCount = getCartItemsCount(items);

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors();
    const validationErrors = validateCheckoutValues(values);
    if (Object.keys(validationErrors).length > 0) {
      for (const [field, message] of Object.entries(validationErrors)) {
        form.setError(field as keyof CheckoutFormValues, {
          type: 'validate',
          message,
        });
      }
      return;
    }

    setSubmitError(null);
    try {
      const order = await createOrderMutation.mutateAsync({
        input: sanitizeCheckoutValues(values),
        idempotencyKey,
      });
      router.replace(`/account?order=${order.id}&created=1`);
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 400 || status === 409) {
        await cartQuery.refetch().catch(() => undefined);
      }
      setSubmitError(getCheckoutErrorMessage(error));
    }
  });

  return (
    <div className="min-h-full bg-[#fbfaf8]">
      <div className="border-b border-line/40 bg-white">
        <div className="rv-container-wide flex items-center gap-3 py-5 text-sm">
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 text-ink-soft transition hover:text-brand"
          >
            <ArrowLeft size={16} />
            Корзина
          </Link>
          <span className="text-line">·</span>
          <span className="font-medium text-ink">Оформление</span>
        </div>
      </div>

      <div className="rv-container-wide py-10 md:py-14">
        <div className="mb-10 max-w-3xl">
          <p className="rv-eyebrow mb-3">Последний шаг</p>
          <h1 className="text-section-title text-ink">
            Куда доставить{' '}
            <span className="font-normal italic text-brand">ваш интерьер</span>?
          </h1>
          <p className="mt-3 text-body-lg text-ink-soft">
            Итоговую стоимость и наличие товаров сервер проверит ещё раз при
            оформлении.
          </p>
        </div>

        <form
          noValidate
          onSubmit={submit}
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_390px]"
        >
          <main className="space-y-6">
            <FormSection title="Контактные данные" number="01">
              <div className="grid gap-5 md:grid-cols-2">
                <FormField
                  label="Имя и фамилия"
                  error={form.formState.errors.customerName}
                  className="md:col-span-2"
                >
                  <input
                    {...form.register('customerName')}
                    autoComplete="name"
                    className="rv-input"
                  />
                </FormField>
                <FormField label="Email" error={form.formState.errors.customerEmail}>
                  <input
                    {...form.register('customerEmail')}
                    type="email"
                    autoComplete="email"
                    className="rv-input"
                  />
                </FormField>
                <FormField label="Телефон" error={form.formState.errors.customerPhone}>
                  <input
                    {...form.register('customerPhone')}
                    type="tel"
                    autoComplete="tel"
                    className="rv-input"
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Адрес доставки" number="02">
              <div className="grid gap-5 md:grid-cols-[1fr_180px]">
                <FormField label="Город" error={form.formState.errors.deliveryCity}>
                  <input
                    {...form.register('deliveryCity')}
                    autoComplete="address-level2"
                    className="rv-input"
                  />
                </FormField>
                <FormField
                  label="Почтовый индекс"
                  error={form.formState.errors.deliveryPostalCode}
                >
                  <input
                    {...form.register('deliveryPostalCode')}
                    autoComplete="postal-code"
                    className="rv-input"
                  />
                </FormField>
                <FormField
                  label="Адрес доставки"
                  error={form.formState.errors.deliveryAddress}
                  className="md:col-span-2"
                >
                  <input
                    {...form.register('deliveryAddress')}
                    autoComplete="street-address"
                    className="rv-input"
                  />
                </FormField>
                <FormField
                  label="Комментарий курьеру"
                  error={form.formState.errors.deliveryComment}
                  className="md:col-span-2"
                >
                  <textarea
                    {...form.register('deliveryComment')}
                    rows={3}
                    className="rv-input min-h-24 resize-y"
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Комментарий к заказу" number="03">
              <FormField
                label="Пожелания для менеджера"
                error={form.formState.errors.customerComment}
              >
                <textarea
                  {...form.register('customerComment')}
                  rows={4}
                  className="rv-input min-h-28 resize-y"
                />
              </FormField>
            </FormSection>
          </main>

          <aside className="rounded-card bg-dark p-7 text-white lg:sticky lg:top-28">
            <p className="text-xs uppercase tracking-[0.2em] text-brand">
              Ваш заказ
            </p>
            <div className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 py-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {item.titleSnapshot}
                    </div>
                    <div className="mt-1 text-line">{item.quantity} шт.</div>
                  </div>
                  <div className="font-medium">
                    {formatMoney(item.priceSnapshot * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 py-6 text-sm">
              <div className="flex justify-between text-line">
                <span>Товары · {itemsCount} шт.</span>
                <span className="text-white">{formatMoney(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-line">
                <span>Доставка</span>
                <span className="text-white">Бесплатно</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-6">
              <span className="text-line">Итого</span>
              <span className="text-3xl font-semibold">
                {formatMoney(totalAmount)}
              </span>
            </div>

            {submitError ? (
              <div role="alert" className="mt-5 rounded-lg bg-white/10 p-4 text-sm">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{submitError}</span>
                </div>
                <Link href="/cart" className="mt-2 inline-block text-brand underline">
                  Проверить корзину
                </Link>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={createOrderMutation.isPending}
              className="mt-6 flex w-full items-center justify-center rounded-pill bg-brand px-6 py-4 font-medium transition hover:bg-brand-hover disabled:opacity-60"
            >
              {createOrderMutation.isPending
                ? 'Оформляем...'
                : submitError
                  ? 'Повторить оформление'
                  : 'Оформить заказ'}
            </button>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-line">
              <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
              После оформления менеджер свяжется с вами для подтверждения.
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}

function FormSection({
  title,
  number,
  children,
}: {
  title: string;
  number: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line/50 bg-white p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="font-mono text-xs text-brand">{number}</span>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FormField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: FieldError;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean }>;
}) {
  const id = label.toLowerCase().replaceAll(' ', '-');
  return (
    <label htmlFor={id} className={className}>
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      {cloneElement(children, {
        id,
        'aria-invalid': Boolean(error),
      })}
      {error?.message ? (
        <span className="mt-1.5 block text-xs text-red-700">{error.message}</span>
      ) : null}
    </label>
  );
}

function PageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rv-container py-16 text-center text-ink-soft">{children}</div>
  );
}

function getCheckoutErrorMessage(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 409) {
    return 'Корзина или заказ изменились. Обновите корзину и повторите оформление.';
  }
  if (status === 400) {
    return 'Проверьте наличие товаров и заполненные данные.';
  }
  return error instanceof Error
    ? error.message
    : 'Не удалось оформить заказ. Попробуйте ещё раз.';
}

function getErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : null;
}
