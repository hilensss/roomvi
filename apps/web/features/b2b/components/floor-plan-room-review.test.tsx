import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';
import type { DeveloperB2BProject } from '../model/b2b.types';

const mocks = vi.hoisted(() => ({
  replaceRooms: vi.fn(),
  confirmRooms: vi.fn(),
}));

vi.mock('../api/b2b-queries', () => ({
  useReplaceB2BRoomsMutation: () => ({
    mutateAsync: mocks.replaceRooms,
    isPending: false,
  }),
  useConfirmB2BRoomsMutation: () => ({
    mutateAsync: mocks.confirmRooms,
    isPending: false,
  }),
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
      id: 'room-1',
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
        id: 'room-1',
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
