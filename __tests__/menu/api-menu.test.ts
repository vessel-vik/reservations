import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() =>
    Promise.resolve({ userId: 'user_test', orgId: 'org_test', sessionId: 'sess_test' })
  ),
}));

// Menu Items API
import { GET as GET_ITEMS, POST as POST_ITEM } from '../../app/api/menu/items/route';
import { PATCH as PATCH_ITEM, DELETE as DELETE_ITEM } from '../../app/api/menu/items/[id]/route';
import { POST as POST_IMAGE } from '../../app/api/menu/items/[id]/image/route';

// Mock menu.actions
vi.mock('@/lib/actions/menu.actions', () => ({
  getMenuItems: vi.fn(),
  createMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  deleteMenuItem: vi.fn(),
}));

vi.mock('@/lib/appwrite.config', () => ({
  storage: { createFile: vi.fn() },
  DATABASE_ID: 'db1',
  MENU_ITEMS_COLLECTION_ID: 'menu_coll',
  databases: { updateDocument: vi.fn(), getDocument: vi.fn(), deleteDocument: vi.fn() },
}));
vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>();
  return { ...actual, ID: { unique: () => 'mock-id' }, InputFile: actual.InputFile };
});

import * as menuActions from '@/lib/actions/menu.actions';
import { storage, databases } from '@/lib/appwrite.config';

process.env.MENU_IMAGES_BUCKET_ID = 'img-bucket';
process.env.NEXT_PUBLIC_ENDPOINT = 'https://cloud.appwrite.io/v1';
process.env.NEXT_PUBLIC_PROJECT_ID = 'test-proj';

describe('API: /api/menu/items', () => {
  const mockUrl = 'http://localhost/api/menu/items';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(databases.getDocument).mockResolvedValue({
      $id: 'item1',
      businessId: 'org_test',
    } as any);
  });

  describe('GET /api/menu/items', () => {
    it('returns 200 with array of items', async () => {
      const mockItems = [
        { $id: 'item1', name: 'Chicken Burger', price: 850, stock: 20, isAvailable: true }
      ];
      vi.mocked(menuActions.getMenuItems).mockResolvedValue({ success: true, items: mockItems });

      const req = new NextRequest(mockUrl);
      const res = await GET_ITEMS(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toEqual(mockItems);
    });

    it('filters by categoryId when provided', async () => {
      vi.mocked(menuActions.getMenuItems).mockResolvedValue({ success: true, items: [] });

      const req = new NextRequest(`${mockUrl}?categoryId=cat1`);
      await GET_ITEMS(req);

      expect(menuActions.getMenuItems).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat1' }));
    });
  });

  describe('POST /api/menu/items', () => {
    it('returns 201 on valid item creation', async () => {
      const newItem = { name: 'Fish Tacos', price: 750, categoryId: 'cat1' };
      vi.mocked(menuActions.createMenuItem).mockResolvedValue({ success: true, item: { $id: 'item2', ...newItem } });

      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify(newItem),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await POST_ITEM(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.item).toMatchObject(newItem);
      expect(menuActions.createMenuItem).toHaveBeenCalledWith(
        expect.objectContaining({ ...newItem, businessId: 'org_test' })
      );
    });

    it('returns 400 when name is missing', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ price: 750 }),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await POST_ITEM(req);

      expect(res.status).toBe(400);
    });

    it('returns 400 when price is negative', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ name: 'Item', price: -10, categoryId: 'cat1' }),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await POST_ITEM(req);

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/menu/items/[id]', () => {
    it('auto-sets isAvailable to false when stock patched to 0', async () => {
      vi.mocked(menuActions.updateMenuItem).mockResolvedValue({
        success: true,
        item: { $id: 'item1', stock: 0, isAvailable: false } as any,
      });

      const req = new NextRequest(`${mockUrl}/item1`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: 0 }),
        headers: { 'Content-Type': 'application/json' }
      });
      await PATCH_ITEM(req, { params: { id: 'item1' } });

      expect(menuActions.updateMenuItem).toHaveBeenCalledWith(
        'item1',
        expect.objectContaining({ stock: 0, isAvailable: false })
      );
    });

    it('returns 404 when item does not exist', async () => {
      vi.mocked(databases.getDocument).mockRejectedValueOnce(new Error('not found'));

      const req = new NextRequest(`${mockUrl}/nonexistent`, {
        method: 'PATCH',
        body: JSON.stringify({ price: 900 }),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await PATCH_ITEM(req, { params: { id: 'nonexistent' } });

      expect(res.status).toBe(404);
    });

    it('returns 400 when stock is negative', async () => {
      const req = new NextRequest(`${mockUrl}/item1`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: -1 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH_ITEM(req, { params: { id: 'item1' } });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/cannot be negative/);
    });

    it('returns { item } with the updated document', async () => {
      vi.mocked(menuActions.updateMenuItem).mockResolvedValueOnce({
        success: true,
        item: { $id: 'item1', stock: 5, isAvailable: true } as any,
      });
      const req = new NextRequest(`${mockUrl}/item1`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: 5 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH_ITEM(req, { params: { id: 'item1' } });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.item).toBeDefined();
      expect(body.item.$id).toBe('item1');
    });

    it('sets isAvailable=false in patch payload when stock === 0', async () => {
      vi.mocked(menuActions.updateMenuItem).mockResolvedValueOnce({
        success: true,
        item: { $id: 'item1', stock: 0, isAvailable: false } as any,
      });
      const req = new NextRequest(`${mockUrl}/item1`, {
        method: 'PATCH',
        body: JSON.stringify({ stock: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await PATCH_ITEM(req, { params: { id: 'item1' } });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.item.isAvailable).toBe(false);
    });
  });

  describe('DELETE /api/menu/items/[id]', () => {
    it('returns 204 on successful delete', async () => {
      vi.mocked(menuActions.deleteMenuItem).mockResolvedValue({ success: true });

      const req = new NextRequest(`${mockUrl}/item1`, { method: 'DELETE' });
      const res = await DELETE_ITEM(req, { params: { id: 'item1' } });

      expect(res.status).toBe(204);
    });
  });
});

describe('POST /api/menu/items/[id]/image', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns imageUrl on successful JPEG upload', async () => {
    vi.mocked(storage.createFile).mockResolvedValueOnce({ $id: 'img123' } as any);
    const form = new FormData();
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    form.append('file', file);
    const req = new NextRequest('http://localhost/api/menu/items/item1/image', {
      method: 'POST',
      body: form,
    });
    (req as any).formData = async () => form;
    const res = await POST_IMAGE(req, { params: { id: 'item1' } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.imageUrl).toContain('img123');
  });

  it('returns 400 when no file provided', async () => {
    const emptyForm = new FormData();
    const req = new NextRequest('http://localhost/api/menu/items/item1/image', {
      method: 'POST',
      body: emptyForm,
    });
    (req as any).formData = async () => emptyForm;
    const res = await POST_IMAGE(req, { params: { id: 'item1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No file provided');
  });

  it('returns 400 when file exceeds 10 MB', async () => {
    const chunkCount = 11;
    const chunkSize = 1024 * 1024;
    const chunks = Array(chunkCount).fill(null).map(() => new Blob(['x'.repeat(chunkSize)]));
    const largeBlob = new Blob(chunks, { type: 'image/jpeg' });
    const file = new File([largeBlob], 'big.jpg', { type: 'image/jpeg' });
    const form = new FormData();
    form.append('file', file);
    const req = new NextRequest('http://localhost/api/menu/items/item1/image', {
      method: 'POST',
      body: form,
    });
    (req as any).formData = async () => form;
    const res = await POST_IMAGE(req, { params: { id: 'item1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/10 MB/);
  });

  it('returns 400 for unsupported MIME (PDF)', async () => {
    const form = new FormData();
    form.append('file', new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    const req = new NextRequest('http://localhost/api/menu/items/item1/image', {
      method: 'POST',
      body: form,
    });
    (req as any).formData = async () => form;
    const res = await POST_IMAGE(req, { params: { id: 'item1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unsupported/);
  });
});
