import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../../app/api/reports/revenue/route';
import { getRevenueByPeriod } from '@/lib/actions/admin.actions';

vi.mock('@/lib/actions/admin.actions', () => ({
  getRevenueByPeriod: vi.fn(),
}));

describe('API: /api/reports/revenue', () => {
  const mockUrl = 'http://localhost/api/reports/revenue';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Array<{ date, revenue }> for given days param', async () => {
    const mockData = [
      { date: '2026-03-21', revenue: 48200 }
    ];
    vi.mocked(getRevenueByPeriod).mockResolvedValue({ success: true, data: mockData, totalRevenue: 48200 });

    const req = new NextRequest(`${mockUrl}?days=14`);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(mockData);
    expect(json.totalRevenue).toBe(48200);
    expect(getRevenueByPeriod).toHaveBeenCalledWith(14);
  });

  it('defaults to 7 days when no days param provided', async () => {
    vi.mocked(getRevenueByPeriod).mockResolvedValue({ success: true, data: [], totalRevenue: 0 });

    const req = new NextRequest(mockUrl);
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(getRevenueByPeriod).toHaveBeenCalledWith(7);
  });

  it('returns 400 when days is not a positive integer', async () => {
    const req = new NextRequest(`${mockUrl}?days=-5`);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/days must be a positive integer/i);
  });

  it('returns 500 when Appwrite query fails', async () => {
    vi.mocked(getRevenueByPeriod).mockResolvedValue({ success: false, error: 'Database error' });

    const req = new NextRequest(`${mockUrl}?days=7`);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('Failed to fetch revenue data');
  });
});
