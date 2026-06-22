import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Activity, Server, Clock, RefreshCcw, TrendingUp, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import { ThroughputChart } from '../components/ThroughputChart';
import { ActiveClientsTable } from '../components/ActiveClientsTable';
import { ClientDetailsModal } from '../components/ClientDetailsModal';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { formatBytes, formatNumber } from '../utils/format';

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

  const loadStats = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const data = await apiClient.getStats(activeConnection.id);
      setStats(data);

      if (data.status === 'DISCONNECTED') {
        setLoading(false);
        return;
      }

      const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let jsRate = 0;
      let inMsgsRate = 0;
      let outMsgsRate = 0;

      if (prevStatsRef.current) {
        const interval = 2; 
        
        if (data.jetstream && prevStatsRef.current.jetstream) {
          jsRate = Math.max(0, (data.jetstream.api.total - prevStatsRef.current.jetstream.api.total) / interval);
        }
        
        if (data.connection && prevStatsRef.current.connection) {
          inMsgsRate = Math.max(0, (data.connection.in_msgs - prevStatsRef.current.connection.in_msgs) / interval);
          outMsgsRate = Math.max(0, (data.connection.out_msgs - prevStatsRef.current.connection.out_msgs) / interval);
        }

        if (data.monitoring?.account_statz) {
          const accounts = data.monitoring.account_statz;
          
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
            <ThroughputChart history={history} t={t} />
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
                      <AnimatedNumber value={formatNumber(acc.num_subscriptions)} />
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
                        <AnimatedNumber value={formatNumber(acc.received?.msgs || 0) + ' msgs'} />
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
                        <AnimatedNumber value={formatNumber(acc.sent?.msgs || 0) + ' msgs'} />
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
          
          <ActiveClientsTable
            stats={stats}
            loading={loading}
            loadingClients={loadingClients}
            clients={clients}
            clientSort={clientSort}
            onSelectClient={setSelectedClient}
            t={t}
          />
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
                    <span style={{ fontWeight: '700' }}>{formatNumber(stats.jetstream.api.total)}</span>
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

      <ClientDetailsModal
        selectedClient={selectedClient}
        onClose={() => setSelectedClient(null)}
        t={t}
      />
    </div>
  );
};

export default Dashboard;
