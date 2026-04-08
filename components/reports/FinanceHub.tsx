"use client";

import { useState, useEffect } from "react";
import { FinanceKPIStrip, FinancePeriod } from "./FinanceKPIStrip";
import { BudgetAlertBanner } from "./BudgetAlertBanner";
import { FinanceSectionNav } from "./FinanceSectionNav";
import { ExpenseList } from "./ExpenseList";
import VATDashboard from "./VATDashboard";
import { ExpenseDrawer } from "./ExpenseDrawer";
import { BudgetManager } from "./BudgetManager";
import { RevenueExpenseChart } from "./RevenueExpenseChart";
import { PLSummaryTable } from "./PLSummaryTable";
import { BudgetComparison, compareBudgetToActual, getOverBudgetCategories } from "@/lib/budget-utils";
import { Expense } from "@/types/pos.types";
import { BudgetMeters } from './BudgetMeters'
import { ExportButtons } from './ExportButtons'

type CashVerificationAuditRow = {
  $id: string;
  paymentReference: string;
  fileId: string;
  capturedAt: string;
  deviceInstallId?: string;
  geoJson?: string;
};

function getPeriodDateRange(period: FinancePeriod) {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  switch (period) {
    case 'today':
      return { startDate: fmt(today), endDate: fmt(today) }
    case 'week': {
      const s = new Date(today)
      s.setDate(today.getDate() - 7)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3)
      const s = new Date(today.getFullYear(), q * 3, 1)
      return { startDate: fmt(s), endDate: fmt(today) }
    }
  }
}

export function FinanceHub() {
  const [activeSection, setActiveSection] = useState<'expenses'|'vat'|'reports'>('expenses');
  const [period, setPeriod] = useState<FinancePeriod>('month');
  const [kpiData, setKpiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [comparisons, setComparisons] = useState<BudgetComparison[]>([]);
  
  // Drawer visibility
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [isBudgetManagerOpen, setIsBudgetManagerOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [chartStartDate, setChartStartDate] = useState('')
  const [chartEndDate, setChartEndDate] = useState('')
  const [cashVerifications, setCashVerifications] = useState<CashVerificationAuditRow[]>([])

  const fetchData = async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getPeriodDateRange(period)
      setChartStartDate(startDate)
      setChartEndDate(endDate)
      const kpiRes = await fetch(`/api/reports/accounting?startDate=${startDate}&endDate=${endDate}`)
      const expensesRes = await fetch(`/api/expenses?startDate=${startDate}&endDate=${endDate}`)
      const d = new Date();
      const budgetsRes = await fetch(`/api/budgets?month=${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
      
      const kpiJson = kpiRes.ok ? await kpiRes.json() : null;
      const expensesJson = expensesRes.ok ? await expensesRes.json() : { expenses: [] };
      const budgetsJson = budgetsRes.ok ? await budgetsRes.json() : [];

      if (kpiJson?.summary) {
        setKpiData(kpiJson.summary);
      } else {
        // Fallback mock
        setKpiData({
          totalIncome: 1250000,
          totalExpenses: 850000,
          netProfit: 400000,
          netVat: 45000,
          outputVat: 0,
          inputVat: 0,
          profitMargin: 32,
          orderCount: 150,
          expenseCount: 22
        });
      }

      setExpenses(expensesJson.expenses || []);

      // Calculate actuals
      const actuals: Record<string, number> = {};
      (expensesJson.expenses || []).forEach((e: Expense) => {
        actuals[e.category] = (actuals[e.category] || 0) + e.amount;
      });

      const budgetsMap: Record<string, number> = {};
      budgetsJson.forEach((b: any) => budgetsMap[b.category] = b.monthlyLimit);

      setComparisons(compareBudgetToActual(budgetsMap, actuals));

      try {
        const cvRes = await fetch('/api/pos/cash-verifications?limit=24');
        if (cvRes.ok) {
          const cvJson = await cvRes.json();
          setCashVerifications(Array.isArray(cvJson.verifications) ? cvJson.verifications : []);
        } else {
          setCashVerifications([]);
        }
      } catch {
        setCashVerifications([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const overBudgetCategories = getOverBudgetCategories(comparisons);

  return (
    <div className="space-y-6">
      <FinanceKPIStrip 
        kpiData={kpiData} 
        period={period} 
        onPeriodChange={setPeriod} 
        loading={loading} 
      />

      <BudgetAlertBanner overBudgetCategories={overBudgetCategories} />

      <FinanceSectionNav 
        activeSection={activeSection} 
        onSectionChange={setActiveSection}
        onAddExpense={() => { setSelectedExpense(null); setIsExpenseDrawerOpen(true); }}
        onSetBudgets={() => setIsBudgetManagerOpen(true)}
      />

      {cashVerifications.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">Cash verification photos</h3>
            <span className="text-xs text-slate-500">Recent captures — same evidence as admin alerts</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {cashVerifications.map((v) => (
              <div key={v.$id} className="shrink-0 w-36 space-y-1">
                <div className="aspect-[4/3] rounded-lg overflow-hidden border border-white/10 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/pos/cash-verifications/${encodeURIComponent(v.fileId)}/preview`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-[10px] font-mono text-slate-400 truncate" title={v.paymentReference}>
                  {v.paymentReference}
                </p>
                <p className="text-[10px] text-slate-500">
                  {(v.capturedAt || "").slice(0, 19).replace("T", " ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === 'expenses' && (
        <>
          <BudgetMeters comparisons={comparisons} />
          <ExpenseList expenses={expenses} comparisons={comparisons} loading={loading}
            onEdit={(exp: Expense) => { setSelectedExpense(exp); setIsExpenseDrawerOpen(true); }}
          />
        </>
      )}

      {activeSection === 'vat' && (
        <VATDashboard />
      )}

      {activeSection === 'reports' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <ExportButtons startDate={chartStartDate} endDate={chartEndDate} />
          </div>
          <RevenueExpenseChart
            data={
              kpiData
                ? [
                    { label: 'Period Revenue', revenue: kpiData.totalIncome ?? 0, expenses: kpiData.totalExpenses ?? 0, profit: kpiData.netProfit ?? 0 },
                  ]
                : []
            }
          />
          <PLSummaryTable
            data={
              kpiData
                ? [
                    {
                      period: chartStartDate && chartEndDate ? `${chartStartDate} → ${chartEndDate}` : 'Current Period',
                      revenue: kpiData.totalIncome ?? 0,
                      expenses: kpiData.totalExpenses ?? 0,
                      profit: kpiData.netProfit ?? 0,
                    },
                  ]
                : []
            }
          />
        </div>
      )}

      <ExpenseDrawer 
        open={isExpenseDrawerOpen}
        expense={selectedExpense}
        onClose={() => setIsExpenseDrawerOpen(false)}
        onSaved={fetchData}
      />

      <BudgetManager 
        open={isBudgetManagerOpen}
        comparisons={comparisons}
        onClose={() => setIsBudgetManagerOpen(false)}
        onSaved={fetchData}
      />
    </div>
  );
}
