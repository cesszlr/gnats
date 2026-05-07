import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Activity, Server, Clock, RefreshCcw, TrendingUp, Zap, MapPin, Hash, Activity as Pulse } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import Modal from '../components/Modal';

const AnimatedNumber: React.FC<{ value: string | number; className?: string }> = ({ value, className }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevValue, setPrevValue] = useState<string | number | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (value !== displayValue) {
      setPrevValue(displayValue);
      setDisplayValue(value);
      setKey(prev => prev + 1);
      
      const timer = setTimeout(() => {
        setPrevValue(null);
      }, 600); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  return (
    <span className={`number-container ${className || ''}`}>
      {prevValue !== null && (
        <span key={`exit-${key}`} className="number-scroll-item scroll-exit">
          {prevValue}
        </span>
      )}
      <span key={`enter-${key}`} className="number-scroll-item scroll-enter">
        {displayValue}
      </span>
    </span>
  );
};

const Dashboard: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedAccountName, setSelectedAccountName] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientSort, setClientSort] = useState<string>('pending');
  const prevStatsRef = useRef<any>(null);
  const prevConnectionIdRef = useRef<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatRTT = (rtt: string) => {
    if (!rtt) return '-';
    // Match something like 1.430292ms or 500µs
    const match = rtt.match(/^(\d+\.?\d*)([a-zµ]+)$/);
    if (!match) return rtt;
    const [_, value, unit] = match;
    const num = parseFloat(value);
    if (unit === 'ms') {
      return num < 1 ? rtt : `${num.toFixed(1)}ms`;
    }
    if (unit === 's') {
      return `${num.toFixed(2)}s`;
    }
    return rtt;
  };

  const loadStats = async () => {
    if (!activeConnection) return;
    
    // Check if we should poll: only if connected or stats are already loaded (to show disconnected state)
    // Actually, we should always try to poll if the status is active in context, 
    // but the backend will return DISCONNECTED now. 
    // Optimization: if we know it's disconnected from context, we can skip or poll slower, 
    // but let's keep the poll to catch auto-reconnects, just make UI handle it.

    setLoading(true);
    try {
      const data = await apiClient.getStats(activeConnection.id);
      setStats(data);

      // If backend says disconnected, we stop updating history to keep the last chart state or clear it
      if (data.status === 'DISCONNECTED') {
        setLoading(false);
        return;
      }

      const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let jsRate = 0;
      let inMsgsRate = 0;
      let outMsgsRate = 0;

      if (prevStatsRef.current) {
        // Stats are fetched every 2 seconds, so we divide by 2 for per-second rate
        const interval = 2; 
        
        if (data.jetstream && prevStatsRef.current.jetstream) {
          jsRate = Math.max(0, (data.jetstream.api.total - prevStatsRef.current.jetstream.api.total) / interval);
        }
        
        // Default to connection stats
        if (data.connection && prevStatsRef.current.connection) {
          inMsgsRate = Math.max(0, (data.connection.in_msgs - prevStatsRef.current.connection.in_msgs) / interval);
          outMsgsRate = Math.max(0, (data.connection.out_msgs - prevStatsRef.current.connection.out_msgs) / interval);
        }

        // Overwrite with monitoring data if available
        if (data.monitoring?.account_statz) {
          const accounts = data.monitoring.account_statz;
          
          // Auto-select first account if none selected
          let currentAccountName = selectedAccountName;
          if (!currentAccountName && accounts.length > 0) {
            currentAccountName = accounts[0].acc;
            setSelectedAccountName(currentAccountName);
          }

          const monitorAccount = accounts.find((a: any) => a.acc === currentAccountName);
          const prevMonitorAccount = prevStatsRef.current?.monitoring?.account_statz?.find((a: any) => a.acc === currentAccountName);

          if (monitorAccount && prevMonitorAccount) {
            inMsgsRate = Math.max(0, (monitorAccount.received.msgs - prevMonitorAccount.received.msgs) / interval);
            outMsgsRate = Math.max(0, (monitorAccount.sent.msgs - prevMonitorAccount.sent.msgs) / interval);
          }
        }
      }
      prevStatsRef.current = data;

      setHistory(prev => {
        const newHistory = [...prev, { 
          time: now, 
          jsRequests: jsRate, 
          inMsgs: inMsgsRate, 
          outMsgs: outMsgsRate 
        }].slice(-30);
        return newHistory;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    if (!activeConnection) return;
    setLoadingClients(true);
    try {
      const data = await apiClient.getMonitoringConnections(activeConnection.id, clientSort);
      setClients(data.connections || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClients(false);
    }
  };

  const lastTargetRef = useRef<string>('');

  useEffect(() => {
    // Reset account selection when connection changes
    if (activeConnection?.id !== prevConnectionIdRef.current) {
      setSelectedAccountName(null);
      setStats(null);
      setClients([]);
      setClientSort('pending');
      prevConnectionIdRef.current = activeConnection?.id || null;
    }

    const currentTarget = `${activeConnection?.id}-${selectedAccountName}`;
    if (currentTarget !== lastTargetRef.current) {
      setHistory([]);
      prevStatsRef.current = null;
      lastTargetRef.current = currentTarget;
    }
    
    loadStats();
    loadClients();
    const statsInterval = setInterval(loadStats, 2000);
    const clientsInterval = setInterval(loadClients, 2000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(clientsInterval);
    };
  }, [activeConnection?.id, selectedAccountName, clientSort]);

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

      {stats?.monitoring_error && (
        <div style={{ 
          background: 'rgba(239, 68, 68, 0.1)', 
          border: '1px solid var(--error-color)', 
          color: 'var(--error-color)',
          padding: '1rem',
          borderRadius: 'var(--radius)',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          fontSize: '0.875rem'
        }}>
          <Zap size={20} />
          <div>
            <strong>Monitoring Unavailable:</strong> {stats.monitoring_error} 
            <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>(Attempted: {stats.monitoring_url})</span>
          </div>
        </div>
      )}

      {/* Top Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)' }}>
            <Server size={24} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>{t('server')}</div>
            <div style={{ fontWeight: '700', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeConnection.url}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-color)' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>{t('status')}</div>
            <div style={{ fontWeight: '700', fontSize: '1rem' }} className={(stats?.status || activeConnection.status) === 'CONNECTED' ? 'status-connected' : 'status-disconnected'}>
              {stats?.status || activeConnection.status}
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning-color)' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>RTT</div>
            <div style={{ fontWeight: '700', fontSize: '1rem' }}>{stats?.rtt || '...'}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
          <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <Zap size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase' }}>{t('reconnects')}</div>
            <div style={{ fontWeight: '700', fontSize: '1rem' }}>{stats?.connection?.reconnects ?? '...'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
        {/* Main Throughput Chart */}
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} style={{ color: 'var(--accent-color)' }} />
              {stats?.monitoring ? t('monitoring_throughput') : t('message_throughput')}
            </h3>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)' }}></div>
                {t('in')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)' }}></div>
                {t('out')}
              </span>
            </div>
          </div>
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
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
          </div>
        </div>

        {/* Monitoring Data Panel */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} style={{ color: 'var(--accent-color)' }} />
              {t('monitoring_details')}
            </h3>
            {stats?.monitoring?.account_statz?.length > 1 && (
              <select 
                className="input" 
                style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                value={selectedAccountName || ''}
                onChange={(e) => {
                  setSelectedAccountName(e.target.value);
                }}
              >
                {stats.monitoring.account_statz.map((acc: any) => (
                  <option key={acc.acc} value={acc.acc}>
                    {acc.acc === '$G' ? 'Global ($G)' : acc.acc === '$SYS' ? 'System ($SYS)' : acc.acc}
                  </option>
                ))}
              </select>
            )}
          </div>
          {(() => {
            if (!stats) {
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <RefreshCcw size={32} className="animate-spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>{t('loading')}</p>
                </div>
              );
            }

            const accounts = stats?.monitoring?.account_statz || [];
            const acc = selectedAccountName 
              ? accounts.find((a: any) => a.acc === selectedAccountName)
              : accounts[0];

            if (acc) {
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="stat-item">
                    <div className="stat-label">{t('account')}</div>
                    <div className="stat-value">{acc.acc}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t('connections')}</div>
                    <div className="stat-value">
                      <AnimatedNumber value={acc.total_conns} />
                    </div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">{t('subscriptions')}</div>
                    <div className="stat-value">
                      <AnimatedNumber value={acc.num_subscriptions?.toLocaleString()} />
                    </div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label" style={{ color: acc.slow_consumers > 0 ? 'var(--error-color)' : '' }}>
                      {t('slow_consumers')}
                    </div>
                    <div className="stat-value" style={{ color: acc.slow_consumers > 0 ? 'var(--error-color)' : '' }}>
                      <AnimatedNumber value={acc.slow_consumers} />
                    </div>
                  </div>
                  <div className="stat-item" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className="stat-label">{t('total_received')}</span>
                      <span className="stat-value">
                        <AnimatedNumber value={acc.received?.msgs?.toLocaleString() + ' msgs'} />
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="stat-label">{t('data_received')}</span>
                      <span className="stat-value">
                        <AnimatedNumber value={formatBytes(acc.received?.bytes || 0)} />
                      </span>
                    </div>
                  </div>
                  <div className="stat-item" style={{ gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span className="stat-label">{t('total_sent')}</span>
                      <span className="stat-value">
                        <AnimatedNumber value={acc.sent?.msgs?.toLocaleString() + ' msgs'} />
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="stat-label">{t('data_sent')}</span>
                      <span className="stat-value">
                        <AnimatedNumber value={formatBytes(acc.sent?.bytes || 0)} />
                      </span>
                    </div>
                  </div>

                </div>
              );
            }

            if (stats.monitoring) {
               return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No account data found for monitoring.</p>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                <Zap size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>{t('no_monitoring_data')}</p>
                <p style={{ fontSize: '0.75rem' }}>{t('no_monitoring_hint')}</p>
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
        {/* Active Clients / Slow Consumers */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={20} style={{ color: 'var(--accent-color)' }} />
              {t('active_clients')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>{t('sort_by')}</span>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select 
                  className="input" 
                  style={{ 
                    width: 'auto', 
                    padding: '0.45rem 2.5rem 0.45rem 1rem', 
                    fontSize: '0.75rem', 
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    appearance: 'none',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    margin: 0,
                    lineHeight: '1.2'
                  }}
                  value={clientSort}
                  onChange={(e) => setClientSort(e.target.value)}
                >
                  <option value="pending">{t('pending_sort')}</option>
                  <option value="msgs_to">{t('msgs_to')}</option>
                  <option value="msgs_from">{t('msgs_from')}</option>
                </select>
                <div style={{ 
                  position: 'absolute', 
                  right: '0.85rem', 
                  pointerEvents: 'none', 
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                   {loadingClients && <RefreshCcw size={12} className="animate-spin" />}
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                     <path d="m6 9 6 6 6-6"/>
                   </svg>
                </div>
              </div>
            </div>
          </h3>
          
          {(() => {
            if (!stats && loading) {
              return (
                <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <RefreshCcw size={32} className="animate-spin" style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.75rem' }}>{t('loading')}</p>
                </div>
              );
            }

            if (clients.length > 0 || stats?.monitoring) {
              return (
                <div style={{ overflowX: 'auto' }} className={loadingClients ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ width: '30%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('name')} / {t('client_id')}</th>
                        <th style={{ width: '25%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('ip_address')}</th>
                        {clientSort === 'pending' && <th style={{ width: '15%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('pending_bytes')}</th>}
                        {clientSort === 'msgs_to' && <th style={{ width: '15%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('msgs_out')}</th>}
                        {clientSort === 'msgs_from' && <th style={{ width: '15%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('msgs_in')}</th>}
                        <th style={{ width: '10%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('rtt')}</th>
                        <th style={{ width: '10%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('uptime')}</th>
                        <th style={{ width: '10%', padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c: any) => (
                        <tr 
                          key={c.cid} 
                          className="hover:bg-black/5 transition-colors cursor-pointer" 
                          style={{ borderBottom: '1px solid var(--border-color)', opacity: c.slow_consumer ? 1 : 0.9 }}
                          onClick={() => setSelectedClient(c)}
                        >
                          <td style={{ padding: '0.75rem 0.5rem', overflow: 'hidden' }}>
                            <div style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '0.25rem' }} title={c.name || 'N/A'}>
                              {c.name || 'N/A'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>ID: {c.cid}</span>
                              {c.lang && (() => {
                                const colors: Record<string, string> = {
                                  go: '#00add8',
                                  rust: '#dea584',
                                  java: '#e76f00',
                                  node: '#68a063',
                                  python: '#3776ab',
                                  csharp: '#178600',
                                  ruby: '#701516',
                                  c: '#555555'
                                };
                                const color = colors[c.lang.toLowerCase()] || 'var(--accent-color)';
                                return (
                                  <span style={{ 
                                    fontSize: '0.6rem', 
                                    padding: '0.05rem 0.35rem', 
                                    borderRadius: '4px', 
                                    background: color, 
                                    color: 'white',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase',
                                    lineHeight: '1',
                                    flexShrink: 0
                                  }}>
                                    {c.lang}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.ip || c.host}:${c.port}`}>
                            {c.ip || c.host}:{c.port}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            {clientSort === 'pending' && (
                              <span style={{ color: c.pending_bytes > 1024 * 1024 ? 'var(--error-color)' : 'inherit', fontWeight: c.pending_bytes > 0 ? '600' : 'normal' }}>
                                <AnimatedNumber value={formatBytes(c.pending_bytes)} />
                              </span>
                            )}
                            {clientSort === 'msgs_to' && (
                              <AnimatedNumber value={c.out_msgs?.toLocaleString() || 0} />
                            )}
                            {clientSort === 'msgs_from' && (
                              <AnimatedNumber value={c.in_msgs?.toLocaleString() || 0} />
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                            {formatRTT(c.rtt)}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.uptime}
                          </td>
                          <td style={{ padding: '0.75rem 0.5rem' }}>
                            {c.slow_consumer ? (
                              <span className="status-badge status-disconnected" style={{ fontSize: '0.7rem' }}>
                                {t('slow')}
                              </span>
                            ) : (
                              <span className="status-badge status-connected" style={{ fontSize: '0.7rem', opacity: 0.5 }}>
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {clients.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            No active client connections found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            }

            if (stats?.monitoring) {
              return (
                <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <Server size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.75rem' }}>No client connection data available from monitoring.</p>
                </div>
              );
            }

            return (
              <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                <Server size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                <p style={{ fontSize: '0.75rem' }}>{t('no_monitoring_hint')}</p>
              </div>
            );
          })()}
        </div>

        {/* JetStream Summary */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Zap size={20} style={{ color: '#f59e0b' }} />
            {t('jetstream_summary')}
          </h3>
          {(() => {
            if (!stats) {
              return (
                <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  <RefreshCcw size={32} className="animate-spin" style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.75rem' }}>{t('loading')}</p>
                </div>
              );
            }

            if (stats.jetstream) {
              return (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{t('total_streams')}</span>
                    <span style={{ fontWeight: '700' }}>{stats.jetstream.streams}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{t('api_requests')}</span>
                    <span style={{ fontWeight: '700' }}>{stats.jetstream.api.total.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{t('memory_storage')}</span>
                    <span style={{ fontWeight: '700' }}>
                      <AnimatedNumber value={formatBytes(stats.jetstream.memory)} />
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{t('file_storage')}</span>
                    <span style={{ fontWeight: '700' }}>
                      <AnimatedNumber value={formatBytes(stats.jetstream.storage)} />
                    </span>
                  </div>

                </div>
              );
            }

            return (
              <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', textAlign: 'center' }}>
                <Zap size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                <p style={{ fontWeight: 600 }}>{t('status_disconnected')}</p>
                <p style={{ fontSize: '0.75rem' }}>{t('no_jetstream_data_hint')}</p>
              </div>
            );
          })()}
        </div>
      </div>

      <Modal
        isOpen={!!selectedClient}
        onClose={() => setSelectedClient(null)}
        title={t('connection_details')}
        width="600px"
      >
        {selectedClient && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '12px', 
                  background: 'linear-gradient(135deg, var(--accent-color), #6366f1)', 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '1.75rem', 
                  fontWeight: 'bold',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
                }}>
                  {selectedClient.name ? selectedClient.name[0].toUpperCase() : 'C'}
                </div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <h2 style={{ margin: '0 0 0.25rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.5rem' }}>{selectedClient.name || t('anonymous_client')}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: '500' }}>CID: {selectedClient.cid}</span>
                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-color)' }}></span>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      background: 'rgba(0,0,0,0.05)', 
                      padding: '0.1rem 0.4rem', 
                      borderRadius: '4px', 
                      fontWeight: '600', 
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase'
                    }}>{selectedClient.kind}</span>
                    {selectedClient.version && (
                       <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>v{selectedClient.version}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="stat-item">
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MapPin size={14} style={{ opacity: 0.7 }} />
                {t('ip_address')}
              </div>
              <div className="stat-value">{selectedClient.ip || selectedClient.host}:{selectedClient.port}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={14} style={{ opacity: 0.7 }} />
                {t('uptime')}
              </div>
              <div className="stat-value">{selectedClient.uptime}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Pulse size={14} style={{ opacity: 0.7 }} />
                {t('rtt')}
              </div>
              <div className="stat-value">{selectedClient.rtt}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Hash size={14} style={{ opacity: 0.7 }} />
                {t('subscriptions')}
              </div>
              <div className="stat-value">{selectedClient.subscriptions?.toLocaleString()}</div>
            </div>

            <div className="stat-item" style={{ gridColumn: 'span 2' }}>
              <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TrendingUp size={18} style={{ color: 'var(--accent-color)' }} />
                {t('throughput')}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <div className="stat-label">{t('msgs_in')}</div>
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>{selectedClient.in_msgs?.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <div className="stat-label">{t('msgs_out')}</div>
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>{selectedClient.out_msgs?.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <div className="stat-label">{t('bytes_in')}</div>
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>{formatBytes(selectedClient.in_bytes)}</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(0,0,0,0.03)' }}>
                  <div className="stat-label">{t('bytes_out')}</div>
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>{formatBytes(selectedClient.out_bytes)}</div>
                </div>
              </div>
            </div>

            <div className="stat-item" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.04)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="stat-label" style={{ color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center', marginBottom: '0.25rem' }}>
                      <Zap size={14} />
                      {t('pending_bytes')}
                    </div>
                    <div className="stat-value" style={{ color: 'var(--error-color)', fontSize: '1.75rem', fontWeight: '800' }}>{formatBytes(selectedClient.pending_bytes)}</div>
                  </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
