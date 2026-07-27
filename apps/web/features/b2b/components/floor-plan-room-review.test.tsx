import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';
import { ApiError } from '@/shared/api/api-client';
import type { DeveloperB2BProject } from '../model/b2b.types';

const mocks = vi.hoisted(() => ({
  replaceRooms: vi.fn(),
  confirmRooms: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock('../api/b2b-queries', () => ({
  b2bQueryKeys: {
    detail: (projectId: string) => ['manager', 'b2b-projects', projectId],
  },
  useReplaceB2BRoomsMutation: () => ({
    mutateAsync: mocks.replaceRooms,
    isPending: false,
  }),
  useConfirmB2BRoomsMutation: () => ({
    mutateAsync: mocks.confirmRooms,
    isPending: false,
  }),
}));
vi.mock('../api/b2b-api', () => ({
  getB2BProject: mocks.getProject,
}));

import { FloorPlanRoomReview } from './floor-plan-room-review';

const project = {
  id: 'project-1',
  type: 'DEVELOPER_FLOOR_PLAN',
  status: 'REVIEW_REQUIRED',
  name: 'Квартира 12',
  partnerName: 'Новый девелопер',
  supplierId: null,
  supplier: null,
  roomType: null,
  style: 'SCANDI',
  managerComment: null,
  sourceImageUrl: 'https://cdn.example.com/floor-plan.jpg',
  defaultCeilingHeightCm: 270,
  roomsRevision: 1,
  products: [],
  roomProjectId: null,
  roomProject: null,
  analysisRuns: [],
  rooms: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'REVIEW_REQUIRED',
      sourceLabel: null,
      name: 'Комната 1',
      roomType: null,
      styleOverride: null,
      widthCm: 350,
      depthCm: 400,
      areaM2: 14,
      ceilingHeightCm: null,
      polygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
      ],
      recognitionConfidence: 0.6,
      recognitionNotes: 'Проверьте тип',
      sortOrder: 0,
      isIncluded: true,
      openings: [],
    },
  ],
  createdAt: '2026-07-27T00:00:00.000Z',
  updatedAt: '2026-07-27T00:00:00.000Z',
} satisfies DeveloperB2BProject;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.replaceRooms.mockResolvedValue(project);
  mocks.confirmRooms.mockResolvedValue({
    ...project,
    status: 'READY_TO_GENERATE',
  });
  mocks.getProject.mockResolvedValue(project);
});

it('shows the detected polygon and blocks confirmation until the room is reviewed', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<FloorPlanRoomReview project={project} />);

  expect(
    screen.getByRole('img', { name: 'Планировка квартиры' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Контур Комната 1')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Подтвердить комнаты' }),
  ).toBeDisabled();

  await user.selectOptions(screen.getByLabelText('Тип комнаты'), 'LIVING_ROOM');
  await user.click(screen.getByRole('button', { name: 'Добавить окно' }));
  expect(screen.getByLabelText('Стена проёма 1')).toHaveValue(0);

  await user.click(screen.getByRole('button', { name: 'Сохранить комнаты' }));

  expect(mocks.replaceRooms).toHaveBeenCalledWith({
    projectId: 'project-1',
    roomsRevision: 1,
    rooms: [
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        roomType: 'LIVING_ROOM',
        openings: [
          expect.objectContaining({
            kind: 'WINDOW',
            wallSegmentIndex: 0,
            positionRatio: 0.5,
          }),
        ],
      }),
    ],
  });
});

it('updates polygon coordinates through accessible controls', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<FloorPlanRoomReview project={project} />);

  const xInput = screen.getByLabelText('Точка 1 X');
  await user.clear(xInput);
  await user.type(xInput, '0.2');

  expect(xInput).toHaveValue(0.2);
});

it('omits temporary room and opening ids when saving manual additions', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<FloorPlanRoomReview project={project} />);

  await user.click(screen.getByRole('button', { name: 'Добавить комнату' }));
  await user.selectOptions(screen.getByLabelText('Тип комнаты'), 'BEDROOM');
  await user.clear(screen.getByLabelText('Ширина, см'));
  await user.type(screen.getByLabelText('Ширина, см'), '320');
  await user.clear(screen.getByLabelText('Глубина, см'));
  await user.type(screen.getByLabelText('Глубина, см'), '410');
  await user.click(screen.getByRole('button', { name: 'Добавить окно' }));
  await user.click(screen.getByRole('button', { name: 'Сохранить комнаты' }));

  const submittedRooms = mocks.replaceRooms.mock.calls[0][0].rooms;
  const addedRoom = submittedRooms.at(-1);
  assertNoTemporaryId(addedRoom.id);
  assertNoTemporaryId(addedRoom.openings[0].id);
});

function assertNoTemporaryId(value: unknown) {
  expect(value === undefined || /^[0-9a-f-]{36}$/i.test(String(value))).toBe(
    true,
  );
}

it('reloads the latest room draft after a revision conflict', async () => {
  mocks.replaceRooms.mockRejectedValue(
    new ApiError('Rooms were changed by another manager', 409),
  );
  mocks.getProject.mockResolvedValue({
    ...project,
    roomsRevision: 2,
    rooms: [{ ...project.rooms[0], name: 'Актуальная гостиная' }],
  });
  const user = userEvent.setup();
  renderWithQueryClient(<FloorPlanRoomReview project={project} />);

  await user.type(screen.getByLabelText('Название'), ' локально');
  await user.click(screen.getByRole('button', { name: 'Сохранить комнаты' }));

  expect(await screen.findByDisplayValue('Актуальная гостиная')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Комнаты изменились в другой вкладке. Загружена актуальная версия.',
    ),
  ).toBeInTheDocument();
});
