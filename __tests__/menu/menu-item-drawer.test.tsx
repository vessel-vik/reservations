import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuItemDrawer } from '@/components/admin/menu/MenuItemDrawer';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      id: 'test-user',
      fullName: 'Test Admin',
      primaryEmailAddress: { emailAddress: 'admin@test.dev' },
      username: 'admin',
    },
    isLoaded: true,
  }),
}));

// Mock dependencies
global.fetch = vi.fn();
vi.mock('@/lib/appwrite-client', () => ({ client: {} }));
vi.mock('appwrite', () => ({ Storage: vi.fn(), ID: { unique: () => '123' } }));

vi.mock('@/components/admin/menu/ImageUploadField', () => ({
  ImageUploadField: ({
    onFileStaged,
    onRemoved,
  }: {
    onFileStaged: (f: File) => void
    onRemoved: () => void
  }) => (
    <div data-testid="image-upload">
      <button
        type="button"
        onClick={() =>
          onFileStaged(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))
        }
      >
        Stage Image
      </button>
      <button type="button" onClick={onRemoved}>
        Remove Image
      </button>
    </div>
  ),
}))

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
      expect(screen.getByText(/Price must be greater than 0/i)).toBeInTheDocument();
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

  it('shows error when price is 0 on submit', async () => {
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={() => {}} />)
    const numberInputs = document.querySelectorAll('input[type="number"]')
    fireEvent.change(numberInputs[0], { target: { value: '0' } })
    fireEvent.click(screen.getByText('Create Item'))
    await waitFor(() => {
      expect(screen.getByText(/Price must be greater than 0/i)).toBeInTheDocument()
    })
  })

  it('in create mode: calls POST items then POSTs image then PATCHes imageUrl', async () => {
    const mockFetch = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: { $id: 'new-item-123' } }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ imageUrl: 'https://cdn.x.com/img.jpg' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ item: { $id: 'new-item-123', imageUrl: 'https://cdn.x.com/img.jpg' } }), { status: 200 })
      )

    const onSaved = vi.fn()
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={onSaved} />)

    async function fillRequiredFields() {
      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: 'Test Burger' } }); // name
      const numberInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(numberInputs[0], { target: { value: '500' } }); // price
      const categorySelects = screen.getAllByRole('combobox');
      fireEvent.change(categorySelects[0], { target: { value: 'c1' } }); // category (first select)
    }

    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /stage image/i }))
    await userEvent.click(screen.getByText('Create Item'))

    await waitFor(() => {
      const calls = mockFetch.mock.calls
      expect(calls.length).toBeGreaterThanOrEqual(3)
      expect(String(calls[0][0])).toContain('/api/menu/items')
      expect(calls[1][1]?.method).toBe('POST')  // image upload
      expect(String(calls[1][0])).toContain('/image')
      expect(calls[2][1]?.method).toBe('PATCH')  // patch imageUrl
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('in create mode: item is saved even if image upload fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { $id: 'item1' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Upload failed' }), { status: 500 }))

    const onSaved = vi.fn()
    render(<MenuItemDrawer open={true} item={null} categories={dummyCategories} modifierGroups={dummyModifiers} onClose={() => {}} onSaved={onSaved} />)

    async function fillRequiredFields() {
      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: 'Test Burger' } }); // name
      const numberInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(numberInputs[0], { target: { value: '500' } }); // price
      const categorySelects = screen.getAllByRole('combobox');
      fireEvent.change(categorySelects[0], { target: { value: 'c1' } }); // category (first select)
    }

    await fillRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /stage image/i }))
    await userEvent.click(screen.getByText('Create Item'))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })
});
