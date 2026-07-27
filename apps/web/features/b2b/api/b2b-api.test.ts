import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch, buildApiUrl } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  buildApiUrl: vi.fn((path: string) => `https://api.example.com${path}`),
}));
vi.mock('@/shared/api/api-client', () => ({ apiFetch, buildApiUrl }));

import {
  createB2BProject,
  confirmB2BRooms,
  getB2BVariantDownloadUrl,
  getB2BFloorPlanUrl,
  getB2BProject,
  getB2BProjectCatalog,
  listB2BProjects,
  listB2BSuppliers,
  replaceB2BProjectProducts,
  replaceB2BRooms,
  startB2BFloorPlanAnalysis,
  startB2BProjectGeneration,
  uploadB2BRoomImage,
  uploadB2BFloorPlan,
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

  it('uploads an optional empty-room photo through the existing file endpoint', async () => {
    const file = new File(['room'], 'empty-room.jpg', {
      type: 'image/jpeg',
    });

    await uploadB2BRoomImage(file);

    expect(apiFetch).toHaveBeenCalledWith('/files/upload', {
      method: 'POST',
      body: expect.any(FormData),
    });
    const request = apiFetch.mock.calls[0][1];
    expect(request.body.get('file')).toBe(file);
  });

  it('uploads floor plans through the protected manager endpoint', async () => {
    const file = new File(['plan'], 'floor-plan.jpg', {
      type: 'image/jpeg',
    });

    await uploadB2BFloorPlan(file);

    expect(apiFetch).toHaveBeenCalledWith(
      '/manager/b2b-projects/floor-plans/upload',
      {
        method: 'POST',
        body: expect.any(FormData),
      },
    );
  });

  it('builds a protected attachment endpoint for generated images', () => {
    expect(getB2BVariantDownloadUrl('project-1', 'variant-1')).toBe(
      'https://api.example.com/manager/b2b-projects/project-1/variants/variant-1/download',
    );
  });

  it('builds a protected inline endpoint for a floor plan', () => {
    expect(getB2BFloorPlanUrl('project-1')).toBe(
      'https://api.example.com/manager/b2b-projects/project-1/floor-plan',
    );
  });

  it('uses revision-safe developer analysis and room endpoints', async () => {
    await startB2BFloorPlanAnalysis('project-1');
    await replaceB2BRooms({
      projectId: 'project-1',
      roomsRevision: 2,
      rooms: [],
    });
    await confirmB2BRooms('project-1', 2);

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/manager/b2b-projects/project-1/analyze-floor-plan',
      { method: 'POST' },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/manager/b2b-projects/project-1/rooms',
      {
        method: 'PUT',
        body: JSON.stringify({ roomsRevision: 2, rooms: [] }),
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      '/manager/b2b-projects/project-1/rooms/confirm',
      { method: 'POST', body: JSON.stringify({ roomsRevision: 2 }) },
    );
  });
});
