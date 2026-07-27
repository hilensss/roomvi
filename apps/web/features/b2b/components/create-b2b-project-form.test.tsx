import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
  startAnalysis: vi.fn(),
  uploadB2BRoomImage: vi.fn(),
  uploadB2BFloorPlan: vi.fn(),
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
  useStartB2BFloorPlanAnalysisMutation: () => ({
    mutateAsync: mocks.startAnalysis,
    isPending: false,
  }),
}));
vi.mock('../api/b2b-api', () => ({
  uploadB2BRoomImage: mocks.uploadB2BRoomImage,
  uploadB2BFloorPlan: mocks.uploadB2BFloorPlan,
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

it('creates a developer project from a private floor plan and starts analysis automatically', async () => {
  mocks.uploadB2BFloorPlan.mockResolvedValue({
    file: {
      id: '11111111-1111-4111-8111-111111111111',
    },
  });
  mocks.mutateAsync.mockResolvedValue({
    id: 'developer-project-1',
    type: 'DEVELOPER_FLOOR_PLAN',
  });
  mocks.startAnalysis.mockResolvedValue({ id: 'analysis-1' });
  const user = userEvent.setup();
  renderWithQueryClient(<CreateB2BProjectForm />);

  await user.click(
    screen.getByRole('button', { name: 'Для застройщика' }),
  );
  expect(screen.queryByLabelText('Поставщик')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Комната')).not.toBeInTheDocument();

  await user.type(screen.getByLabelText('Название проекта'), 'Квартира 12');
  await user.type(screen.getByLabelText('Партнёр'), 'Новый девелопер');
  const file = new File(['plan'], 'floor-plan.jpg', {
    type: 'image/jpeg',
  });
  await user.upload(screen.getByLabelText('Планировка квартиры'), file);
  await user.clear(screen.getByLabelText('Высота потолка, см'));
  await user.type(screen.getByLabelText('Высота потолка, см'), '285');
  const submit = screen.getByRole('button', {
    name: 'Создать и распознать',
  });
  expect(submit).toBeEnabled();
  await user.click(submit);

  expect(mocks.uploadB2BFloorPlan).toHaveBeenCalledWith(file);
  expect(mocks.uploadB2BRoomImage).not.toHaveBeenCalled();
  expect(mocks.mutateAsync).toHaveBeenCalledWith({
    type: 'DEVELOPER_FLOOR_PLAN',
    name: 'Квартира 12',
    partnerName: 'Новый девелопер',
    style: 'SCANDI',
    defaultCeilingHeightCm: 285,
    managerComment: '',
    sourcePlanFileId: '11111111-1111-4111-8111-111111111111',
  });
  expect(mocks.startAnalysis).toHaveBeenCalledWith('developer-project-1');
  expect(mocks.push).toHaveBeenCalledWith(
    '/manager/projects/developer-project-1',
  );
});

it('opens the created project even when automatic analysis start fails', async () => {
  mocks.uploadB2BFloorPlan.mockResolvedValue({
    file: {
      id: '11111111-1111-4111-8111-111111111111',
    },
  });
  mocks.mutateAsync.mockResolvedValue({
    id: 'developer-project-1',
    type: 'DEVELOPER_FLOOR_PLAN',
  });
  mocks.startAnalysis.mockRejectedValue(new Error('queue unavailable'));
  const user = userEvent.setup();
  renderWithQueryClient(<CreateB2BProjectForm />);

  await user.click(screen.getByRole('button', { name: 'Для застройщика' }));
  await user.type(screen.getByLabelText('Название проекта'), 'Квартира 12');
  await user.type(screen.getByLabelText('Партнёр'), 'Новый девелопер');
  await user.upload(
    screen.getByLabelText('Планировка квартиры'),
    new File(['plan'], 'floor-plan.jpg', { type: 'image/jpeg' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Создать и распознать' }),
  );

  expect(mocks.push).toHaveBeenCalledWith(
    '/manager/projects/developer-project-1',
  );
});
