import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Plus, Trash2, HardDrive, Search, Package, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ObjectInfo {
  name: string;
  size: number;
  mod_time: string;
}

const ObjectStore: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<string[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [bucketStatus, setBucketStatus] = useState<any>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [bucketSearch, setBucketSearch] = useState('');
  const [objectSearch, setObjectSearch] = useState('');

  useEffect(() => {
    loadBuckets();
    setSelectedBucket(null);
    setObjects([]);
    setBucketStatus(null);
    setBucketSearch('');
    setObjectSearch('');
  }, [activeConnection]);

  useEffect(() => {
    if (selectedBucket) {
      loadObjects(selectedBucket);
      loadBucketStatus(selectedBucket);
    } else {
      setObjects([]);
      setBucketStatus(null);
    }
  }, [selectedBucket]);

  const handleSelectBucket = (bucket: string) => {
    setSelectedBucket(bucket);
    setObjectSearch('');
    setObjects([]);
  };

  const loadBuckets = async () => {
    if (!activeConnection) return;
    setLoadingBuckets(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/object-store`);
      const data = await res.json();
      setBuckets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBuckets(false);
    }
  };

  const loadObjects = async (bucket: string) => {
    if (!activeConnection) return;
    setLoadingObjects(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/object-store/${bucket}/objects`);
      const data = await res.json();
      setObjects(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingObjects(false);
    }
  };

  const loadBucketStatus = async (bucket: string) => {
    if (!activeConnection) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/object-store/${bucket}/status`);
      const data = await res.json();
      setBucketStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/object-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: newBucketName }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowAddBucket(false);
      loadBuckets();
    } catch (err) {
      alert(err);
    }
  };

  const filteredBuckets = buckets.filter(b => b.toLowerCase().includes(bucketSearch.toLowerCase()));
  const filteredObjects = objects.filter(o => o.name.toLowerCase().includes(objectSearch.toLowerCase()));

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('object_store')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={loadBuckets} disabled={loadingBuckets} title={t('refresh')}>
            <RefreshCcw size={18} className={loadingBuckets ? 'animate-spin' : ''} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddBucket(true)}>
            <Plus size={18} /> {t('new_bucket')}
          </button>
        </div>
      </div>

      {showAddBucket && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleCreateBucket}>
            <div className="form-group">
              <label className="form-label">{t('bucket_name')}</label>
              <input className="input" value={newBucketName} onChange={e => setNewBucketName(e.target.value)} required />
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
                {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '40px', width: '100%' }} />)}
              </div>
            ) : filteredBuckets.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('no_buckets')}</p>
            ) : filteredBuckets.map(b => (
              <div 
                key={b} 
                onClick={() => handleSelectBucket(b)}
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
                  <HardDrive size={16} /> {b}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedBucket ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
                <h3 style={{ margin: 0 }}>{t('objects')} in {selectedBucket}</h3>
                <button className="btn btn-secondary" onClick={() => { loadObjects(selectedBucket); loadBucketStatus(selectedBucket); }} disabled={loadingObjects} title={t('refresh')}>
                  <RefreshCcw size={18} className={loadingObjects ? 'animate-spin' : ''} />
                </button>
              </div>

              {bucketStatus && (
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                  <span>{t('storage')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.storage}</span></span>
                  <span>{t('history')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.history}</span></span>
                  <span>{t('ttl')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.ttl || 'None'}</span></span>
                </div>
              )}

              <div className="search-input-wrapper" style={{ maxWidth: '100%', marginBottom: '1rem', flexShrink: 0 }}>
                <Search className="search-icon" size={16} />
                <input 
                  className="input" 
                  placeholder={t('search_placeholder')} 
                  value={objectSearch}
                  onChange={e => setObjectSearch(e.target.value)}
                />
              </div>

              <div className="scroll-area" style={{ flex: 1 }}>
                {loadingObjects ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '60px', width: '100%' }} />)}
                  </div>
                ) : filteredObjects.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Package size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>{t('no_messages')}</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {filteredObjects.map(obj => (
                      <div key={obj.name} className="animate-fade-in" style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{obj.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            {(obj.size / 1024).toFixed(2)} KB • {new Date(obj.mod_time).toLocaleString()}
                          </div>
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '0.4rem', color: 'var(--error-color)' }} onClick={() => {
                            if (confirm(`Delete object ${obj.name}?`)) {
                              fetch(`/api/connections/${activeConnection.id}/object-store/${selectedBucket}/objects/${obj.name}`, { method: 'DELETE' })
                                .then(() => loadObjects(selectedBucket));
                            }
                        }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.5 }}>
              <HardDrive size={64} style={{ marginBottom: '1.5rem' }} />
              <p>{t('select_bucket')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ObjectStore;
