import React, { useState, useEffect, useMemo } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { Plus, RefreshCcw, Search, Database, Key, Eye, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { AddBucketModal } from '../components/AddBucketModal';
import { PutKeyModal } from '../components/PutKeyModal';
import Modal from '../components/Modal';
import { KVDiffViewer } from '../components/KVDiffViewer';

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
  const [viewingKey, setViewingKey] = useState<{ key: string, value: string, rev?: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [bucketSearch, setBucketSearch] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [formatMode, setFormatMode] = useState<'raw' | 'json' | 'yaml'>('raw');

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'value' | 'history' | 'diff'>('value');
  const [expandedRev, setExpandedRev] = useState<number | null>(null);
  const [diffLeftRev, setDiffLeftRev] = useState<number | null>(null);
  const [diffRightRev, setDiffRightRev] = useState<number | null>(null);

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
    setHistory([]);
    setLoadingHistory(false);
    setActiveTab('value');
    setExpandedRev(null);
    setDiffLeftRev(null);
    setDiffRightRev(null);
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
      setActiveTab('value');
      setExpandedRev(null);

      setLoadingHistory(true);
      try {
        const histData = await apiClient.getKVKeyHistory(activeConnection.id, bucket, key);
        setHistory(histData || []);
        if (histData && histData.length > 0) {
          setDiffRightRev(data.rev || histData[0].rev);
          setDiffLeftRev(histData[1]?.rev || histData[0].rev);
        } else {
          setDiffLeftRev(null);
          setDiffRightRev(null);
        }
      } catch (histErr) {
        console.error("Failed to load key history:", histErr);
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleSaveValue = async () => {
    if (!activeConnection || !selectedBucket || !viewingKey) return;
    try {
      await apiClient.putKVKey(activeConnection.id, selectedBucket, viewingKey.key, editValue);
      setIsEditing(false);
      showToast(t('save_success') || 'Saved successfully', 'success');

      // Refresh data
      const data = await apiClient.getKVKey(activeConnection.id, selectedBucket, viewingKey.key);
      setViewingKey(data);
      setEditValue(data.value);

      setLoadingHistory(true);
      try {
        const histData = await apiClient.getKVKeyHistory(activeConnection.id, selectedBucket, viewingKey.key);
        setHistory(histData || []);
        if (histData && histData.length > 0) {
          setDiffRightRev(data.rev || histData[0].rev);
          setDiffLeftRev(histData[1]?.rev || histData[0].rev);
        }
      } catch (histErr) {
        console.error(histErr);
      } finally {
        setLoadingHistory(false);
      }
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
              className="btn btn-secondary custom-tooltip" 
              style={{ padding: '0.25rem 0.5rem' }} 
              onClick={loadBuckets} 
              disabled={loadingBuckets} 
              data-tooltip={t('refresh')}
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
          <div className="card animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedBucket ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
                  <h3 style={{ margin: 0 }}>{t('keys_in_bucket', { bucket: selectedBucket })}</h3>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      className="btn btn-secondary custom-tooltip" 
                      onClick={() => { setOffset(0); loadKeys(selectedBucket, keySearch, 0); loadBucketStatus(selectedBucket); }} 
                      disabled={loadingKeys} 
                      data-tooltip={t('refresh')}
                    >
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>{t('values')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.values}</span></span>
                      <span>{t('max_history_per_key')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.history}</span></span>
                      <span>{t('ttl')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.ttl || 'None'}</span></span>
                      <span>{t('storage')}: <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{bucketStatus.storage}</span></span>
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
                            <button 
                              className="btn btn-secondary custom-tooltip" 
                              style={{ padding: '0.35rem' }} 
                              onClick={() => handleViewKey(selectedBucket, k)}
                              data-tooltip={t('view') || 'View'}
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              className="btn btn-secondary custom-tooltip" 
                              style={{ padding: '0.35rem', color: 'var(--error-color)' }} 
                              onClick={() => {
                                if (confirm(t('delete_key_confirm', { key: k }))) {
                                  apiClient.deleteKVKey(activeConnection.id, selectedBucket, k)
                                    .then(() => {
                                      setOffset(0);
                                      loadKeys(selectedBucket, keySearch, 0);
                                    });
                                }
                              }}
                              data-tooltip={t('delete') || 'Delete'}
                            >
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

      <Modal
        isOpen={!!viewingKey}
        onClose={() => { setViewingKey(null); setHistory([]); }}
        title={`${t('key') || 'Key'}: ${viewingKey?.key || ''}`}
        width="800px"
        headerActions={
          viewingKey && !isEditing && (
            <div className="btn-group" style={{ flexShrink: 0 }}>
              <button className={`btn ${formatMode === 'raw' ? 'active' : ''}`} onClick={() => setFormatMode('raw')}>{t('raw')}</button>
              <button className={`btn ${formatMode === 'json' ? 'active' : ''}`} onClick={() => setFormatMode('json')}>{t('json')}</button>
              <button className={`btn ${formatMode === 'yaml' ? 'active' : ''}`} onClick={() => setFormatMode('yaml')}>{t('yaml')}</button>
            </div>
          )
        }
      >
        {viewingKey && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ position: 'relative', display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
              <button 
                className={`tab-btn`} 
                onClick={() => setActiveTab('value')}
                style={{
                  width: '100px',
                  height: '40px',
                  background: 'none',
                  border: 'none',
                  color: activeTab === 'value' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'value' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  transition: 'color 0.2s'
                }}
              >
                {t('value') || 'Value'}
              </button>
              <button 
                className={`tab-btn`} 
                onClick={() => setActiveTab('history')}
                style={{
                  width: '120px',
                  height: '40px',
                  background: 'none',
                  border: 'none',
                  color: activeTab === 'history' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'history' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  fontSize: '0.9rem',
                  transition: 'color 0.2s'
                }}
              >
                {t('history') || 'History'} {history.length > 0 && <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: 'var(--border-color)', color: 'var(--text-primary)' }}>{history.length}</span>}
              </button>
              <button 
                className={`tab-btn`} 
                onClick={() => setActiveTab('diff')}
                style={{
                  width: '100px',
                  height: '40px',
                  background: 'none',
                  border: 'none',
                  color: activeTab === 'diff' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'diff' ? '600' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  transition: 'color 0.2s'
                }}
              >
                {t('diff') || 'Diff'}
              </button>
              
              <div 
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: '2px',
                  backgroundColor: 'var(--accent-color)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  width: activeTab === 'value' ? '100px' : activeTab === 'history' ? '120px' : '100px',
                  transform: activeTab === 'value' ? 'translateX(0)' : activeTab === 'history' ? 'translateX(100px)' : 'translateX(220px)'
                }}
              />
            </div>

            {activeTab === 'value' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {isEditing ? (
                    <>
                      <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>{t('cancel')}</button>
                      <button className="btn btn-primary" onClick={handleSaveValue}>{t('save')}</button>
                    </>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>{t('edit')}</button>
                  )}
                </div>
              </div>
            ) : activeTab === 'history' ? (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {loadingHistory ? (
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <RefreshCcw size={20} className="animate-spin" style={{ color: 'var(--accent-color)', margin: '0 auto' }} />
                  </div>
                ) : history.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {t('no_history') || 'No history recorded'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {history.map((h: any) => {
                      const isCurrent = h.rev === viewingKey.rev;
                      const isPut = h.operation === 'KeyValuePut' || h.operation === 'PUT' || h.operation === 'KeyValuePutOp' || h.operation?.toLowerCase().includes('put');
                      const isExpanded = expandedRev === h.rev;

                      return (
                        <div 
                          key={h.rev} 
                          style={{ 
                            border: '1px solid var(--border-color)', 
                            borderRadius: 'var(--radius)', 
                            padding: '0.75rem 1rem',
                            backgroundColor: isCurrent ? 'var(--bg-secondary)' : 'transparent',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '600' }}>#{h.rev}</span>
                              {isCurrent && (
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  background: 'var(--accent-color)', 
                                  color: 'white', 
                                  padding: '0.1rem 0.35rem', 
                                  borderRadius: '3px' 
                                }}>
                                  {t('current') || 'Current'}
                                </span>
                              )}
                              <span style={{ 
                                fontSize: '0.7rem', 
                                background: isPut ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)', 
                                color: isPut ? '#4caf50' : '#f44336', 
                                padding: '0.1rem 0.35rem', 
                                borderRadius: '3px',
                                fontWeight: '500'
                              }}>
                                {h.operation}
                              </span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {new Date(h.created).toLocaleString()}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                onClick={() => setExpandedRev(isExpanded ? null : h.rev)}
                              >
                                {isExpanded ? (t('hide') || 'Hide') : (t('view') || 'View')}
                              </button>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                onClick={() => {
                                  setDiffLeftRev(h.rev);
                                  setDiffRightRev(viewingKey.rev || (history.length > 0 ? history[0].rev : null));
                                  setActiveTab('diff');
                                }}
                              >
                                {t('diff') || 'Diff'}
                              </button>
                              {isPut && !isCurrent && (
                                  <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    onClick={async () => {
                                      if (confirm(t('rollback_confirm', { rev: h.rev }) || `Are you sure you want to rollback to revision #${h.rev}?`)) {
                                        try {
                                          await apiClient.putKVKey(activeConnection.id, selectedBucket!, viewingKey.key, h.value);
                                          showToast(t('rollback_success') || 'Rolled back successfully', 'success');
                                          handleViewKey(selectedBucket!, viewingKey.key);
                                        } catch (err: any) {
                                          showToast(err.message || String(err), 'error');
                                        }
                                      }
                                    }}
                                  >
                                    {t('rollback') || 'Rollback'}
                                  </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div style={{ 
                              marginTop: '0.5rem', 
                              padding: '0.75rem', 
                              background: 'var(--bg-secondary)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: 'var(--radius)',
                              fontSize: '0.85rem',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              maxHeight: '150px',
                              overflowY: 'auto'
                            }}>
                              {formatData(h.value, formatMode) || <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>{t('empty_value') || 'No Value'}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'nowrap', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-block', lineHeight: '1' }}>{t('left_version') || 'Left Version'}:</span>
                  <select
                    className="input"
                    style={{ padding: '0.25rem 0.5rem', width: '200px', fontSize: '0.85rem', height: '32px', boxSizing: 'border-box', margin: 0, flexShrink: 0 }}
                    value={diffLeftRev || ''}
                    onChange={e => setDiffLeftRev(Number(e.target.value) || null)}
                  >
                    <option value="">-- {t('select_version') || 'Select Version'} --</option>
                    {history.map(h => {
                      const isPut = h.operation === 'KeyValuePut' || h.operation === 'PUT' || h.operation === 'KeyValuePutOp' || h.operation?.toLowerCase().includes('put');
                      const opText = isPut ? 'PUT' : (t('delete') || 'DELETE');
                      return (
                        <option key={h.rev} value={h.rev}>
                          #{h.rev} ({opText}) - {new Date(h.created).toLocaleTimeString()}
                        </option>
                      );
                    })}
                  </select>

                  <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', alignSelf: 'center', lineHeight: '1' }}>➔</span>

                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-block', lineHeight: '1' }}>{t('right_version') || 'Right Version'}:</span>
                  <select
                    className="input"
                    style={{ padding: '0.25rem 0.5rem', width: '200px', fontSize: '0.85rem', height: '32px', boxSizing: 'border-box', margin: 0, flexShrink: 0 }}
                    value={diffRightRev || ''}
                    onChange={e => setDiffRightRev(Number(e.target.value) || null)}
                  >
                    <option value="">-- {t('select_version') || 'Select Version'} --</option>
                    {history.map(h => {
                      const isPut = h.operation === 'KeyValuePut' || h.operation === 'PUT' || h.operation === 'KeyValuePutOp' || h.operation?.toLowerCase().includes('put');
                      const opText = isPut ? 'PUT' : (t('delete') || 'DELETE');
                      return (
                        <option key={h.rev} value={h.rev}>
                          #{h.rev} ({opText}) - {new Date(h.created).toLocaleTimeString()}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <KVDiffViewer 
                  oldValue={formatData(history.find(h => h.rev === diffLeftRev)?.value || '', formatMode)} 
                  newValue={formatData(history.find(h => h.rev === diffRightRev)?.value || '', formatMode)} 
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default KV;
