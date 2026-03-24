'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, PieChart } from 'lucide-react';

interface AccountingSummary {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    outputVat: number;
    inputVat: number;
    netVat: number;
    profitMargin: number;
    orderCount: number;
    expenseCount: number;
  };
  expenseByCategory: Record<string, number>;
}

export default function AccountingDashboard() {
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/reports/accounting?${params}`);
      const result = await res.json();
      
      // Check for API error
      if (result.error) {
        console.error('Accounting API error:', result.error, result.details);
        setError(result.error);
      }
      
      if (result.summary) {
        console.log('Accounting data loaded:', result.summary);
        setData(result);
        setError(null);
      }
    } catch (error) {
      console.error('Error fetching accounting data:', error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading accounting data...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 max-w-md mx-auto">
          <p className="text-red-400 font-medium">Error: {error}</p>
          <p className="text-gray-400 text-sm mt-2">Please check the console for more details.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-400">No data available</div>;
  }

  const { summary, expenseByCategory } = data;
  const isProfitable = summary.netProfit >= 0;

  // Get top expense categories
  const topCategories = Object.entries(expenseByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-400">Period:</span>
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
          <div className="flex gap-2">
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
          {startDate && endDate && (
            <div className="ml-auto flex items-center gap-2 text-sm text-gray-400">
              <span>Showing:</span>
              <span className="text-amber-400 font-medium">
                {startDate} to {endDate}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Income */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">Total Income</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            KSh {summary.totalIncome?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
          <div className="text-xs text-gray-500 mt-1">{summary.orderCount} orders</div>
        </div>

        {/* Total Expenses */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm">Total Expenses</span>
          </div>
          <div className="text-2xl font-bold text-red-400">
            KSh {summary.totalExpenses?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
          <div className="text-xs text-gray-500 mt-1">{summary.expenseCount} expenses</div>
        </div>

        {/* Net Profit */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Net Profit</span>
          </div>
          <div className={`text-2xl font-bold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
            KSh {summary.netProfit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {isProfitable ? '✓ Profitable' : '✗ Loss'}
          </div>
        </div>

        {/* Profit Margin */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Percent className="w-4 h-4" />
            <span className="text-sm">Profit Margin</span>
          </div>
          <div className={`text-2xl font-bold ${summary.profitMargin > 20 ? 'text-emerald-400' : summary.profitMargin > 0 ? 'text-amber-400' : 'text-red-400'}`}>
            {summary.profitMargin.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {summary.profitMargin > 20 ? 'Excellent' : summary.profitMargin > 0 ? 'Healthy' : 'Needs attention'}
          </div>
        </div>
      </div>

      {/* VAT Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Output VAT (Sales)</div>
          <div className="text-xl font-bold text-amber-400">
            KSh {summary.outputVat?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Input VAT (Expenses)</div>
          <div className="text-xl font-bold text-blue-400">
            KSh {summary.inputVat?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-1">Net VAT Payable</div>
          <div className={`text-xl font-bold ${summary.netVat >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            KSh {summary.netVat?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
        </div>
      </div>

      {/* Expense Breakdown */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold">Expense Breakdown by Category</h3>
        </div>
        
        {topCategories.length === 0 ? (
          <div className="text-gray-400 text-center py-4">No expense data available</div>
        ) : (
          <div className="space-y-3">
            {topCategories.map(([category, amount]) => {
              const percentage = summary.totalExpenses > 0 
                ? ((amount / summary.totalExpenses) * 100).toFixed(1) 
                : '0';
              return (
                <div key={category} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-gray-300 capitalize">{category}</div>
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-emerald-500 h-2 rounded-full" 
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-24 text-right text-sm">
                    <span className="text-gray-300">KSh {amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}</span>
                    <span className="text-gray-500 ml-2">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
