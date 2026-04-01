import React from 'react';
import { DollarSign, Receipt, TrendingUp, TrendingDown, Scale } from 'lucide-react';

export type FinancePeriod = 'today' | 'week' | 'month' | 'quarter';

interface KPIData {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  netVat: number;
  outputVat: number;
  inputVat: number;
  profitMargin: number;
  orderCount: number;
  expenseCount: number;
}

interface Props {
  kpiData: KPIData | null;
  period: FinancePeriod;
  onPeriodChange: (period: FinancePeriod) => void;
  loading: boolean;
}

const formatKSh = (val: number) => `KSh ${val.toLocaleString()}`;

export function FinanceKPIStrip({ kpiData, period, onPeriodChange, loading }: Props) {
  const periods: FinancePeriod[] = ['today', 'week', 'month', 'quarter'];

  const SkeletonCard = () => (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 flex flex-col gap-2">
      <div className="h-4 bg-slate-700 rounded animate-pulse w-24"></div>
      <div className="h-8 bg-slate-700 rounded animate-pulse w-32"></div>
    </div>
  );

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-slate-100 hidden md:block">Finance Hub</h2>
        <div className="flex bg-slate-800 p-1 rounded-lg">
          {periods.map(p => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                period === p 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !kpiData ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">Revenue</p>
                <p className="text-2xl font-bold text-slate-100">{formatKSh(kpiData.totalIncome)}</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">Expenses</p>
                <p className="text-2xl font-bold text-slate-100">{formatKSh(kpiData.totalExpenses)}</p>
              </div>
              <div className="p-3 bg-red-500/10 rounded-lg">
                <Receipt className="w-5 h-5 text-red-400" />
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">Net Profit</p>
                <p className={`text-2xl font-bold ${kpiData.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatKSh(kpiData.netProfit)}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${kpiData.netProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {kpiData.netProfit >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50 flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">VAT Due (to KRA)</p>
                <p className="text-2xl font-bold text-slate-100">{formatKSh(kpiData.netVat)}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Scale className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
