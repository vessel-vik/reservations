"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface ChartDataPoint {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface Props {
  data: ChartDataPoint[];
}

export function RevenueExpenseChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="w-full h-80 bg-slate-800/50 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center text-slate-500">
        <p className="font-medium">No analytical data available for this period.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-slate-800 rounded-xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-6 font-sans">
        Revenue vs Expenses Over Time
      </h3>
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis 
              dataKey="label" 
              stroke="#94a3b8" 
              fontSize={12} 
              tickLine={false} 
              axisLine={{ stroke: '#475569' }} 
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={12} 
              tickLine={false} 
              axisLine={{ stroke: '#475569' }}
              tickFormatter={(value) => `KSh ${value >= 1000 ? (value / 1000) + 'k' : value}`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
              itemStyle={{ fontSize: '14px' }}
              formatter={(value: number) => [`KSh ${value.toLocaleString()}`, undefined]}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            
            <Bar dataKey="revenue" name="Total Revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
            <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={50} />
            
            <Line 
              type="monotone" 
              dataKey="profit" 
              name="Net Profit" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: '#0f172a' }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
