import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Menu Items API
import { GET as GET_ITEMS, POST as POST_ITEM } from '../../app/api/menu/items/route';
import { PATCH as PATCH_ITEM, DELETE as DELETE_ITEM } from '../../app/api/menu/items/[id]/route';

// Mock menu.actions
vi.mock('@/lib/actions/menu.actions', () => ({
  getMenuItems: vi.fn(),
  createMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  deleteMenuItem: vi.fn(),
}));

import * as menuActions from '@/lib/actions/menu.actions';

describe('API: /api/menu/items', () => {
  const mockUrl = 'http://localhost/api/menu/items';

  beforeEach(() => vi.clearAllMocks());

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
      vi.mocked(menuActions.updateMenuItem).mockResolvedValue({ success: true });

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
      vi.mocked(menuActions.updateMenuItem).mockResolvedValue({ success: false, error: 'Document not found' });

      const req = new NextRequest(`${mockUrl}/nonexistent`, {
        method: 'PATCH',
        body: JSON.stringify({ price: 900 }),
        headers: { 'Content-Type': 'application/json' }
      });
      const res = await PATCH_ITEM(req, { params: { id: 'nonexistent' } });

      expect(res.status).toBe(404);
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
