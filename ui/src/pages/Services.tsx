import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { RefreshCcw, Info, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ServiceInfo {
  name: string;
  id: string;
  version: string;
  metadata?: Record<string, string>;
}

const Services: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadServices = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/services`);
      const data = await res.json();
      setServices(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [activeConnection]);

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('discovery')}</h1>
        <button className="btn btn-primary" onClick={loadServices} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /> {t('refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridGap: '1rem' }}>
        {services.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Activity size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
            <p>{t('no_messages')}</p>
          </div>
        )}
        {services.map(s => (
          <div key={s.id} className="card animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{s.name}</h3>
                <span className="status-badge" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  {s.version}
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {t('info')} ID: {s.id}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" style={{ padding: '0.5rem' }} title={t('stats')}>
                <Activity size={18} />
              </button>
              <button className="btn btn-secondary" style={{ padding: '0.5rem' }} title={t('info')}>
                <Info size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Services;
