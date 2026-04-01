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

  const fetchData = async () => {
    setLoading(true);
    try {
      // Simulate fetching KPI data, expenses, and budgets (would be individual API endpoints in full implementation)
      const kpiRes = await fetch(`/api/reports/accounting?period=${period}`);
      const expensesRes = await fetch(`/api/expenses?period=${period}`);
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
        <ExpenseList 
          expenses={expenses} 
          comparisons={comparisons}
          loading={loading}
          onEdit={(exp: Expense) => { setSelectedExpense(exp); setIsExpenseDrawerOpen(true); }}
        />
      )}

      {activeSection === 'vat' && (
        <VATDashboard />
      )}

      {activeSection === 'reports' && (
        <div className="space-y-6">
          <RevenueExpenseChart 
            data={[
              { label: 'Week 1', revenue: 300000, expenses: 200000, profit: 100000 },
              { label: 'Week 2', revenue: 450000, expenses: 180000, profit: 270000 },
              { label: 'Week 3', revenue: 380000, expenses: 220000, profit: 160000 },
              { label: 'Current', revenue: kpiData?.totalIncome || 1250000, expenses: kpiData?.totalExpenses || 850000, profit: kpiData?.netProfit || 400000 }
            ]}
          />
          <PLSummaryTable 
            data={[
              { period: 'March 2026', revenue: kpiData?.totalIncome || 1250000, expenses: kpiData?.totalExpenses || 850000, profit: kpiData?.netProfit || 400000 },
              { period: 'February 2026', revenue: 980000, expenses: 750000, profit: 230000 },
              { period: 'January 2026', revenue: 1100000, expenses: 800000, profit: 300000 },
            ]}
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
