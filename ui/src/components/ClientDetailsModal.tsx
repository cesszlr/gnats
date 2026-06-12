import React from 'react';
import { MapPin, Clock, Activity as Pulse, Hash, TrendingUp, Zap } from 'lucide-react';
import Modal from './Modal';
import { formatBytes } from '../utils/format';

interface ClientDetailsModalProps {
  selectedClient: any;
  onClose: () => void;
  t: (key: string) => string;
}

export const ClientDetailsModal: React.FC<ClientDetailsModalProps> = ({
  selectedClient,
  onClose,
  t,
}) => {
  return (
    <Modal
      isOpen={!!selectedClient}
      onClose={onClose}
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
                <h2 style={{ margin: '0 0 0.25rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.5rem' }}>
                  {selectedClient.name || t('anonymous_client')}
                </h2>
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
                  <div className="stat-value" style={{ color: 'var(--error-color)', fontSize: '1.75rem', fontWeight: '800' }}>
                    {formatBytes(selectedClient.pending_bytes)}
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
