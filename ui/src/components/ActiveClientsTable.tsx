import React from 'react';
import { Server, RefreshCcw } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { formatBytes, formatRTT } from '../utils/format';

interface ActiveClientsTableProps {
  stats: any;
  loading: boolean;
  loadingClients: boolean;
  clients: any[];
  clientSort: string;
  onSelectClient: (client: any) => void;
  t: (key: string) => string;
}

export const ActiveClientsTable: React.FC<ActiveClientsTableProps> = ({
  stats,
  loading,
  loadingClients,
  clients,
  clientSort,
  onSelectClient,
  t,
}) => {
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
                onClick={() => onSelectClient(c)}
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
};
