import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MenuItemDrawer } from '@/components/admin/menu/MenuItemDrawer';

// Mock dependencies
global.fetch = vi.fn();
vi.mock('@/lib/appwrite-client', () => ({ client: {} }));
vi.mock('appwrite', () => ({ Storage: vi.fn(), ID: { unique: () => '123' } }));

const dummyCategories = [{ $id: 'c1', label: 'Mains' }];
const dummyModifiers = [{ $id: 'm1', name: 'Sauce' }];

describe('MenuItemDrawer', () => {
  it('shows error when name is empty on submit', async () => {
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={() => {}} />);
    
    fireEvent.click(screen.getByText('Create Item'));
    await waitFor(() => {
      expect(screen.getByText(/Name must be at least 2 characters/i)).toBeInTheDocument();
    });
  });

  it('shows error when price is negative on submit', async () => {
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={() => {}} />);
    
    // Instead of label, we can query the input directly assuming standard styling or placeholder, or we just target the second input
    // The component has <Input {...register('name')} className="..." />
    const inputs = screen.getAllByRole('textbox');
    const numberInputs = document.querySelectorAll('input[type="number"]');
    
    fireEvent.change(inputs[0], { target: { value: 'Valid Name' } });
    fireEvent.change(numberInputs[0], { target: { value: '-10' } });
    
    // Add Item Name text directly to bypass label requirement
    fireEvent.click(screen.getByText('Create Item'));
    
    await waitFor(() => {
      expect(screen.getByText(/Price must be a non-negative number/i)).toBeInTheDocument();
    });
  });

  it('DietaryFlagPills toggle isVegetarian on click', async () => {
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={() => {}} />);
    
    const vegLabel = screen.getByText('Vegetarian');
    const checkbox = vegLabel.querySelector('input') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    
    fireEvent.click(vegLabel);
    expect(checkbox.checked).toBe(true);
  });
});
