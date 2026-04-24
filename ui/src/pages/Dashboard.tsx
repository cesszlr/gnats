import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Activity, Server, Clock, Database, HardDrive, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Dashboard: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000);
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <h1>{t('dashboard')}</h1>
        <button className="btn btn-secondary" onClick={loadStats} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
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

      {stats?.jetstream && (
        <div className="animate-fade-in">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Activity size={24} style={{ color: 'var(--accent-color)' }} />
            JetStream {t('stats')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            <div className="card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: '600' }}>
                <Activity size={18} /> {t('jetstream')}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.025em' }}>{stats.jetstream.streams}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t('total_streams')}</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--success-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: '600' }}>
                <Database size={18} /> {t('messages')}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.025em' }}>{stats.jetstream.api.total}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t('api_requests')}</div>
            </div>
            <div className="card" style={{ borderLeft: '4px solid var(--warning-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: '600' }}>
                <HardDrive size={18} /> {t('storage')}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.025em' }}>{(stats.jetstream.memory / 1024 / 1024).toFixed(2)} MB</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{t('memory_usage')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
