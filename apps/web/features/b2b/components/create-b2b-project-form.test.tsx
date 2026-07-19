import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
  uploadB2BRoomImage: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('../api/b2b-queries', () => ({
  useB2BSuppliersQuery: () => ({
    data: [{ id: 'supplier-1', name: 'Мебельный дом', logoUrl: null }],
    isLoading: false,
    isError: false,
  }),
  useCreateB2BProjectMutation: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));
vi.mock('../api/b2b-api', () => ({
  uploadB2BRoomImage: mocks.uploadB2BRoomImage,
}));

import { CreateB2BProjectForm } from './create-b2b-project-form';

beforeEach(() => vi.clearAllMocks());

it('creates a furniture project and opens its manual selection workspace', async () => {
  mocks.mutateAsync.mockResolvedValue({ id: 'project-1' });
  const user = userEvent.setup();
  renderWithQueryClient(<CreateB2BProjectForm />);

  await user.type(screen.getByLabelText('Название проекта'), 'Новая линейка');
  await user.type(screen.getByLabelText('Партнёр'), 'Мебельный дом');
  await user.selectOptions(screen.getByLabelText('Поставщик'), 'supplier-1');
  await user.selectOptions(screen.getByLabelText('Комната'), 'LIVING_ROOM');
  await user.selectOptions(screen.getByLabelText('Стиль'), 'SCANDI');
  await user.type(screen.getByLabelText('Комментарий'), 'Светлая сцена');
  await user.click(screen.getByRole('button', { name: 'Создать проект' }));

  expect(mocks.mutateAsync).toHaveBeenCalledWith({
    name: 'Новая линейка',
    partnerName: 'Мебельный дом',
    supplierId: 'supplier-1',
    roomType: 'LIVING_ROOM',
    style: 'SCANDI',
    managerComment: 'Светлая сцена',
  });
  expect(mocks.push).toHaveBeenCalledWith('/manager/projects/project-1');
});

it('uploads an empty-room photo before creating the project', async () => {
  mocks.uploadB2BRoomImage.mockResolvedValue({
    file: { url: 'https://cdn.example.com/empty-room.jpg' },
  });
  mocks.mutateAsync.mockResolvedValue({ id: 'project-1' });
  const user = userEvent.setup();
  renderWithQueryClient(<CreateB2BProjectForm />);

  await user.type(screen.getByLabelText('Название проекта'), 'Новая линейка');
  await user.type(screen.getByLabelText('Партнёр'), 'Мебельный дом');
  await user.selectOptions(screen.getByLabelText('Поставщик'), 'supplier-1');
  const file = new File(['room'], 'empty-room.jpg', { type: 'image/jpeg' });
  await user.upload(
    screen.getByLabelText('Фото пустой комнаты (необязательно)'),
    file,
  );
  await user.click(screen.getByRole('button', { name: 'Создать проект' }));

  expect(mocks.uploadB2BRoomImage).toHaveBeenCalledWith(file);
  expect(mocks.mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceImageUrl: 'https://cdn.example.com/empty-room.jpg',
    }),
  );
});
