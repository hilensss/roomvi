import { AuthReason } from './auth.types';

export const reasonText: Record<
  AuthReason,
  { title: string; description: string }
> = {
  'guest-generation-limit': {
    title: 'Создайте аккаунт, чтобы продолжить',
    description:
      'Бесплатный гостевой лимит закончился. После регистрации вы сможете продолжить создавать проекты и сохранять результаты.',
  },
  'checkout-required': {
    title: 'Войдите, чтобы оформить заказ',
    description:
      'Корзина сохранится, а после входа вы сможете оформить заказ и отслеживать его статус.',
  },
  'save-project': {
    title: 'Войдите, чтобы сохранить проект',
    description:
      'Аккаунт нужен, чтобы проект не потерялся и был доступен на других устройствах.',
  },
  default: {
    title: 'Войдите в Roomvi',
    description: '',
  },
};
