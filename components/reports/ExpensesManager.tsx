'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Filter, Calendar } from 'lucide-react';

interface Expense {
  $id: string;
  supplierName: string;
  supplierTin?: string;
  category: string;
  description: string;
  amount: number;
  vatAmount: number;
  totalAmount: number;
  vatCategory: 'standard' | 'zero-rated' | 'exempt';
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  paymentStatus: 'pending' | 'paid' | 'cancelled';
  paymentDate?: string;
  notes?: string;
  createdAt: string;
}

export default function ExpensesManager() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<{ count: number; totalAmount: number; totalVat: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  // Form state
  const [formData, setFormData] = useState({
    supplierName: '',
    supplierTin: '',
    category: 'operational',
    description: '',
    amount: 0,
    vatCategory: 'standard',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    notes: ''
  });

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('paymentStatus', filterStatus);
      if (filterCategory !== 'all') params.set('category', filterCategory);

      const res = await fetch(`/api/expenses?${params}`);
      const data = await res.json();
      
      if (data.expenses) {
        setExpenses(data.expenses);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setShowModal(false);
        resetForm();
        fetchExpenses();
      }
    } catch (error) {
      console.error('Error creating expense:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    
    try {
      await fetch(`/api/expenses?expenseId=${id}`, { method: 'DELETE' });
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await fetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: id, status: 'paid', paymentDate: new Date().toISOString() })
      });
      fetchExpenses();
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      supplierName: '',
      supplierTin: '',
      category: 'operational',
      description: '',
      amount: 0,
      vatCategory: 'standard',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      notes: ''
    });
    setEditingExpense(null);
  };

  const categories = [
    'operational', 'rent', 'utilities', 'supplies', 'marketing', 
    'salaries', 'maintenance', 'insurance', 'professional-services', 'other'
  ];

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Total Expenses</div>
            <div className="text-2xl font-bold">KSh {summary?.totalAmount?.toLocaleString() ?? 0}</div>
            <div className="text-xs text-gray-500">{summary.count} records</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Total VAT</div>
            <div className="text-2xl font-bold text-amber-400">KSh {summary?.totalVat?.toLocaleString() ?? 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Total with VAT</div>
            <div className="text-2xl font-bold text-emerald-400">KSh {((summary?.totalAmount ?? 0) + (summary?.totalVat ?? 0)).toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filters & Actions */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Filters:</span>
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat} className="capitalize">{cat}</option>
            ))}
          </select>

          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No expenses found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300">Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300">VAT</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-300">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {expenses.map((expense) => (
                <tr key={expense.$id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm">
                    {new Date(expense.invoiceDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{expense.supplierName}</div>
                    {expense.invoiceNumber && (
                      <div className="text-xs text-gray-500">{expense.invoiceNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-sm">{expense.category}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate">
                    {expense.description}
                  </td>
                  <td className="px-4 py-3 text-right">KSh {expense?.amount?.toLocaleString() ?? 0}</td>
                  <td className="px-4 py-3 text-right text-amber-400">
                    KSh {((expense?.vatAmount ?? 0) || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      expense.paymentStatus === 'paid' ? 'bg-emerald-900 text-emerald-300' :
                      expense.paymentStatus === 'pending' ? 'bg-amber-900 text-amber-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {expense.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {expense.paymentStatus === 'pending' && (
                        <button
                          onClick={() => handleMarkPaid(expense.$id)}
                          className="p-1 text-emerald-400 hover:text-emerald-300"
                          title="Mark as Paid"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(expense.$id)}
                        className="p-1 text-red-400 hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Add Expense</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={formData.supplierName}
                  onChange={(e) => setFormData({...formData, supplierName: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Supplier TIN</label>
                  <input
                    type="text"
                    value={formData.supplierTin}
                    onChange={(e) => setFormData({...formData, supplierTin: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Category *</label>
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat} className="capitalize">{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">VAT Category</label>
                  <select
                    value={formData.vatCategory}
                    onChange={(e) => setFormData({...formData, vatCategory: e.target.value as any})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="standard">Standard (16%)</option>
                    <option value="zero-rated">Zero Rated (0%)</option>
                    <option value="exempt">Exempt (0%)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description *</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Amount *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
