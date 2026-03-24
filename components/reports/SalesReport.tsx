'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Filter, Calendar, ArrowUpDown } from 'lucide-react';

interface Order {
  $id: string;
  orderNumber: string;
  tableNumber: string;
  total: number;
  vatAmount: number;
  subtotal: number;
  paymentStatus: string;
  paymentMethod?: string;
  createdAt: string;
  items?: any[];
}

interface SalesSummary {
  totalSales: number;
  totalVat: number;
  orderCount: number;
  averageOrderValue: number;
}

export default function SalesReport() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('paid');

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('paymentStatus', paymentStatus);

      const res = await fetch(`/api/reports/sales?${params}`);
      const data = await res.json();
      
      if (data.orders) {
        setOrders(data.orders);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, paymentStatus]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const exportToCSV = () => {
    const headers = ['Order #', 'Table', 'Date', 'Subtotal', 'VAT', 'Total', 'Status', 'Payment Method'];
    const rows = orders.map(order => [
      order.orderNumber,
      order.tableNumber || 'N/A',
      new Date(order.createdAt).toLocaleDateString(),
      (order.subtotal || 0).toFixed(2),
      (order.vatAmount || 0).toFixed(2),
      (order.total || 0).toFixed(2),
      order.paymentStatus,
      order.paymentMethod || 'N/A'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${startDate || 'all'}-${endDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setDatePreset = (preset: string) => {
    const today = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'today':
        start = end = today;
        break;
      case 'week':
        start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = today;
        break;
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;
      case 'quarter':
        start = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
        end = today;
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Date Range:</span>
          </div>
          
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
          
          <div className="flex gap-2 ml-4">
            {['today', 'week', 'month', 'quarter'].map((preset) => (
              <button
                key={preset}
                onClick={() => setDatePreset(preset)}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded capitalize"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Status:</span>
          </div>
          
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="paid">Paid Only</option>
            <option value="pending">Pending</option>
            <option value="all">All Statuses</option>
          </select>

          <button
            onClick={exportToCSV}
            disabled={orders.length === 0}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Total Sales</div>
            <div className="text-2xl font-bold text-emerald-400">KSh {summary?.totalSales?.toLocaleString() ?? 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Total VAT</div>
            <div className="text-2xl font-bold text-amber-400">KSh {summary?.totalVat?.toLocaleString() ?? 0}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Orders</div>
            <div className="text-2xl font-bold">{summary.orderCount}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-sm text-gray-400">Avg Order</div>
            <div className="text-2xl font-bold">KSh {summary?.averageOrderValue?.toLocaleString() ?? 0}</div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No orders found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Table</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Subtotal</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">VAT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {orders.map((order) => (
                <tr key={order.$id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 font-mono text-sm">{order.orderNumber}</td>
                  <td className="px-4 py-3">{order.tableNumber || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">KSh {(order.subtotal || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-amber-400">KSh {(order.vatAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold">KSh {(order.total || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.paymentStatus === 'paid' ? 'bg-emerald-900 text-emerald-300' :
                      order.paymentStatus === 'pending' ? 'bg-amber-900 text-amber-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{order.paymentMethod || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
