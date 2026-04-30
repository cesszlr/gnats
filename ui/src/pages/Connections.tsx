import React, { useState } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { apiClient } from '../api/client';
import type { ConnectionConfig } from '../api/client';
import { Plus, Search, Trash2, FileText, FileCode, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../components/Modal';

const Connections: React.FC = () => {
  const { connections, refreshConnections } = useConnection();
  const { t } = useTranslation();

  React.useEffect(() => {
    const interval = setInterval(() => refreshConnections(), 5000);
    return () => clearInterval(interval);
  }, [refreshConnections]);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tlsMode, setTlsMode] = useState<'path' | 'content'>('path');
  
  const initialConfig: ConnectionConfig = {
    id: '',
    name: '',
    url: 'nats://localhost:4222',
    token: '',
    user: '',
    password: '',
    insecure: false,
    ca_file: '',
    cert_file: '',
    key_file: '',
    ca_content: '',
    cert_content: '',
    key_content: '',
    domain: '',
    monitoring_url: '',
  };

  const [newConfig, setNewConfig] = useState<ConnectionConfig>(initialConfig);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState('');

  const filteredConnections = connections.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.url.toLowerCase().includes(search.toLowerCase())
  );

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Create a clean config based on mode
      const finalConfig = { ...newConfig };
      if (tlsMode === 'path') {
        finalConfig.ca_content = '';
        finalConfig.cert_content = '';
        finalConfig.key_content = '';
      } else {
        finalConfig.ca_file = '';
        finalConfig.cert_file = '';
        finalConfig.key_file = '';
      }

      if (editingId) {
        await apiClient.updateConnection(editingId, finalConfig);
      } else {
        const id = newConfig.name.toLowerCase().replace(/\s+/g, '-');
        finalConfig.id = id;
        await apiClient.connect(finalConfig);
      }
      
      setShowAdd(false);
      setEditingId(null);
      await refreshConnections(newConfig.id);
    } catch (err) {
      alert(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (conn: ConnectionConfig) => {
    setNewConfig({ ...conn });
    setEditingId(conn.id);
    setShowAdd(true);
    setShowAdvanced(true);
    // Detect TLS mode
    if (conn.ca_content || conn.cert_content || conn.key_content) {
      setTlsMode('content');
    } else {
      setTlsMode('path');
    }
  };

  const handleCancel = () => {
    setShowAdd(false);
    setEditingId(null);
    setNewConfig(initialConfig);
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm(t('disconnect_confirm'))) return;
    try {
      await apiClient.disconnect(id);
      await refreshConnections();
    } catch (err) {
      alert(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('delete') + '?')) return;
    try {
      await apiClient.forget(id);
      await refreshConnections();
    } catch (err) {
      alert(err);
    }
  };

  const handleReconnect = async (cfg: ConnectionConfig) => {
    setLoading(true);
    try {
      await apiClient.connect(cfg);
      await refreshConnections(cfg.id);
    } catch (err) {
      alert(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('connections')}</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="search-input-wrapper">
            <Search className="search-icon" size={18} />
            <input 
              className="input" 
              placeholder={t('search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={18} /> {t('add_connection')}
          </button>
        </div>
      </div>

      <Modal 
        isOpen={showAdd} 
        onClose={handleCancel} 
        title={editingId ? t('edit') + ' ' + t('connections') : t('add_connection')}
        width="800px"
      >
        <form onSubmit={handleConnect}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">{t('name')}</label>
              <input 
                className="input" 
                value={newConfig.name} 
                onChange={e => setNewConfig({ ...newConfig, name: e.target.value })} 
                placeholder="e.g. Production Cluster"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('url')}</label>
              <input 
                className="input" 
                value={newConfig.url} 
                onChange={e => setNewConfig({ ...newConfig, url: e.target.value })} 
                placeholder="nats://localhost:4222"
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }} onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced ? t('hide') : t('advanced')} {t('options')}
            </button>
          </div>

          {showAdvanced && (
            <div className="animate-fade-in" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="form-group">
                  <label className="form-label">{t('token')}</label>
                  <input className="input" value={newConfig.token} onChange={e => setNewConfig({ ...newConfig, token: e.target.value })} placeholder="Secret Token" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('domain')}</label>
                  <input className="input" value={newConfig.domain} onChange={e => setNewConfig({ ...newConfig, domain: e.target.value })} placeholder="JetStream Domain (optional)" />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('monitoring_url')} (Option C)</label>
                  <input className="input" value={newConfig.monitoring_url} onChange={e => setNewConfig({ ...newConfig, monitoring_url: e.target.value })} placeholder={t('monitoring_url_hint')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('user')}</label>
                  <input className="input" value={newConfig.user} onChange={e => setNewConfig({ ...newConfig, user: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('password')}</label>
                  <input className="input" type="password" value={newConfig.password} onChange={e => setNewConfig({ ...newConfig, password: e.target.value })} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>TLS Configuration</h3>
                  <div className="btn-group">
                    <button type="button" className={`btn ${tlsMode === 'path' ? 'active' : ''}`} onClick={() => setTlsMode('path')}>
                      <FileText size={14} /> {t('tls_mode_path')}
                    </button>
                    <button type="button" className={`btn ${tlsMode === 'content' ? 'active' : ''}`} onClick={() => setTlsMode('content')}>
                      <FileCode size={14} /> {t('tls_mode_content')}
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={newConfig.insecure} onChange={e => setNewConfig({ ...newConfig, insecure: e.target.checked })} />
                    <label className="form-label" style={{ marginBottom: 0 }}>{t('skip_verify')} (Insecure)</label>
                  </div>
                </div>

                {tlsMode === 'path' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label className="form-label">{t('ca_file')}</label>
                      <input className="input" value={newConfig.ca_file} onChange={e => setNewConfig({ ...newConfig, ca_file: e.target.value })} placeholder="/etc/nats/ca.pem" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('cert_file')}</label>
                      <input className="input" value={newConfig.cert_file} onChange={e => setNewConfig({ ...newConfig, cert_file: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('key_file')}</label>
                      <input className="input" value={newConfig.key_file} onChange={e => setNewConfig({ ...newConfig, key_file: e.target.value })} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="form-group">
                      <label className="form-label">{t('ca_file')} Content</label>
                      <textarea 
                        className="input" 
                        style={{ height: '100px', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} 
                        value={newConfig.ca_content} 
                        onChange={e => setNewConfig({ ...newConfig, ca_content: e.target.value })} 
                        placeholder={t('tls_ca_hint')}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      <div className="form-group">
                        <label className="form-label">{t('cert_file')} Content</label>
                        <textarea 
                          className="input" 
                          style={{ height: '100px', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} 
                          value={newConfig.cert_content} 
                          onChange={e => setNewConfig({ ...newConfig, cert_content: e.target.value })} 
                          placeholder={t('tls_cert_hint')}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('key_file')} Content</label>
                        <textarea 
                          className="input" 
                          style={{ height: '100px', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre' }} 
                          value={newConfig.key_content} 
                          onChange={e => setNewConfig({ ...newConfig, key_content: e.target.value })} 
                          placeholder={t('tls_key_hint')}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '...' : (editingId ? t('save') : t('connect'))}
            </button>
          </div>
        </form>
      </Modal>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {filteredConnections.map(conn => (
          <div key={conn.id} className="card animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <h3 style={{ margin: 0 }}>{conn.name}</h3>
                <span className={`status-badge ${conn.status === 'CONNECTED' ? 'status-connected' : 'status-disconnected'}`}>
                  {conn.status}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{conn.url}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label className="switch" title={conn.status === 'CONNECTED' ? t('disconnect') : t('connect')}>
                <input 
                  type="checkbox" 
                  checked={conn.status === 'CONNECTED'} 
                  onChange={() => conn.status === 'CONNECTED' ? handleDisconnect(conn.id) : handleReconnect(conn)}
                />
                <span className="slider"></span>
              </label>
              
              <button className="btn btn-secondary" style={{ padding: '0.5rem' }} title={t('edit')} onClick={() => handleEdit(conn)}>
                <Edit2 size={18} />
              </button>
              
              <button className="btn btn-secondary" style={{ padding: '0.5rem' }} title={t('delete')} onClick={() => handleDelete(conn.id)}>
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Connections;
