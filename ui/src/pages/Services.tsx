import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { RefreshCcw, Info, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';

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
  const [expandedService, setExpandedService] = useState<Record<string, 'info' | 'stats' | null>>({});
  const [serviceDetails, setServiceDetails] = useState<Record<string, { info?: any; stats?: any; loadingInfo?: boolean; loadingStats?: boolean }>>({});

  const loadServices = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const data = await apiClient.listServices(activeConnection.id);
      setServices(data || []);
      // Reset expanded states on refresh
      setExpandedService({});
      setServiceDetails({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceDetail = async (name: string, id: string, type: 'info' | 'stats') => {
    if (!activeConnection) return null;
    const subject = type === 'info' ? `$SRV.INFO.${name}.${id}` : `$SRV.STATS.${name}.${id}`;
    try {
      const res = await apiClient.request(activeConnection.id, {
        subject,
        data: "",
        timeout: 3000
      });
      if (res && res.data) {
        return JSON.parse(res.data);
      }
    } catch (err) {
      console.error(`Failed to fetch service ${type}:`, err);
    }
    return null;
  };

  const togglePanel = async (name: string, id: string, type: 'info' | 'stats') => {
    const key = `${name}-${id}`;
    const currentType = expandedService[key];

    if (currentType === type) {
      setExpandedService(prev => ({ ...prev, [key]: null }));
      return;
    }

    setExpandedService(prev => ({ ...prev, [key]: type }));

    // Set loading state
    setServiceDetails(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [`loading${type === 'info' ? 'Info' : 'Stats'}`]: true
      }
    }));

    const data = await fetchServiceDetail(name, id, type);

    setServiceDetails(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [type]: data,
        [`loading${type === 'info' ? 'Info' : 'Stats'}`]: false
      }
    }));
  };

  useEffect(() => {
    loadServices();
  }, [activeConnection]);

  const renderDetailPanel = (s: ServiceInfo, type: 'info' | 'stats') => {
    const key = `${s.name}-${s.id}`;
    const details = serviceDetails[key];
    if (!details) return null;

    if (type === 'info') {
      if (details.loadingInfo) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('loading')}
          </div>
        );
      }
      const infoData = details.info;
      if (!infoData) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', color: 'var(--error-color)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
            {t('service_load_failed')}
          </div>
        );
      }
      return (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {infoData.description && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <strong>{t('description')}:</strong> {infoData.description}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.50rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('endpoints')}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {infoData.endpoints && infoData.endpoints.map((ep: any, idx: number) => (
                <div key={idx} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.9rem' }}>{ep.name}</span>
                    {ep.metadata && Object.keys(ep.metadata).length > 0 && (
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {Object.entries(ep.metadata).map(([k, v]) => (
                          <span key={k} className="status-badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', backgroundColor: 'var(--bg-color)' }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {t('subject')}: {ep.subject}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    } else {
      if (details.loadingStats) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('loading')}
          </div>
        );
      }
      const statsData = details.stats;
      if (!statsData) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', color: 'var(--error-color)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
            {t('service_load_failed')}
          </div>
        );
      }

      const formatNsToMs = (ns: number) => {
        if (!ns && ns !== 0) return '0.00 ms';
        return `${(ns / 1000000).toFixed(2)} ms`;
      };

      return (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {statsData.started && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <strong>{t('started')}:</strong> {new Date(statsData.started).toLocaleString()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.50rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('stats')}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {statsData.endpoints && statsData.endpoints.map((ep: any, idx: number) => (
                <div key={idx} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{ep.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ep.subject}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', backgroundColor: 'var(--bg-color)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('requests')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent-color)' }}>{ep.num_requests ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('errors')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: ep.num_errors > 0 ? 'var(--error-color)' : 'var(--success-color)' }}>{ep.num_errors ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('avg_latency')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatNsToMs(ep.average_processing_time)}</div>
                    </div>
                  </div>
                  {ep.last_error && (
                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderLeft: '3px solid var(--error-color)', fontSize: '0.75rem', color: 'var(--error-color)', wordBreak: 'break-all' }}>
                      <strong>{t('last_error')}:</strong> {ep.last_error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  };

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
        {services.map(s => {
          const key = `${s.name}-${s.id}`;
          const currentType = expandedService[key];
          return (
            <div key={s.id} className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
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
                  {s.metadata && Object.keys(s.metadata).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                      {Object.entries(s.metadata).map(([k, v]) => (
                        <span key={k} className="status-badge" style={{ fontSize: '0.7rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.15rem 0.4rem' }}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary custom-tooltip"
                    data-tooltip={t('stats')}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: currentType === 'stats' ? 'var(--accent-color)' : '',
                      color: currentType === 'stats' ? 'white' : ''
                    }}
                    onClick={() => togglePanel(s.name, s.id, 'stats')}
                  >
                    <Activity size={18} />
                  </button>
                  <button
                    className="btn btn-secondary custom-tooltip"
                    data-tooltip={t('info')}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: currentType === 'info' ? 'var(--accent-color)' : '',
                      color: currentType === 'info' ? 'white' : ''
                    }}
                    onClick={() => togglePanel(s.name, s.id, 'info')}
                  >
                    <Info size={18} />
                  </button>
                </div>
              </div>
              {currentType && renderDetailPanel(s, currentType)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Services;
