import { describe, it, expect, vi } from 'vitest';
import { GET, POST } from '@/app/api/menu/modifiers/route';
import { PATCH, DELETE } from '@/app/api/menu/modifiers/[id]/route';

vi.mock('@/lib/actions/modifier.actions', () => ({
  getModifierGroups: vi.fn().mockResolvedValue({ success: true, groups: [{ $id: 'group1' }] }),
  createModifierGroup: vi.fn().mockResolvedValue({ success: true, group: { $id: 'group1' } }),
  updateModifierGroup: vi.fn((id) => {
    if (id === 'unknown') return { success: false, error: 'not found' };
    return { success: true, group: { $id: id } };
  }),
  deleteModifierGroup: vi.fn((id) => {
    if (id === 'unknown') return { success: false, error: 'not found' };
    return { success: true };
  }),
}));

const mockRequest = (body?: any) => ({
  json: async () => body,
} as any);

describe('API: /api/menu/modifiers', () => {
  it('GET /api/menu/modifiers returns list of modifier groups', async () => {
    const res = await GET({} as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.groups).toHaveLength(1);
  });

  it('POST /api/menu/modifiers creates modifier group and returns 201', async () => {
    const req = mockRequest({ name: 'Sauces', options: ['Peri-Peri:0', 'Extra Chilli:100'] });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('POST /api/menu/modifiers returns 400 when name is missing', async () => {
    const req = mockRequest({ options: ['Peri-Peri:0'] });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('POST /api/menu/modifiers returns 400 when options array is empty', async () => {
    const req = mockRequest({ name: 'Sauces', options: [] });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/options must have at least one entry/i);
  });

  it('POST /api/menu/modifiers returns 400 for invalid option format (missing colon)', async () => {
    const req = mockRequest({ name: 'Sauces', options: ['InvalidFormat'] });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/invalid option format/i);
  });

  it('PATCH /api/menu/modifiers/[id] updates modifier group name', async () => {
    const req = mockRequest({ name: 'New Name' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'group1' }) });
    expect(res.status).toBe(200);
  });

  it('PATCH /api/menu/modifiers/[id] returns 404 for unknown groupId', async () => {
    const req = mockRequest({ name: 'New Name' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'unknown' }) });
    expect(res.status).toBe(404);
  });

  it('PATCH /api/menu/modifiers/[id] accepts defaultOptionIndex in payload', async () => {
    const req = mockRequest({ name: 'Updated', defaultOptionIndex: 2 });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'group1' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/menu/modifiers/[id] returns 200 on success', async () => {
    const res = await DELETE({} as any, { params: Promise.resolve({ id: 'group1' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/menu/modifiers/[id] returns 404 for unknown groupId', async () => {
    const res = await DELETE({} as any, { params: Promise.resolve({ id: 'unknown' }) });
    expect(res.status).toBe(404);
  });
});
