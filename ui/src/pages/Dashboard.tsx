import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Activity, Server, Clock, RefreshCcw, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const Dashboard: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const prevTotalRef = useRef<number | null>(null);

  const loadStats = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/stats`);
      const data = await res.json();
      setStats(data);

      if (data?.jetstream) {
        const currentTotal = data.jetstream.api.total;
        const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        let rate = 0;
        if (prevTotalRef.current !== null) {
          rate = Math.max(0, currentTotal - prevTotalRef.current);
        }
        prevTotalRef.current = currentTotal;

        setHistory(prev => {
          const newHistory = [...prev, { time: now, requests: rate }].slice(-20);
          return newHistory;
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHistory([]);
    prevTotalRef.current = null;
    loadStats();
    const interval = setInterval(loadStats, 5000); // Update every 5 seconds for smoother chart
    return () => clearInterval(interval);
  }, [activeConnection]);

  if (!activeConnection) {
    return (
      <div style={{ textAlign: 'center', marginTop: '5rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Welcome to GNATS</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem' }}>{t('select_connection')}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1>{t('dashboard')}</h1>
        <button className="btn btn-secondary" onClick={loadStats} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)' }}>
            <Server size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{t('server')}</div>
            <div style={{ fontWeight: '700', fontSize: '1.125rem' }}>{activeConnection.url}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-color)' }}>
            <Activity size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: '500' }}>{t('status')}</div>
            <div style={{ fontWeight: '700', fontSize: '1.125rem' }} className={activeConnection.status === 'CONNECTED' ? 'status-connected' : 'status-disconnected'}>
              {activeConnection.status}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', borderRadius: 'var(--radius)', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning-color)' }}>
            <Clock size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: '500' }}>RTT</div>
            <div style={{ fontWeight: '700', fontSize: '1.125rem' }}>{stats?.rtt || '...'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} style={{ color: 'var(--accent-color)' }} />
              JetStream Activity
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last 20 updates</span>
          </div>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis 
                  dataKey="time" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  stroke="var(--text-secondary)"
                  minTickGap={30}
                />
                <YAxis 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  stroke="var(--text-secondary)"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--card-bg)', 
                    borderColor: 'var(--border-color)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    boxShadow: 'var(--shadow)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="var(--accent-color)" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorReq)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {stats?.jetstream ? (
            <>
              <div className="card" style={{ borderLeft: '4px solid var(--accent-color)', padding: '1.25rem' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.8125rem', fontWeight: '600' }}>
                   {t('total_streams')}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>{stats.jetstream.streams}</div>
              </div>
              <div className="card" style={{ borderLeft: '4px solid var(--success-color)', padding: '1.25rem' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.8125rem', fontWeight: '600' }}>
                   {t('api_requests')}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>{stats.jetstream.api.total}</div>
              </div>
              <div className="card" style={{ borderLeft: '4px solid var(--warning-color)', padding: '1.25rem' }}>
                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.8125rem', fontWeight: '600' }}>
                   {t('memory_usage')}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>{(stats.jetstream.memory / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </>
          ) : (
            <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              <p>{t('loading')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
