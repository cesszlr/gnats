import React, { useState, useEffect, useMemo } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { Plus, RefreshCcw, Search, Database, Key, X, Eye, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { AddBucketModal } from '../components/AddBucketModal';
import { PutKeyModal } from '../components/PutKeyModal';

const KV: React.FC = () => {
  const { activeConnection, theme } = useConnection();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [buckets, setBuckets] = useState<string[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 100;
  const [bucketStatus, setBucketStatus] = useState<any>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [showAddKey, setShowAddKey] = useState(false);
  const [viewingKey, setViewingKey] = useState<{ key: string, value: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [bucketSearch, setBucketSearch] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [formatMode, setFormatMode] = useState<'raw' | 'json' | 'yaml'>('raw');

  const extensions = useMemo(() => {
    if (formatMode === 'json') return [json()];
    if (formatMode === 'yaml') return [yaml()];
    return [];
  }, [formatMode]);

  const cmTheme = useMemo(() => {
    if (theme === 'dark') return vscodeDark;
    if (theme === 'light') return vscodeLight;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? vscodeDark : vscodeLight;
  }, [theme]);

  useEffect(() => {
    loadBuckets();
    setSelectedBucket(null);
    setKeys([]);
    setBucketStatus(null);
    setViewingKey(null);
    setBucketSearch('');
    setKeySearch('');
    setOffset(0);
  }, [activeConnection]);

  useEffect(() => {
    setOffset(0);
  }, [keySearch]);

  useEffect(() => {
    if (selectedBucket) {
      const timer = setTimeout(() => {
        loadKeys(selectedBucket, keySearch, offset);
      }, offset === 0 ? 300 : 0);
      loadBucketStatus(selectedBucket);
      return () => clearTimeout(timer);
    } else {
      setKeys([]);
      setHasMore(false);
      setOffset(0);
      setBucketStatus(null);
    }
  }, [selectedBucket, keySearch, offset]);

  const handleSelectBucket = (bucket: string) => {
    setSelectedBucket(bucket);
    setKeySearch('');
    setOffset(0);
    setViewingKey(null);
    setKeys([]);
  };

  const loadBuckets = async () => {
    if (!activeConnection) return;
    setLoadingBuckets(true);
    try {
      const data = await apiClient.listKV(activeConnection.id);
      setBuckets(data || []);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || String(err), 'error');
    } finally {
      setLoadingBuckets(false);
    }
  };

  const loadKeys = async (bucket: string, search = '', currentOffset = 0) => {
    if (!activeConnection) return;
    setLoadingKeys(true);
    try {
      const data = await apiClient.listKVKeys(activeConnection.id, bucket, search, currentOffset, PAGE_SIZE);
      if (currentOffset === 0) {
        setKeys(data.keys || []);
      } else {
        setKeys(prev => [...prev, ...(data.keys || [])]);
      }
      setHasMore(data.hasMore);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || String(err), 'error');
    } finally {
      setLoadingKeys(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (hasMore && !loadingKeys && target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
      setOffset(prev => prev + PAGE_SIZE);
    }
  };

  const loadBucketStatus = async (bucket: string) => {
    if (!activeConnection) return;
    try {
      const data = await apiClient.getKVStatus(activeConnection.id, bucket);
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
      const data = await apiClient.getKVKey(activeConnection.id, bucket, key);
      setViewingKey(data);
      setEditValue(data.value);
      setIsEditing(false);
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleSaveValue = async () => {
    if (!activeConnection || !selectedBucket || !viewingKey) return;
    try {
      await apiClient.putKVKey(activeConnection.id, selectedBucket, viewingKey.key, editValue);
      setViewingKey({ ...viewingKey, value: editValue });
      setIsEditing(false);
      showToast(t('save_success') || 'Saved successfully', 'success');
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleCreateBucket = async (bucketData: any) => {
    if (!activeConnection) return;
    try {
      await apiClient.createKV(activeConnection.id, {
        bucket: bucketData.bucket,
        history: Number(bucketData.history),
        ttl: Number(bucketData.ttl) * 1e9, // Convert seconds to nanoseconds
        storage: bucketData.storage,
        replicas: Number(bucketData.replicas),
      });
      setShowAddBucket(false);
      loadBuckets();
      showToast(t('bucket_create_success') || 'Bucket created successfully', 'success');
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handlePutKey = async (key: string, value: string) => {
    if (!activeConnection || !selectedBucket) return;
    try {
      await apiClient.putKVKey(activeConnection.id, selectedBucket, key, value);
      setShowAddKey(false);
      loadKeys(selectedBucket);
      showToast(t('key_put_success') || 'Key updated successfully', 'success');
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const filteredBuckets = buckets.filter(b => b.toLowerCase().includes(bucketSearch.toLowerCase()));

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('kv')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => setShowAddBucket(true)}>
            <Plus size={18} /> {t('new_bucket')}
          </button>
        </div>
      </div>

      <AddBucketModal
        isOpen={showAddBucket}
        onClose={() => setShowAddBucket(false)}
        onCreate={handleCreateBucket}
        t={t}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem', flex: 1, overflow: 'hidden' }}>
        <div className="card scroll-area animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>{t('buckets')}</h3>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.25rem 0.5rem' }} 
              onClick={loadBuckets} 
              disabled={loadingBuckets} 
              title={t('refresh')}
            >
              <RefreshCcw size={14} className={loadingBuckets ? 'animate-spin' : ''} />
            </button>
          </div>
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
                  {!isEditing && (
                    <div className="btn-group">
                      <button className={`btn ${formatMode === 'raw' ? 'active' : ''}`} onClick={() => setFormatMode('raw')}>{t('raw')}</button>
                      <button className={`btn ${formatMode === 'json' ? 'active' : ''}`} onClick={() => setFormatMode('json')}>{t('json')}</button>
                      <button className={`btn ${formatMode === 'yaml' ? 'active' : ''}`} onClick={() => setFormatMode('yaml')}>{t('yaml')}</button>
                    </div>
                  )}
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>{t('cancel')}</button>
                      <button className="btn btn-primary" onClick={handleSaveValue}>{t('save')}</button>
                    </div>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>{t('edit')}</button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setViewingKey(null)}><X size={18} /></button>
                </div>
              </div>
              {isEditing ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <CodeMirror 
                    value={editValue} 
                    height="300px"
                    theme={cmTheme}
                    extensions={extensions}
                    onChange={value => setEditValue(value)}
                  />
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <CodeMirror 
                    value={formatData(viewingKey.value, formatMode)} 
                    height="300px"
                    theme={cmTheme}
                    extensions={extensions}
                    readOnly={true}
                    editable={false}
                  />
                </div>
              )}
            </div>
          )}

          <div className="card animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedBucket ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
                  <h3 style={{ margin: 0 }}>{t('keys')} in {selectedBucket}</h3>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-secondary" onClick={() => { setOffset(0); loadKeys(selectedBucket, keySearch, 0); loadBucketStatus(selectedBucket); }} disabled={loadingKeys} title={t('refresh')}>
                      <RefreshCcw size={18} className={loadingKeys ? 'animate-spin' : ''} />
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddKey(true)}>
                      <Plus size={18} /> {t('put_key')}
                    </button>
                  </div>
                </div>

                <PutKeyModal
                  isOpen={showAddKey}
                  onClose={() => setShowAddKey(false)}
                  onSubmit={handlePutKey}
                  t={t}
                  cmTheme={cmTheme}
                />

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

                <div className="scroll-area" style={{ flex: 1 }} onScroll={handleScroll}>
                  {loadingKeys && offset === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '50px', width: '100%' }} />)}
                    </div>
                  ) : keys.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                      <Key size={40} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                      <p>{t('no_keys')}</p>
                    </div>
                  ) : (
                    <>
                      {keys.map(k => (
                        <div key={k} className="animate-fade-in" style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '500' }}>{k}</span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem' }} onClick={() => handleViewKey(selectedBucket, k)}>
                              <Eye size={16} />
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '0.35rem', color: 'var(--error-color)' }} onClick={() => {
                                if (confirm(`Delete key ${k}?`)) {
                                  apiClient.deleteKVKey(activeConnection.id, selectedBucket, k)
                                    .then(() => {
                                      setOffset(0);
                                      loadKeys(selectedBucket, keySearch, 0);
                                    });
                                }
                            }}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {loadingKeys && offset > 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center' }}>
                          <RefreshCcw size={20} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
                        </div>
                      )}
                    </>
                  )}
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
