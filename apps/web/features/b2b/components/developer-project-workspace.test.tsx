import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';
import type { DeveloperB2BProject } from '../model/b2b.types';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock('../api/b2b-queries', () => ({
  useStartB2BFloorPlanAnalysisMutation: () => ({
    mutateAsync: mocks.analyze,
    isPending: false,
  }),
  useStartB2BProjectGenerationMutation: () => ({
    mutateAsync: mocks.start,
    isPending: false,
  }),
}));

import { DeveloperProjectWorkspace } from './developer-project-workspace';

function project(
  overrides: Partial<DeveloperB2BProject> = {},
): DeveloperB2BProject {
  return {
    id: 'project-1',
    type: 'DEVELOPER_FLOOR_PLAN',
    status: 'READY_TO_GENERATE',
    name: 'Квартира 12',
    partnerName: 'Новый девелопер',
    style: 'MODERN',
    managerComment: null,
    sourceImageUrl: null,
    sourcePlanFileId: 'file-1',
    roomProjectId: null,
    supplierId: null,
    supplier: null,
    roomType: null,
    products: [],
    roomProject: null,
    defaultCeilingHeightCm: 270,
    roomsRevision: 2,
    analysisRuns: [],
    rooms: [
      {
        id: 'room-1',
        status: 'READY_TO_GENERATE',
        sourceLabel: null,
        name: 'Гостиная',
        roomType: 'LIVING_ROOM',
        styleOverride: null,
        widthCm: 400,
        depthCm: 350,
        areaM2: 14,
        ceilingHeightCm: null,
        polygon: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
        recognitionConfidence: 0.9,
        recognitionNotes: null,
        sortOrder: 0,
        isIncluded: true,
        openings: [],
        roomProject: null,
      },
    ],
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  } as DeveloperB2BProject;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockResolvedValue({});
});

it('starts generation for all confirmed developer rooms', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(
    <DeveloperProjectWorkspace project={project()} />,
  );

  await user.click(
    screen.getByRole('button', { name: 'Запустить генерацию комнат' }),
  );

  expect(mocks.start).toHaveBeenCalledWith('project-1');
});

it('shows the final room visualization and its catalog selection', () => {
  const generatedProject = project({
    status: 'COMPLETED',
    rooms: [
      {
        ...project().rooms[0],
        status: 'GENERATED',
        roomProject: {
          generationJobs: [
            {
              id: 'job-1',
              status: 'COMPLETED',
              progress: 100,
              currentStep: 'Готово',
              errorMessage: null,
              designVariants: [
                {
                  id: 'variant-1',
                  title: 'Гостиная',
                  description: null,
                  imageUrl: 'https://placehold.co/1280x900?text=living-room',
                  totalPrice: 75_000,
                  currency: 'RUB',
                  products: [
                    {
                      id: 'link-1',
                      productId: 'product-1',
                      role: 'SOFA',
                      productSnapshot: {},
                      product: {
                        id: 'product-1',
                        title: 'Диван',
                        price: 75_000,
                        imageUrls: ['https://example.com/sofa.jpg'],
                        productUrl: 'https://example.com/sofa',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  } as unknown as Partial<DeveloperB2BProject>);

  renderWithQueryClient(
    <DeveloperProjectWorkspace project={generatedProject} />,
  );

  expect(
    screen.getByRole('img', { name: 'Визуализация: Гостиная' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Диван')).toBeInTheDocument();
  expect(screen.getAllByText(/75\s000\s₽/)).toHaveLength(2);
  expect(
    screen.getByRole('link', { name: 'Скачать визуализацию' }),
  ).toHaveAttribute('href', expect.stringContaining('variant-1/download'));
});
