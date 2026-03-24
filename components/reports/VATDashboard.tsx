'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, AlertTriangle, Calculator, Calendar } from 'lucide-react';

interface VATReport {
  period: string;
  totalSales: number;
  totalVatCollected: number;
  totalPurchases: number;
  totalInputVat: number;
  vatPayable: number;
  standardRatedSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  supplierInvoices: Array<{
    supplierName: string;
    invoiceNumber: string;
    amount: number;
    vatAmount: number;
    date: string;
  }>;
}

export default function VATDashboard() {
  const [report, setReport] = useState<VATReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchVATReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/vat/report?${params}`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setReport(data);
      }
    } catch (err) {
      setError('Failed to fetch VAT report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchVATReport();
  }, [fetchVATReport]);

  const setDatePreset = (preset: string) => {
    const today = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarterStart = Math.floor(today.getMonth() / 3) * 3;
        start = new Date(today.getFullYear(), quarterStart, 1);
        end = new Date(today.getFullYear(), quarterStart + 3, 0);
        break;
      case 'year':
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const exportITax = () => {
    if (!report) return;
    
    const itaxData = {
      taxPeriod: report.period,
      vatCollected: report.totalVatCollected,
      vatPaid: report.totalInputVat,
      vatPayable: report.vatPayable,
      standardRated: report.standardRatedSales,
      zeroRated: report.zeroRatedSales,
      exempt: report.exemptSales,
      supplierInvoices: report.supplierInvoices
    };
    
    const json = JSON.stringify(itaxData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itax-vat-${report.period ?? "N/A"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate filing deadline (20th of following month)
  const getFilingDeadline = () => {
    const today = new Date();
    const deadline = new Date(today.getFullYear(), today.getMonth() + 1, 20);
    const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { deadline, daysUntil };
  };

  const { deadline, daysUntil } = getFilingDeadline();

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading VAT data...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-400 mb-4">{error}</div>
        <p className="text-gray-500 text-sm">Make sure VAT collection is enabled in your settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">VAT Period:</span>
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
            {['month', 'quarter', 'year'].map((preset) => (
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
      </div>

      {/* Filing Deadline Alert */}
      {daysUntil > 0 && daysUntil <= 20 && (
        <div className="bg-amber-900/30 border border-amber-600 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-amber-400 font-medium">VAT Filing Deadline Approaching</div>
            <div className="text-amber-300/70 text-sm">
              {daysUntil} days until {deadline.toLocaleDateString()} - Ensure all invoices are recorded
            </div>
          </div>
        </div>
      )}

      {report && (
        <>
          {/* VAT Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Output VAT (Collected)</div>
              <div className="text-2xl font-bold text-emerald-400">
                KSh {report.totalVatCollected?.toLocaleString() ?? '0'}
              </div>
              <div className="text-xs text-gray-500 mt-1">From sales</div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Input VAT (Paid)</div>
              <div className="text-2xl font-bold text-blue-400">
                KSh {report.totalInputVat?.toLocaleString() ?? '0'}
              </div>
              <div className="text-xs text-gray-500 mt-1">From expenses</div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Net VAT Payable</div>
              <div className={`text-2xl font-bold ${(report.vatPayable ?? 0) >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                KSh {(report.vatPayable ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {(report.vatPayable ?? 0) >= 0 ? 'Pay to KRA' : 'Claimable credit'}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Total Sales</div>
              <div className="text-2xl font-bold">
                KSh {report.totalSales?.toLocaleString() ?? 0}
              </div>
              <div className="text-xs text-gray-500 mt-1">{report.period ?? "N/A"}</div>
            </div>
          </div>

          {/* Sales Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Standard Rated (16%)</div>
              <div className="text-xl font-bold">
                KSh {report.standardRatedSales?.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Zero Rated (0%)</div>
              <div className="text-xl font-bold">
                KSh {report.zeroRatedSales?.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">Exempt</div>
              <div className="text-xl font-bold">
                KSh {report.exemptSales?.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={exportITax}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              <Download className="w-4 h-4" />
              Export for iTax
            </button>
          </div>

          {/* Supplier Invoices (Input VAT) */}
          {report.supplierInvoices && report.supplierInvoices.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Supplier Invoices (Input VAT Claims)</h3>
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Supplier</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Invoice #</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-300">Date</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-300">Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-300">VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {report.supplierInvoices.map((inv, i) => (
                    <tr key={i} className="hover:bg-gray-750">
                      <td className="px-4 py-2">{inv.supplierName}</td>
                      <td className="px-4 py-2 font-mono text-sm">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2 text-sm text-gray-400">{inv.date}</td>
                      <td className="px-4 py-2 text-right">KSh {inv.amount?.toLocaleString() ?? 0}</td>
                      <td className="px-4 py-2 text-right text-blue-400">KSh {inv.vatAmount?.toLocaleString() ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
