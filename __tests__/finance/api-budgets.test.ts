import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '../../app/api/budgets/route';
import * as actions from '@/lib/actions/budget.actions';

vi.mock('@/lib/actions/budget.actions', () => ({
  getBudgetsByMonth: vi.fn(),
  upsertBudget: vi.fn(),
  updateBudgetLimit: vi.fn(),
}));

describe('API: /api/budgets', () => {
  const mockUrl = 'http://localhost/api/budgets';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns budgets array for given YYYY-MM month with budgetId included', async () => {
      const mockBudgets = [{ budgetId: 'b1', category: 'rent', monthlyLimit: 50000, month: 3, year: 2026 }];
      vi.mocked(actions.getBudgetsByMonth).mockResolvedValue(mockBudgets);

      const req = new NextRequest(`${mockUrl}?month=2026-03`);
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(mockBudgets);
      expect(actions.getBudgetsByMonth).toHaveBeenCalledWith(3, 2026);
    });

    it('returns empty array when no data for month or previous month', async () => {
      vi.mocked(actions.getBudgetsByMonth).mockResolvedValue([]);

      const req = new NextRequest(`${mockUrl}?month=2026-03`);
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual([]);
    });

    it('auto-carries from previous month when current month has no budgets', async () => {
      // Handled inside getBudgetsByMonth action, but test validates the API returns it
      const prevBudgets = [{ budgetId: 'b1', category: 'rent', monthlyLimit: 50000, month: 2, year: 2026 }];
      vi.mocked(actions.getBudgetsByMonth).mockResolvedValue(prevBudgets);

      const req = new NextRequest(`${mockUrl}?month=2026-03`);
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(prevBudgets);
    });

    it('returns 400 for invalid month format', async () => {
      const req = new NextRequest(`${mockUrl}?month=invalid`);
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json).toHaveProperty('error');
      expect(json.error).toMatch(/Invalid month format/i);
    });
  });

  describe('POST', () => {
    it('creates a new budget document', async () => {
      const newBudget = { category: 'rent', monthlyLimit: 50000, month: 3, year: 2026 };
      vi.mocked(actions.upsertBudget).mockResolvedValue({ budgetId: 'b2', ...newBudget });

      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify(newBudget),
      });

      const res = await POST(req);
      const json = await res.json();

      expect([200, 201]).toContain(res.status);
      expect(json.budget).toEqual({ budgetId: 'b2', ...newBudget });
      expect(actions.upsertBudget).toHaveBeenCalledWith(newBudget);
    });

    it('returns 400 when category is missing', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ monthlyLimit: 500, month: 3, year: 2026 }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/category is required/i);
    });

    it('returns 400 when monthlyLimit is not a positive number', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ category: 'rent', monthlyLimit: -500, month: 3, year: 2026 }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/monthlyLimit must be a positive number/i);
    });

    it('returns 400 for invalid category value', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify({ category: 'invalid-cat', monthlyLimit: 500, month: 3, year: 2026 }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/Invalid category/i);
    });

    it('upserts (updates) when (category, month, year) already exists', async () => {
      const payload = { category: 'rent', monthlyLimit: 60000, month: 3, year: 2026 };
      vi.mocked(actions.upsertBudget).mockResolvedValue({ budgetId: 'b1', ...payload });

      const req = new NextRequest(mockUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.budget.monthlyLimit).toBe(60000);
      expect(actions.upsertBudget).toHaveBeenCalledWith(payload);
    });
  });

  describe('PUT', () => {
    it('updates monthlyLimit on existing document', async () => {
      vi.mocked(actions.updateBudgetLimit).mockResolvedValue(true);

      const req = new NextRequest(mockUrl, {
        method: 'PUT',
        body: JSON.stringify({ budgetId: 'b1', monthlyLimit: 70000 }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(actions.updateBudgetLimit).toHaveBeenCalledWith('b1', 70000);
    });

    it('returns 404 when budgetId does not exist', async () => {
      // Mock action to throw error or return false to indicate not found
      vi.mocked(actions.updateBudgetLimit).mockRejectedValue(new Error('Budget not found'));

      const req = new NextRequest(mockUrl, {
        method: 'PUT',
        body: JSON.stringify({ budgetId: 'invalid-id', monthlyLimit: 70000 }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe('Budget not found');
    });

    it('returns 400 when monthlyLimit is not a positive number', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'PUT',
        body: JSON.stringify({ budgetId: 'b1', monthlyLimit: -70000 }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/monthlyLimit must be a positive number/i);
    });

    it('returns 400 when budgetId is required', async () => {
      const req = new NextRequest(mockUrl, {
        method: 'PUT',
        body: JSON.stringify({ monthlyLimit: 70000 }),
      });

      const res = await PUT(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/budgetId is required/i);
    });
  });
});
