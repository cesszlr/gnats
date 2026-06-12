import React from 'react';
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Area } from 'recharts';

interface ThroughputChartProps {
  history: any[];
  t: (key: string) => string;
}

export const ThroughputChart: React.FC<ThroughputChartProps> = ({ history, t }) => {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <AreaChart data={history}>
        <defs>
          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--success-color)" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="var(--success-color)" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
        <XAxis dataKey="time" fontSize={10} tickLine={false} axisLine={false} stroke="var(--text-secondary)" minTickGap={30} />
        <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="var(--text-secondary)" />
        <Tooltip 
          contentStyle={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border-color)', borderRadius: 'var(--radius)', fontSize: '12px', boxShadow: 'var(--shadow)' }}
          formatter={(value: any) => [value ? `${Number(value).toFixed(1)} msgs/s` : '0 msgs/s']}
        />
        <Area type="monotone" dataKey="inMsgs" name={t('in')} stroke="var(--success-color)" strokeWidth={2} fillOpacity={1} fill="url(#colorIn)" />
        <Area type="monotone" dataKey="outMsgs" name={t('out')} stroke="var(--accent-color)" strokeWidth={2} fillOpacity={1} fill="url(#colorOut)" />
      </AreaChart>
    </ResponsiveContainer>
  );
};
