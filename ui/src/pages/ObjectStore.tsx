import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Plus, Trash2, HardDrive, Search, Package, RefreshCcw, Download, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import Modal from '../components/Modal';
import { formatBytes } from '../utils/format';

interface ObjectInfo {
  name: string;
  description?: string;
  size: number;
  mtime: string;
  chunks: number;
  digest: string;
  nuid: string;
  metadata?: Record<string, string>;
  headers?: Record<string, string[]>;
}

const ObjectStore: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [buckets, setBuckets] = useState<string[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bucketStatus, setBucketStatus] = useState<any>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [bucketSearch, setBucketSearch] = useState('');
  const [objectSearch, setObjectSearch] = useState('');
  const [expandedObjects, setExpandedObjects] = useState<Record<string, boolean>>({});

  const LIMIT = 50;

  useEffect(() => {
    loadBuckets();
    setSelectedBucket(null);
    setObjects([]);
    setBucketStatus(null);
    setBucketSearch('');
    setObjectSearch('');
    setExpandedObjects({});
    setOffset(0);
    setHasMore(false);
  }, [activeConnection]);

  // 当搜索变化时，重置列表和分页偏移
  useEffect(() => {
    setObjects([]);
    setOffset(0);
    setHasMore(false);
  }, [objectSearch]);

  // 分页及过滤拉取
  useEffect(() => {
    if (selectedBucket) {
      const timer = setTimeout(() => {
        loadObjects(selectedBucket, objectSearch, offset);
      }, offset === 0 ? 300 : 0);
      loadBucketStatus(selectedBucket);
      return () => clearTimeout(timer);
    } else {
      setObjects([]);
      setHasMore(false);
      setOffset(0);
      setBucketStatus(null);
    }
  }, [selectedBucket, objectSearch, offset]);

  const handleSelectBucket = (bucket: string) => {
    setSelectedBucket(bucket);
    setObjectSearch('');
    setOffset(0);
    setObjects([]);
    setHasMore(false);
  };

  const loadBuckets = async () => {
    if (!activeConnection) return;
    setLoadingBuckets(true);
    try {
      const data = await apiClient.listObjectStores(activeConnection.id);
      setBuckets(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBuckets(false);
    }
  };

  const loadObjects = async (bucket: string, search = '', currentOffset = 0) => {
    if (!activeConnection) return;
    if (currentOffset === 0) {
      setLoadingObjects(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const data = await apiClient.listObjects(activeConnection.id, bucket, search, currentOffset, LIMIT);
      const newObjects = data.objects || [];
      if (currentOffset === 0) {
        setObjects(newObjects);
      } else {
        setObjects(prev => [...prev, ...newObjects]);
      }
      setHasMore(data.hasMore || false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingObjects(false);
      setLoadingMore(false);
    }
  };

  const loadBucketStatus = async (bucket: string) => {
    if (!activeConnection) return;
    try {
      const data = await apiClient.getObjectStoreStatus(activeConnection.id, bucket);
      setBucketStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    try {
      await apiClient.createObjectStore(activeConnection.id, { bucket: newBucketName });
      setShowAddBucket(false);
      loadBuckets();
    } catch (err) {
      alert(err);
    }
  };

  const handleDownloadObject = async (name: string) => {
    if (!activeConnection || !selectedBucket) return;
    try {
      await apiClient.downloadObject(activeConnection.id, selectedBucket, name, name);
    } catch (err) {
      alert(err);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (hasMore && !loadingObjects && !loadingMore && target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      setOffset(prev => prev + LIMIT);
    }
  };

  const filteredBuckets = buckets.filter(b => b.toLowerCase().includes(bucketSearch.toLowerCase()));

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

      <Modal 
        isOpen={showAddBucket} 
        onClose={() => setShowAddBucket(false)} 
        title={t('new_bucket')}
        width="500px"
      >
        <form onSubmit={handleCreateBucket}>
          <div className="form-group">
            <label className="form-label">{t('bucket_name')}</label>
            <input className="input" value={newBucketName} onChange={e => setNewBucketName(e.target.value)} required />
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddBucket(false)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('create')}</button>
          </div>
        </form>
      </Modal>

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
                <h3 style={{ margin: 0 }}>{t('objects_in_bucket', { bucket: selectedBucket })}</h3>
                <button 
                  className="btn btn-secondary custom-tooltip" 
                  onClick={() => { loadObjects(selectedBucket); loadBucketStatus(selectedBucket); }} 
                  disabled={loadingObjects} 
                  data-tooltip={t('refresh')}
                >
                  <RefreshCcw size={18} className={loadingObjects ? 'animate-spin' : ''} />
                </button>
              </div>

              {bucketStatus && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <span>{t('storage')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.storage}</span></span>
                    <span>{t('size')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{formatBytes(bucketStatus.size)}</span></span>
                    <span>{t('replicas')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.replicas}</span></span>
                    <span>{t('ttl')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.ttl || 'None'}</span></span>
                    <span>{t('compressed')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.is_compressed ? t('yes') : t('no')}</span></span>
                    <span>{t('sealed')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.sealed ? t('yes') : t('no')}</span></span>
                  </div>
                  {bucketStatus.metadata && Object.keys(bucketStatus.metadata).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('metadata')}:</span>
                      {Object.entries(bucketStatus.metadata).map(([k, v]) => (
                        <span key={k} className="status-badge" style={{ fontSize: '0.7rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.1rem 0.35rem' }}>
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
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

              <div className="scroll-area" style={{ flex: 1 }} onScroll={handleScroll}>
                {loadingObjects ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '60px', width: '100%' }} />)}
                  </div>
                ) : objects.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                    <Package size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>{t('no_messages')}</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {objects.map(obj => {
                      const isExpanded = !!expandedObjects[obj.name];
                      return (
                        <div key={obj.name} className="animate-fade-in" style={{ borderBottom: '1px solid var(--border-color)', padding: '0.75rem 0' }}>
                          <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{obj.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                {formatBytes(obj.size)} • {new Date(obj.mtime).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="btn btn-secondary custom-tooltip" 
                                style={{ padding: '0.4rem', color: isExpanded ? 'var(--accent-color)' : 'var(--text-secondary)' }} 
                                onClick={() => setExpandedObjects(prev => ({ ...prev, [obj.name]: !prev[obj.name] }))}
                                data-tooltip={t('details')}
                              >
                                <Info size={16} />
                              </button>
                              <button 
                                className="btn btn-secondary custom-tooltip" 
                                style={{ padding: '0.4rem', color: 'var(--accent-color)' }} 
                                onClick={() => handleDownloadObject(obj.name)}
                                data-tooltip={t('download')}
                              >
                                <Download size={16} />
                              </button>
                              <button 
                                className="btn btn-secondary custom-tooltip" 
                                style={{ padding: '0.4rem', color: 'var(--error-color)' }} 
                                onClick={() => {
                                  if (confirm(t('delete_object_confirm', { name: obj.name }))) {
                                    apiClient.deleteObject(activeConnection.id, selectedBucket, obj.name)
                                      .then(() => loadObjects(selectedBucket));
                                  }
                                }}
                                data-tooltip={t('delete')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div style={{ 
                              margin: '0.75rem 1rem 0.25rem 1rem', 
                              padding: '1rem', 
                              backgroundColor: 'var(--bg-secondary)', 
                              borderRadius: 'var(--radius)', 
                              border: '1px solid var(--border-color)',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)'
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem 1rem' }}>
                                <div style={{ fontWeight: '500' }}>{t('nuid')}:</div>
                                <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{obj.nuid}</div>
                                
                                <div style={{ fontWeight: '500' }}>{t('chunks_count')}:</div>
                                <div style={{ color: 'var(--text-primary)' }}>{obj.chunks}</div>
                                
                                <div style={{ fontWeight: '500' }}>{t('digest')}:</div>
                                <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{obj.digest}</div>
                                
                                {obj.description && (
                                  <>
                                    <div style={{ fontWeight: '500' }}>{t('description')}:</div>
                                    <div style={{ color: 'var(--text-primary)' }}>{obj.description}</div>
                                  </>
                                )}
                              </div>
                              
                              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border-color)' }}>
                                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{t('metadata')}</div>
                                {obj.metadata && Object.keys(obj.metadata).length > 0 ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                    {Object.entries(obj.metadata).map(([key, val]) => (
                                      <div key={key} style={{ padding: '0.35rem 0.5rem', backgroundColor: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                        <span style={{ fontWeight: '500', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{key}</span>
                                        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all', textAlign: 'right' }}>{val}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t('no_metadata')}</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {loadingMore && (
                  <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid var(--accent-color)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
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
