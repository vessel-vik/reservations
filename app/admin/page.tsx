"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Clock,
  Calendar,
  ChefHat,
  Star,
  Activity,
  Utensils,
  Wine,
  AlertCircle,
  ShoppingCart,
  DollarSign,
  Receipt,
  Calculator,
  Upload
} from "lucide-react";
import Link from "next/link";

import { AdminDashboard } from "@/staging/components/admin/AdminDashboard";
import { LiveRevenueDisplay, LiveCheckSizeDisplay } from "@/components/ui/live-revenue-display";
import { LiveDate, RealTimeClock } from "@/components/ui/real-time-clock";
import { getReservationAnalytics } from "@/lib/actions/analytics.actions";
import { getAdminAnalytics } from "@/lib/actions/admin.actions";
import { useLiveReservationMetrics } from "@/lib/hooks/useLiveReservationMetrics";
import { useLivePOSMetrics } from "@/lib/hooks/useLivePOSMetrics";

// Report components
import SalesReport from "@/components/reports/SalesReport";
import AccountingDashboard from "@/components/reports/AccountingDashboard";
import VATDashboard from "@/components/reports/VATDashboard";
import ExpensesManager from "@/components/reports/ExpensesManager";
import MenuImport from "@/components/admin/MenuImport";

type TabType = 'dashboard' | 'sales' | 'accounting' | 'vat' | 'expenses' | 'import';

const AdminPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [combinedAnalytics, setCombinedAnalytics] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Initialize with default data
  const defaultReservationData = {
    avgPartySize: "2.0",
    partySizeChange: "0%",
    peakTime: "7:30 PM",
    peakTimeBookings: 0,
    specialRequests: 0,
    dietaryCount: 0,
    occasionCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    occupancyRate: "0",
    todaysReservations: 0
  };

  const defaultPOSData = {
    todaysOrders: 0,
    todaysOrderRevenue: 0,
    avgOrderValue: 0
  };

  // Use live data hooks
  const { data: liveReservationData } = useLiveReservationMetrics(defaultReservationData);
  const { data: livePOSData } = useLivePOSMetrics(defaultPOSData);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [reservationAnalytics, posAnalytics] = await Promise.all([
          getReservationAnalytics(),
          getAdminAnalytics()
        ]);

        const combined = {
          ...reservationAnalytics,
          // POS-specific metrics
          todaysOrders: posAnalytics.success ? posAnalytics.today.orders : 0,
          todaysOrderRevenue: posAnalytics.success ? posAnalytics.today.revenue : 0,
          avgOrderValue: posAnalytics.success ? posAnalytics.today.avgOrderValue : 0,
          peakOrderTime: posAnalytics.success ? posAnalytics.peakHours.time : '7:30 PM',
          peakOrderBookings: posAnalytics.success ? posAnalytics.peakHours.orders : 0,
          topProducts: posAnalytics.success ? posAnalytics.topProducts : [],
          serverPerformance: posAnalytics.success ? posAnalytics.servers : []
        };

        setCombinedAnalytics(combined);
      } catch (error) {
        console.error('Failed to load initial data:', error);
        // Set default data
        setCombinedAnalytics({
          ...defaultReservationData,
          ...defaultPOSData,
          todaysReservations: 0
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Keyboard shortcuts for tab navigation (1-5)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle if not typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case '1':
        setActiveTab('dashboard');
        break;
      case '2':
        setActiveTab('sales');
        break;
      case '3':
        setActiveTab('accounting');
        break;
      case '4':
        setActiveTab('vat');
        break;
      case '5':
        setActiveTab('expenses');
        break;
      case '6':
        setActiveTab('import');
        break;
      // Ctrl+R to refresh data
      case 'r':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.location.reload();
        }
        break;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Merge live data with combined analytics
  const currentAnalytics = combinedAnalytics ? {
    ...combinedAnalytics,
    ...liveReservationData,
    ...livePOSData
  } : null;

  if (isLoading || !currentAnalytics) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-300 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 size-96 animate-pulse rounded-full bg-amber-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 size-96 animate-pulse rounded-full bg-amber-600/5 blur-3xl delay-700" />
        <div className="absolute left-1/2 top-1/2 size-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="relative z-10">
        {/* Premium Header */}
        <header className="backdrop-blur-2xl bg-slate-900/70 border-b border-slate-700/50 sticky top-0 z-50">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
            <Link href="/" className="cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="size-11 flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 transition-all group-hover:border-amber-500/50">
                  <span className="text-amber-400 font-bold text-lg">AM</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">
                    <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">AM | PM</span>
                    <span className="text-white/90 ml-1.5">Lounge</span>
                  </h1>
                  <p className="text-xs text-slate-500">Restaurant Management</p>
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              {/* POS System Access */}
              <Link
                href="/pos"
                className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 hover:bg-amber-500/20 hover:border-amber-500/40 transition-all duration-200 group"
              >
                <ShoppingCart className="size-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Launch POS</span>
              </Link>

              {/* Live Status Indicator */}
              <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-2.5">
                <div className="size-2 animate-pulse rounded-full bg-green-400" />
                <span className="text-sm font-medium text-green-400">Online</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-slate-400">Manager</p>
                  <LiveDate className="text-xs text-amber-400 font-medium" />
                </div>
                <div className="size-10 flex items-center justify-center rounded-xl bg-slate-800/80 border border-slate-700/50">
                  <ChefHat className="size-5 text-amber-400" />
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-6 py-8">
          {/* Navigation Tabs */}
          <div className="mb-8">
            <nav className="flex gap-1 p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'dashboard'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 1"
              >
                <Activity className="w-4 h-4" />
                Dashboard
                <span className={`text-xs ml-1 ${activeTab === 'dashboard' ? 'text-slate-700' : 'text-slate-600'}`}>1</span>
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'sales'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 2"
              >
                <Receipt className="w-4 h-4" />
                Sales
                <span className={`text-xs ml-1 ${activeTab === 'sales' ? 'text-slate-700' : 'text-slate-600'}`}>2</span>
              </button>
              <button
                onClick={() => setActiveTab('accounting')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'accounting'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 3"
              >
                <DollarSign className="w-4 h-4" />
                Accounting
                <span className={`text-xs ml-1 ${activeTab === 'accounting' ? 'text-slate-700' : 'text-slate-600'}`}>3</span>
              </button>
              <button
                onClick={() => setActiveTab('vat')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'vat'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 4"
              >
                <Calculator className="w-4 h-4" />
                VAT
                <span className={`text-xs ml-1 ${activeTab === 'vat' ? 'text-slate-700' : 'text-slate-600'}`}>4</span>
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'expenses'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 5"
              >
                <ShoppingCart className="w-4 h-4" />
                Expenses
                <span className={`text-xs ml-1 ${activeTab === 'expenses' ? 'text-slate-700' : 'text-slate-600'}`}>5</span>
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  activeTab === 'import'
                    ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
                title="Press 6"
              >
                <Upload className="w-4 h-4" />
                Import
                <span className={`text-xs ml-1 ${activeTab === 'import' ? 'text-slate-700' : 'text-slate-600'}`}>6</span>
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'dashboard' && (
          <>
          <section className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1 tracking-tight">
                  Restaurant Dashboard
                </h1>
                <p className="text-slate-400 text-sm">
                  Monitor performance in real-time
                </p>
              </div>
              <div className="text-right">
                <div className="backdrop-blur-xl bg-slate-800/50 rounded-2xl border border-slate-700/50 px-5 py-3">
                  <p className="text-xs text-slate-500 mb-1">Current Time</p>
                  <RealTimeClock
                    format="time"
                    className="text-2xl font-bold text-amber-400 font-mono tracking-tight"
                    updateInterval={500}
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {currentAnalytics.todaysReservations} reservations · {currentAnalytics.todaysOrders} orders
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Key Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            {/* Average Party Size */}
            <div className="backdrop-blur-xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-2xl border border-blue-500/20 p-6 hover:shadow-xl hover:shadow-blue-500/10 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-400" />
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-lg ${currentAnalytics.partySizeChange.includes('+')
                  ? 'bg-green-500/20 text-green-400'
                  : currentAnalytics.partySizeChange === '0%'
                    ? 'bg-slate-500/20 text-slate-400'
                    : 'bg-red-500/20 text-red-400'
                  }`}>
                  {currentAnalytics.partySizeChange} from last week
                </span>
              </div>
              <p className="text-slate-400 text-sm mb-1">Avg Party Size</p>
              <p className="text-3xl font-bold text-white">{currentAnalytics.avgPartySize}</p>
              <p className="text-xs text-slate-500 mt-2">guests per table</p>
            </div>

            {/* Peak Time */}
            <div className="backdrop-blur-xl bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-2xl border border-purple-500/20 p-6 hover:shadow-xl hover:shadow-purple-500/10 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-purple-400" />
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400">
                  {currentAnalytics.peakTimeBookings} bookings
                </span>
              </div>
              <p className="text-slate-400 text-sm mb-1">Peak Time</p>
              <p className="text-3xl font-bold text-white">{currentAnalytics.peakTime}</p>
              <p className="text-xs text-slate-500 mt-2">busiest reservation slot</p>
            </div>

            {/* Revenue Today - Live Updated */}
            <LiveRevenueDisplay
              initialRevenue={currentAnalytics.todaysOrderRevenue}
              initialChange={currentAnalytics.revenueChange}
              updateInterval={30000}
            />

            {/* Today's Orders */}
            <div className="backdrop-blur-xl bg-gradient-to-br from-indigo-500/10 to-indigo-600/10 rounded-2xl border border-indigo-500/20 p-6 hover:shadow-xl hover:shadow-indigo-500/10 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <ShoppingCart className="w-6 h-6 text-indigo-400" />
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-400">
                  Live orders
                </span>
              </div>
              <p className="text-slate-400 text-sm mb-1">Orders Today</p>
              <p className="text-3xl font-bold text-white">{currentAnalytics.todaysOrders}</p>
              <p className="text-xs text-slate-500 mt-2">Avg: KSH {currentAnalytics.avgOrderValue.toFixed(0)}</p>
            </div>

            {/* Special Requests */}
            <div className="backdrop-blur-xl bg-gradient-to-br from-amber-500/10 to-amber-600/10 rounded-2xl border border-amber-500/20 p-6 hover:shadow-xl hover:shadow-amber-500/10 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Star className="w-6 h-6 text-amber-400" />
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400">
                  Active today
                </span>
              </div>
              <p className="text-slate-400 text-sm mb-1">Special Requests</p>
              <p className="text-3xl font-bold text-white">{currentAnalytics.specialRequests}</p>
              <div className="flex gap-4 mt-2">
                <p className="text-xs text-slate-500">{currentAnalytics.dietaryCount} dietary</p>
                <p className="text-xs text-slate-500">{currentAnalytics.occasionCount} occasions</p>
              </div>
            </div>
          </section>

          {/* Reservation Status Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="backdrop-blur-xl bg-gradient-to-br from-green-500/5 to-green-600/5 rounded-2xl border border-green-500/20 p-6 hover:shadow-xl hover:shadow-green-500/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-green-400 font-semibold">Confirmed Tables</p>
                    <p className="text-slate-500 text-xs">Ready to serve</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-green-400">{currentAnalytics.confirmedCount}</p>
              </div>
              <div className="w-full bg-green-500/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-green-400 to-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${(currentAnalytics.confirmedCount / (currentAnalytics.confirmedCount + currentAnalytics.pendingCount + currentAnalytics.cancelledCount)) * 100}%` }}
                />
              </div>
            </div>

            <div className="backdrop-blur-xl bg-gradient-to-br from-yellow-500/5 to-yellow-600/5 rounded-2xl border border-yellow-500/20 p-6 hover:shadow-xl hover:shadow-yellow-500/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-yellow-400 font-semibold">Pending Confirmation</p>
                    <p className="text-slate-500 text-xs">Awaiting approval</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-yellow-400">{currentAnalytics.pendingCount}</p>
              </div>
              <div className="w-full bg-yellow-500/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all"
                  style={{ width: `${(currentAnalytics.pendingCount / (currentAnalytics.confirmedCount + currentAnalytics.pendingCount + currentAnalytics.cancelledCount)) * 100}%` }}
                />
              </div>
            </div>

            <div className="backdrop-blur-xl bg-gradient-to-br from-red-500/5 to-red-600/5 rounded-2xl border border-red-500/20 p-6 hover:shadow-xl hover:shadow-red-500/10 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-red-400 font-semibold">Cancelled Today</p>
                    <p className="text-slate-500 text-xs">No shows</p>
                  </div>
                </div>
                <p className="text-3xl font-bold text-red-400">{currentAnalytics.cancelledCount}</p>
              </div>
              <div className="w-full bg-red-500/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-red-400 to-red-600 h-2 rounded-full transition-all"
                  style={{ width: `${(currentAnalytics.cancelledCount / (currentAnalytics.confirmedCount + currentAnalytics.pendingCount + currentAnalytics.cancelledCount)) * 100}%` }}
                />
              </div>
            </div>
          </section>

          {/* Additional Metrics Row */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Utensils className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Table Occupancy</p>
                <p className="text-lg font-semibold text-white">{currentAnalytics.occupancyRate}%</p>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Wine className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Welcome Drinks</p>
                <p className="text-lg font-semibold text-white">{currentAnalytics.confirmedCount * 2}</p>
              </div>
            </div>

            <LiveCheckSizeDisplay
              confirmedCount={currentAnalytics.confirmedCount}
              totalRevenue={currentAnalytics.todaysOrderRevenue}
              updateInterval={60000}
            />

            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Guest Rating</p>
                <p className="text-lg font-semibold text-white">4.8/5.0</p>
              </div>
            </div>
          </section>

          {/* Enhanced Admin Dashboard */}
          <AdminDashboard initialAnalytics={currentAnalytics} />
          </>
          )}


          {/* Sales Reports Tab */}
          {activeTab === 'sales' && (
            <SalesReport />
          )}

          {/* Accounting Tab */}
          {activeTab === 'accounting' && (
            <AccountingDashboard />
          )}

          {/* VAT Tab */}
          {activeTab === 'vat' && (
            <VATDashboard />
          )}

          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <ExpensesManager />
          )}

          {/* Import Tab */}
          {activeTab === 'import' && (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <MenuImport />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;