import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decrementItemStocks } from '@/lib/actions/menu.actions';
import { databases, DATABASE_ID, MENU_ITEMS_COLLECTION_ID } from '@/lib/appwrite.config';

vi.mock('@/lib/appwrite.config', () => ({
  databases: {
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
  },
  DATABASE_ID: 'test-db',
  MENU_ITEMS_COLLECTION_ID: 'test-items',
  CATEGORIES_COLLECTION_ID: 'test-cat'
}));

describe('decrementItemStocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decrements stock by ordered quantity', async () => {
    (databases.getDocument as any).mockResolvedValueOnce({ stock: 10 });
    
    await decrementItemStocks([{ itemId: 'item1', quantity: 3 }]);
    
    expect(databases.updateDocument).toHaveBeenCalledWith(
      DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'item1',
      expect.objectContaining({ stock: 7 })
    );
  });

  it('clamps stock to 0 (never negative)', async () => {
    (databases.getDocument as any).mockResolvedValueOnce({ stock: 2 });
    
    await decrementItemStocks([{ itemId: 'item1', quantity: 5 }]);
    
    expect(databases.updateDocument).toHaveBeenCalledWith(
      DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'item1',
      expect.objectContaining({ stock: 0 })
    );
  });

  it('sets isAvailable=false when stock reaches 0', async () => {
    (databases.getDocument as any).mockResolvedValueOnce({ stock: 1 });
    
    await decrementItemStocks([{ itemId: 'item1', quantity: 1 }]);
    
    expect(databases.updateDocument).toHaveBeenCalledWith(
      DATABASE_ID, MENU_ITEMS_COLLECTION_ID, 'item1',
      expect.objectContaining({ stock: 0, isAvailable: false })
    );
  });
});
