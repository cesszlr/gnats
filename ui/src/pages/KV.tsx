import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Plus, Trash2, Database, Key, Eye, X, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const KV: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<string[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [bucketStatus, setBucketStatus] = useState<any>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [newBucket, setNewBucket] = useState({ 
    bucket: '', 
    history: 1, 
    ttl: 0, 
    storage: 'file', 
    replicas: 1 
  });
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKey, setNewKey] = useState({ key: '', value: '' });
  const [viewingKey, setViewingKey] = useState<{ key: string, value: string } | null>(null);
  const [bucketSearch, setBucketSearch] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [formatMode, setFormatMode] = useState<'raw' | 'json' | 'yaml'>('raw');

  useEffect(() => {
    loadBuckets();
  }, [activeConnection]);

  useEffect(() => {
    if (selectedBucket) {
      loadKeys(selectedBucket);
      loadBucketStatus(selectedBucket);
    } else {
      setKeys([]);
      setBucketStatus(null);
    }
  }, [selectedBucket]);

  const loadBuckets = async () => {
    if (!activeConnection) return;
    setLoadingBuckets(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv`);
      const data = await res.json();
      setBuckets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBuckets(false);
    }
  };

  const loadKeys = async (bucket: string) => {
    if (!activeConnection) return;
    setLoadingKeys(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv/${bucket}/keys`);
      const data = await res.json();
      setKeys(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadBucketStatus = async (bucket: string) => {
    if (!activeConnection) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv/${bucket}/status`);
      const data = await res.json();
      setBucketStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const formatData = (data: string, mode: 'raw' | 'json' | 'yaml') => {
    if (mode === 'raw') return data;
    try {
      const obj = JSON.parse(data);
      if (mode === 'json') return JSON.stringify(obj, null, 2);
      if (mode === 'yaml') {
        const toYaml = (val: any, indent = 0): string => {
          if (val === null) return 'null';
          if (typeof val !== 'object') return String(val);
          return Object.entries(val).map(([k, v]) => {
            const spaces = '  '.repeat(indent);
            if (typeof v === 'object' && v !== null) {
              return `\n${spaces}${k}:\n${toYaml(v, indent + 1)}`;
            }
            return `\n${spaces}${k}: ${v}`;
          }).join('').trim();
        };
        return toYaml(obj);
      }
    } catch (e) {
      return data;
    }
    return data;
  };

  const handleViewKey = async (bucket: string, key: string) => {
    if (!activeConnection) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv/${bucket}/keys/${key}`);
      const data = await res.json();
      setViewingKey(data);
    } catch (err) {
      alert(err);
    }
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: newBucket.bucket,
          history: Number(newBucket.history),
          ttl: Number(newBucket.ttl) * 1e9, // Convert seconds to nanoseconds
          storage: newBucket.storage,
          replicas: Number(newBucket.replicas),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowAddBucket(false);
      loadBuckets();
    } catch (err) {
      alert(err);
    }
  };

  const handlePutKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection || !selectedBucket) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/kv/${selectedBucket}/keys/${newKey.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newKey.value }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowAddKey(false);
      loadKeys(selectedBucket);
    } catch (err) {
      alert(err);
    }
  };

  const filteredBuckets = buckets.filter(b => b.toLowerCase().includes(bucketSearch.toLowerCase()));
  const filteredKeys = keys.filter(k => k.toLowerCase().includes(keySearch.toLowerCase()));

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('kv')}</h1>
        <button className="btn btn-primary" onClick={() => setShowAddBucket(true)}>
          <Plus size={18} /> {t('new_bucket')}
        </button>
      </div>

      {showAddBucket && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleCreateBucket}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('bucket_name')}</label>
                <input className="input" value={newBucket.bucket} onChange={e => setNewBucket({ ...newBucket, bucket: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('history')}</label>
                <input type="number" className="input" value={newBucket.history} onChange={e => setNewBucket({ ...newBucket, history: parseInt(e.target.value) })} min={1} max={64} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('ttl')} ({t('optional')})</label>
                <input type="number" className="input" value={newBucket.ttl} onChange={e => setNewBucket({ ...newBucket, ttl: parseInt(e.target.value) })} min={0} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('storage')}</label>
                <select className="input" value={newBucket.storage} onChange={e => setNewBucket({ ...newBucket, storage: e.target.value })}>
                  <option value="file">File</option>
                  <option value="memory">Memory</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('replicas')}</label>
                <input type="number" className="input" value={newBucket.replicas} onChange={e => setNewBucket({ ...newBucket, replicas: parseInt(e.target.value) })} min={1} max={5} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button type="submit" className="btn btn-primary">{t('create')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddBucket(false)}>{t('cancel')}</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', flex: 1, overflow: 'hidden' }}>
        <div className="card scroll-area animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>{t('buckets')}</h3>
          <div className="search-input-wrapper" style={{ maxWidth: '100%', marginBottom: '1rem' }}>
            <Search className="search-icon" size={16} />
            <input 
              className="input" 
              style={{ fontSize: '0.8rem' }}
              placeholder={t('search_placeholder')} 
              value={bucketSearch}
              onChange={e => setBucketSearch(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            {loadingBuckets ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: '40px', width: '100%' }} />)}
              </div>
            ) : filteredBuckets.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('no_buckets')}</p>
            ) : filteredBuckets.map(b => (
              <div 
                key={b} 
                onClick={() => setSelectedBucket(b)}
                style={{ 
                  padding: '0.75rem 1rem', 
                  cursor: 'pointer', 
                  borderRadius: 'var(--radius)',
                  backgroundColor: selectedBucket === b ? 'var(--accent-color)' : '',
                  color: selectedBucket === b ? 'white' : '',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.25rem',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Database size={16} /> {b}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflow: 'hidden' }}>
          {viewingKey && (
            <div className="card animate-fade-in" style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Key size={18} /> {viewingKey.key}</h3>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className="btn-group">
                    <button className={`btn ${formatMode === 'raw' ? 'active' : ''}`} onClick={() => setFormatMode('raw')}>{t('raw')}</button>
                    <button className={`btn ${formatMode === 'json' ? 'active' : ''}`} onClick={() => setFormatMode('json')}>{t('json')}</button>
                    <button className={`btn ${formatMode === 'yaml' ? 'active' : ''}`} onClick={() => setFormatMode('yaml')}>{t('yaml')}</button>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setViewingKey(null)}><X size={18} /></button>
                </div>
              </div>
              <pre className="code-block" style={{ maxHeight: '300px' }}>
                {formatData(viewingKey.value, formatMode)}
              </pre>
            </div>
          )}

          <div className="card animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedBucket ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
                  <h3 style={{ margin: 0 }}>{t('keys')} in {selectedBucket}</h3>
                  <button className="btn btn-primary" onClick={() => setShowAddKey(true)}>
                    <Plus size={18} /> {t('put_key')}
                  </button>
                </div>

                {bucketStatus && (
                  <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                    <span>{t('values')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.values}</span></span>
                    <span>{t('history')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.history}</span></span>
                    <span>{t('ttl')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.ttl || 'None'}</span></span>
                    <span>{t('storage')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.storage}</span></span>
                  </div>
                )}

                <div className="search-input-wrapper" style={{ maxWidth: '100%', marginBottom: '1rem', flexShrink: 0 }}>
                  <Search className="search-icon" size={16} />
                  <input 
                    className="input" 
                    placeholder={t('search_placeholder')} 
                    value={keySearch}
                    onChange={e => setKeySearch(e.target.value)}
                  />
                </div>

                {showAddKey && (
                  <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', flexShrink: 0, background: 'rgba(0,0,0,0.01)' }}>
                    <form onSubmit={handlePutKey}>
                      <div className="form-group">
                        <label className="form-label">{t('key')}</label>
                        <input className="input" value={newKey.key} onChange={e => setNewKey({ ...newKey, key: e.target.value })} placeholder="e.g. config.timeout" required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">{t('value')} (JSON supported)</label>
                        <textarea className="input" style={{ height: '100px', fontFamily: 'monospace' }} value={newKey.value} onChange={e => setNewKey({ ...newKey, value: e.target.value })} required />
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="submit" className="btn btn-primary">{t('create')}</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowAddKey(false)}>{t('cancel')}</button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="scroll-area" style={{ flex: 1 }}>
                  {loadingKeys ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '50px', width: '100%' }} />)}
                    </div>
                  ) : filteredKeys.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      <Key size={40} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                      <p>{t('no_keys')}</p>
                    </div>
                  ) : filteredKeys.map(k => (
                    <div key={k} className="animate-fade-in" style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '500' }}>{k}</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={() => handleViewKey(selectedBucket, k)}>
                          <Eye size={16} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem', color: 'var(--error-color)' }} onClick={() => {
                            if (confirm(`Delete key ${k}?`)) {
                              fetch(`/api/connections/${activeConnection.id}/kv/${selectedBucket}/keys/${k}`, { method: 'DELETE' })
                                .then(() => loadKeys(selectedBucket));
                            }
                        }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.5 }}>
                <Database size={64} style={{ marginBottom: '1.5rem' }} />
                <p>{t('select_bucket')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KV;
