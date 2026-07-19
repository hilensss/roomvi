import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';
import type { Product } from '@/shared/api/types';
import type { B2BProject } from '../model/b2b.types';

const mocks = vi.hoisted(() => ({
  project: {
    id: 'project-1',
    type: 'FURNITURE_LINE',
    status: 'DRAFT',
    name: 'Новая линейка',
    partnerName: 'Мебельный дом',
    supplierId: 'supplier-1',
    supplier: { id: 'supplier-1', name: 'Мебельный дом', logoUrl: null },
    roomType: 'LIVING_ROOM',
    style: 'SCANDI',
    managerComment: null,
    roomProjectId: null,
    products: [],
    roomProject: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  } as unknown as B2BProject,
  replace: vi.fn(),
  start: vi.fn(),
}));

function product(index: number): Product {
  return {
    id: `product-${index}`,
    supplierId: 'supplier-1',
    externalId: `external-${index}`,
    title: `Товар ${index}`,
    description: null,
    category: 'SOFA',
    roomTypes: ['LIVING_ROOM'],
    styleTags: ['SCANDI'],
    price: 10_000 + index,
    oldPrice: null,
    currency: 'RUB',
    stockStatus: 'IN_STOCK',
    imageUrls: [`https://example.com/product-${index}.jpg`],
    productUrl: null,
    widthCm: null,
    heightCm: null,
    depthCm: null,
    material: null,
    color: null,
    isActive: true,
    isAiEligible: true,
  };
}

vi.mock('../api/b2b-queries', () => ({
  useB2BProjectQuery: () => ({
    data: mocks.project,
    isLoading: false,
    isError: false,
  }),
  useB2BProjectCatalogQuery: () => ({
    data: {
      items: Array.from({ length: 7 }, (_, index) => product(index + 1)),
      total: 7,
      limit: 40,
      offset: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useReplaceB2BProjectProductsMutation: () => ({
    mutateAsync: mocks.replace,
    isPending: false,
  }),
  useStartB2BProjectGenerationMutation: () => ({
    mutateAsync: mocks.start,
    isPending: false,
  }),
}));

import { B2BProjectWorkspace } from './b2b-project-workspace';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.status = 'DRAFT';
  mocks.project.products = [];
  mocks.project.roomProject = null;
  mocks.project.products = [];
});

it('limits manual selection to six products and saves their exact ids', async () => {
  mocks.replace.mockResolvedValue({});
  const user = userEvent.setup();
  renderWithQueryClient(<B2BProjectWorkspace projectId="project-1" />);

  for (let index = 1; index <= 6; index += 1) {
    await user.click(
      screen.getByRole('button', { name: `Выбрать Товар ${index}` }),
    );
  }

  expect(
    screen.getByRole('button', { name: 'Выбрать Товар 7' }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Сохранить подборку (6)' }),
  );

  expect(mocks.replace).toHaveBeenCalledWith({
    projectId: 'project-1',
    productIds: [
      'product-1',
      'product-2',
      'product-3',
      'product-4',
      'product-5',
      'product-6',
    ],
  });
});

it('renders generated designs with their product selection and download links', () => {
  mocks.project.status = 'COMPLETED';
  mocks.project.roomProject = {
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
            roomProjectId: 'room-1',
            generationJobId: 'job-1',
            title: 'Вариант 1',
            description: null,
            imageUrl: 'https://example.com/design.jpg',
            totalPrice: 10001,
            currency: 'RUB',
            isSelected: false,
            products: [
              {
                id: 'link-1',
                designVariantId: 'variant-1',
                productId: 'product-1',
                role: 'SOFA',
                x: null,
                y: null,
                productSnapshot: {
                  id: 'product-1',
                  title: 'Снимок товара 1',
                  price: 7777,
                  currency: 'RUB',
                },
                product: product(1),
              },
            ],
            createdAt: '2026-07-19T00:00:00.000Z',
            updatedAt: '2026-07-19T00:00:00.000Z',
          },
        ],
      },
    ],
  };

  renderWithQueryClient(<B2BProjectWorkspace projectId="project-1" />);

  expect(screen.getByText('Вариант 1')).toBeInTheDocument();
  expect(screen.getByText('Снимок товара 1')).toBeInTheDocument();
  expect(screen.getByText('7 777 ₽')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Скачать визуализацию' })).toHaveAttribute(
    'href',
    'http://api.test/manager/b2b-projects/project-1/variants/variant-1/download',
  );
});

it('retries a failed generation with the unchanged saved selection', async () => {
  mocks.project.status = 'FAILED';
  mocks.project.products = [
    {
      id: 'selection-1',
      productId: 'product-1',
      sortOrder: 0,
      productSnapshot: {},
      product: product(1),
    },
  ];
  mocks.start.mockResolvedValue({});
  const user = userEvent.setup();

  renderWithQueryClient(<B2BProjectWorkspace projectId="project-1" />);

  const retryButton = screen.getByRole('button', {
    name: 'Повторить 2 визуализации',
  });
  expect(retryButton).toBeEnabled();
  await user.click(retryButton);
  expect(mocks.start).toHaveBeenCalledWith('project-1');
});
