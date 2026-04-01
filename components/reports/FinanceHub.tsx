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
