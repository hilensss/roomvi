import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../api/auth-queries', () => ({
  getAuthErrorMessage: () => 'Ошибка регистрации',
  useRegisterMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
    isError: false,
  }),
}));

import { RegisterForm } from './register-form';

beforeEach(() => vi.clearAllMocks());

it('uses the same eight-character password minimum as the API', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<RegisterForm />);

  await user.type(screen.getByLabelText('Имя'), 'Ада');
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Пароль'), '1234567');
  await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

  expect(
    screen.getByText('Пароль должен быть не короче 8 символов'),
  ).toBeInTheDocument();
  expect(mocks.mutate).not.toHaveBeenCalled();

  await user.type(screen.getByPlaceholderText('Минимум 8 символов'), '8');
  await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

  expect(mocks.mutate).toHaveBeenCalledWith(
    {
      name: 'Ада',
      email: 'ada@example.com',
      phone: undefined,
      password: '12345678',
    },
    { onSuccess: undefined },
  );
});
