export type CheckoutFormValues = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryCity: string;
  deliveryAddress: string;
  deliveryPostalCode: string;
  deliveryComment: string;
  customerComment: string;
};

export type CheckoutFieldErrors = Partial<
  Record<keyof CheckoutFormValues, string>
>;

function optionalValue(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function sanitizeCheckoutValues(values: CheckoutFormValues) {
  return {
    customerName: values.customerName.trim(),
    customerEmail: values.customerEmail.trim(),
    customerPhone: values.customerPhone.trim(),
    deliveryCity: values.deliveryCity.trim(),
    deliveryAddress: values.deliveryAddress.trim(),
    ...(optionalValue(values.deliveryPostalCode)
      ? { deliveryPostalCode: optionalValue(values.deliveryPostalCode) }
      : {}),
    ...(optionalValue(values.deliveryComment)
      ? { deliveryComment: optionalValue(values.deliveryComment) }
      : {}),
    ...(optionalValue(values.customerComment)
      ? { customerComment: optionalValue(values.customerComment) }
      : {}),
  };
}

export function validateCheckoutValues(
  values: CheckoutFormValues,
): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim()]),
  ) as CheckoutFormValues;

  if (normalized.customerName.length < 2 || normalized.customerName.length > 120) {
    errors.customerName = 'Укажите имя длиной от 2 до 120 символов';
  }

  if (
    normalized.customerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.customerEmail)
  ) {
    errors.customerEmail =
      'Укажите корректный email длиной до 254 символов';
  }

  if (
    normalized.customerPhone.length < 5 ||
    normalized.customerPhone.length > 32
  ) {
    errors.customerPhone = 'Укажите телефон длиной от 5 до 32 символов';
  }

  if (normalized.deliveryCity.length < 2 || normalized.deliveryCity.length > 120) {
    errors.deliveryCity = 'Укажите город длиной от 2 до 120 символов';
  }

  if (
    normalized.deliveryAddress.length < 5 ||
    normalized.deliveryAddress.length > 500
  ) {
    errors.deliveryAddress = 'Укажите адрес длиной от 5 до 500 символов';
  }

  if (normalized.deliveryPostalCode.length > 32) {
    errors.deliveryPostalCode = 'Индекс должен быть не длиннее 32 символов';
  }

  if (normalized.deliveryComment.length > 1000) {
    errors.deliveryComment =
      'Комментарий должен быть не длиннее 1000 символов';
  }

  if (normalized.customerComment.length > 1000) {
    errors.customerComment =
      'Комментарий должен быть не длиннее 1000 символов';
  }

  return errors;
}

export function getOrCreateIdempotencyKey(
  currentKey: string | null,
  createKey: () => string = () => crypto.randomUUID(),
) {
  return currentKey ?? createKey();
}
