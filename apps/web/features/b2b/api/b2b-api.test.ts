import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/shared/api/api-client', () => ({ apiFetch }));

import {
  createB2BProject,
  getB2BProject,
  getB2BProjectCatalog,
  listB2BProjects,
  listB2BSuppliers,
  replaceB2BProjectProducts,
  startB2BProjectGeneration,
} from './b2b-api';

describe('b2b api', () => {
  beforeEach(() => apiFetch.mockReset());

  it('uses the manager project endpoints for list, detail, suppliers and catalog', async () => {
    await listB2BProjects(new URLSearchParams('limit=20&offset=0'));
    await getB2BProject('project-1');
    await listB2BSuppliers();
    await getB2BProjectCatalog(
      'project-1',
      new URLSearchParams('limit=40&search=sofa'),
    );

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/manager/b2b-projects?limit=20&offset=0',
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/manager/b2b-projects/project-1',
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/manager/b2b-projects/suppliers',
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/manager/b2b-projects/project-1/catalog?limit=40&search=sofa',
    );
  });

  it('creates projects, saves the exact selection and starts generation', async () => {
    const input = {
      name: 'Новая линейка',
      partnerName: 'Мебельный дом',
      supplierId: 'supplier-1',
      roomType: 'LIVING_ROOM' as const,
      style: 'SCANDI' as const,
      managerComment: '',
    };
    await createB2BProject(input);
    await replaceB2BProjectProducts('project-1', [
      'product-1',
      'product-2',
    ]);
    await startB2BProjectGeneration('project-1');

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/manager/b2b-projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/manager/b2b-projects/project-1/products',
      {
        method: 'PUT',
        body: JSON.stringify({
          productIds: ['product-1', 'product-2'],
        }),
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/manager/b2b-projects/project-1/generate',
      { method: 'POST' },
    );
  });
});
