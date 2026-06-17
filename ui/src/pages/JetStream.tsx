import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { apiClient } from '../api/client';
import { Plus, Trash2, Eye, Eraser, Box, Search, BarChart2, RefreshCcw, Play, Pause, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

interface StreamInfo {
  config: {
    name: string;
    subjects: string[];
    retention: string;
    max_msgs: number;
    max_bytes: number;
    storage: string;
  };
  state: {
    messages: number;
    bytes: number;
    first_ts: string;
    last_ts: string;
    consumer_count: number;
  };
  cluster?: {
    name: string;
    leader: string;
  };
}

interface ConsumerInfo {
  name: string;
  config: {
    durable_name?: string;
    deliver_subject?: string;
    ack_policy: string;
  };
  num_pending: number;
  num_ack_pending: number;
  num_redelivered: number;
}

interface StreamMessage {
  subject: string;
  data: string;
  sequence: number;
  time: string;
}

const JetStream: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const formatBytes = (bytes: number) => {
    if (!bytes && bytes !== 0) return '0 B';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newStream, setNewStream] = useState({ 
    name: '', 
    subjects: '', 
    storage: 'file', 
    retention: 'limits',
    max_msgs: -1,
    max_bytes: -1
  });
  const [viewingStream, setViewingStream] = useState<string | null>(null);
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [purgingStream, setPurgingStream] = useState<string | null>(null);
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([]);
  const [loadingConsumers, setLoadingConsumers] = useState(false);
  const [viewingConsumers, setViewingConsumers] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formatMode, setFormatMode] = useState<'raw' | 'json' | 'yaml'>('raw');

  // Consumer Lifecycle states
  const [showAddConsumer, setShowAddConsumer] = useState(false);
  const [addConsumerStream, setAddConsumerStream] = useState<string | null>(null);
  const [newConsumer, setNewConsumer] = useState({
    durable_name: '',
    description: '',
    deliver_policy: 'all',
    ack_policy: 'explicit',
    ack_wait: 30,
    max_deliver: 5,
    filter_subjects: ''
  });
  const [showConsumerDetails, setShowConsumerDetails] = useState(false);
  const [detailsStream, setDetailsStream] = useState('');
  const [detailsConsumerName, setDetailsConsumerName] = useState('');
  const [selectedConsumerInfo, setSelectedConsumerInfo] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [viewingStreamDetails, setViewingStreamDetails] = useState<any>(null);
  const [messagesPolling, setMessagesPolling] = useState(false);
  const [polledCount, setPolledCount] = useState(0);
  const sseRef = useRef<EventSource | null>(null);
  const messagesRef = useRef<StreamMessage[]>([]);
  const startSeqRef = useRef<number>(0);

  const updateMessages = (newMsgs: StreamMessage[] | ((prev: StreamMessage[]) => StreamMessage[])) => {
    setMessages(prev => {
      const next = typeof newMsgs === 'function' ? newMsgs(prev) : newMsgs;
      messagesRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    loadStreams();
    setViewingStream(null);
    setViewingConsumers(null);
    setMessages([]);
    messagesRef.current = [];
    startSeqRef.current = 0;
    setConsumers([]);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setMessagesPolling(false);
  }, [activeConnection]);

  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  const loadStreams = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const data = await apiClient.listStreams(activeConnection.id);
      setStreams(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    try {
      await apiClient.createStream(activeConnection.id, {
        name: newStream.name,
        subjects: newStream.subjects.split(',').map(s => s.trim()),
        storage: newStream.storage,
        retention: newStream.retention,
        max_msgs: Number(newStream.max_msgs),
        max_bytes: Number(newStream.max_bytes),
      });
      setShowAdd(false);
      loadStreams();
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleDelete = async (name: string) => {
    if (!activeConnection || !confirm(t('delete_stream_confirm', { name }))) return;
    try {
      await apiClient.deleteStream(activeConnection.id, name);
      loadStreams();
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handlePurge = (name: string) => {
    setPurgingStream(name);
  };

  const handlePurgeConfirm = async () => {
    if (!activeConnection || !purgingStream) return;
    const name = purgingStream;
    setPurgingStream(null);
    try {
      await apiClient.purgeStream(activeConnection.id, name);
      loadStreams();
      showToast(t('purge_success') || 'Purged successfully', 'success');
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const startMessagesPolling = (streamName: string) => {
    if (sseRef.current) return;
    setMessagesPolling(true);

    const currentMsgs = messagesRef.current;
    let sinceSeq = startSeqRef.current;
    if (currentMsgs.length > 0) {
      sinceSeq = Math.max(...currentMsgs.map(m => m.sequence));
    }

    const url = `/api/connections/${activeConnection!.id}/streams/${streamName}/messages/sse?since_seq=${sinceSeq}`;
    const sse = new EventSource(url);

    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg && msg.sequence) {
          updateMessages(prev => {
            const existingSeqs = new Set(prev.map(m => m.sequence));
            if (existingSeqs.has(msg.sequence)) return prev;
            setPolledCount(c => c + 1);
            const combined = [msg, ...prev];
            return combined.slice(0, 200);
          });
        }
      } catch (err) {
        console.error("Failed to parse SSE message", err);
      }
    };

    sse.onerror = (err) => {
      console.error("SSE connection error", err);
      stopMessagesPolling();
    };

    sseRef.current = sse;
  };

  const stopMessagesPolling = () => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setMessagesPolling(false);
  };

  const handleCloseMessages = () => {
    stopMessagesPolling();
    setViewingStream(null);
  };

  const loadMessages = async (stream: string) => {
    if (!activeConnection) return;
    setViewingStream(stream);
    setPolledCount(0);
    updateMessages([]);
    startSeqRef.current = 0;
    stopMessagesPolling();
  };

  const loadConsumers = async (stream: string, isRefresh = false) => {
    if (!activeConnection) return;
    if (!isRefresh && viewingConsumers === stream) {
      setViewingConsumers(null);
      return;
    }
    setViewingConsumers(stream);
    setLoadingConsumers(true);
    try {
      const data = await apiClient.listConsumers(activeConnection.id, stream);
      setConsumers(data || []);
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    } finally {
      setLoadingConsumers(false);
    }
  };

  const handleOpenAddConsumer = (stream: string) => {
    setAddConsumerStream(stream);
    setNewConsumer({
      durable_name: '',
      description: '',
      deliver_policy: 'all',
      ack_policy: 'explicit',
      ack_wait: 30,
      max_deliver: 5,
      filter_subjects: ''
    });
    setShowAddConsumer(true);
  };

  const handleCreateConsumer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection || !addConsumerStream) return;
    try {
      const subjects = newConsumer.filter_subjects
        ? newConsumer.filter_subjects.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

      await apiClient.createConsumer(activeConnection.id, addConsumerStream, {
        durable_name: newConsumer.durable_name,
        description: newConsumer.description || undefined,
        deliver_policy: newConsumer.deliver_policy,
        ack_policy: newConsumer.ack_policy,
        ack_wait: Number(newConsumer.ack_wait),
        max_deliver: Number(newConsumer.max_deliver),
        filter_subjects: subjects,
      });
      setShowAddConsumer(false);
      loadConsumers(addConsumerStream, true);
      loadStreams();
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleDeleteConsumer = async (stream: string, name: string) => {
    if (!activeConnection || !confirm(t('delete_consumer_confirm', { name }))) return;
    try {
      await apiClient.deleteConsumer(activeConnection.id, stream, name);
      loadConsumers(stream, true);
      loadStreams();
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
    }
  };

  const handleOpenConsumerDetails = async (stream: string, name: string) => {
    if (!activeConnection) return;
    setDetailsStream(stream);
    setDetailsConsumerName(name);
    setSelectedConsumerInfo(null);
    setLoadingDetails(true);
    setShowConsumerDetails(true);

    try {
      const details = await apiClient.getConsumer(activeConnection.id, stream, name);
      setSelectedConsumerInfo(details);
    } catch (err: any) {
      showToast(err.message || String(err), 'error');
      setShowConsumerDetails(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const filteredStreams = streams.filter(s => 
    s.config.name.toLowerCase().includes(search.toLowerCase()) || 
    s.config.subjects.some(sub => sub.toLowerCase().includes(search.toLowerCase()))
  );

  const chartData = streams.map(s => ({
    name: s.config.name,
    messages: s.state.messages
  })).sort((a, b) => b.messages - a.messages).slice(0, 10);

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexShrink: 0 }}>
        <h1>JetStream</h1>
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
          <button className="btn btn-secondary" onClick={loadStreams} disabled={loading} title={t('refresh')}>
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={18} /> {t('create_stream')}
          </button>
        </div>
      </div>

      <Modal 
        isOpen={showAdd} 
        onClose={() => setShowAdd(false)} 
        title={t('create_stream')}
        width="800px"
      >
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('stream_name')}</label>
              <input className="input" value={newStream.name} onChange={e => setNewStream({ ...newStream, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('subjects')}</label>
              <input className="input" value={newStream.subjects} onChange={e => setNewStream({ ...newStream, subjects: e.target.value })} placeholder="e.g. orders.*, shipping.>" required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('storage')}</label>
              <select className="input" value={newStream.storage} onChange={e => setNewStream({ ...newStream, storage: e.target.value })}>
                <option value="file">File</option>
                <option value="memory">Memory</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('retention')}</label>
              <select className="input" value={newStream.retention} onChange={e => setNewStream({ ...newStream, retention: e.target.value })}>
                <option value="limits">Limits</option>
                <option value="interest">Interest</option>
                <option value="workqueue">WorkQueue</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('max_msgs')}</label>
              <input type="number" className="input" value={newStream.max_msgs} onChange={e => setNewStream({ ...newStream, max_msgs: parseInt(e.target.value) })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('max_bytes')}</label>
              <input type="number" className="input" value={newStream.max_bytes} onChange={e => setNewStream({ ...newStream, max_bytes: parseInt(e.target.value) })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('create')}</button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={showAddConsumer} 
        onClose={() => setShowAddConsumer(false)} 
        title={`${t('create_consumer')}: ${addConsumerStream}`}
        width="800px"
      >
        <form onSubmit={handleCreateConsumer}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('durable_name')}</label>
              <input className="input" value={newConsumer.durable_name} onChange={e => setNewConsumer({ ...newConsumer, durable_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t('description')}</label>
              <input className="input" value={newConsumer.description} onChange={e => setNewConsumer({ ...newConsumer, description: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="form-group">
              <label className="form-label">{t('deliver_policy')}</label>
              <select className="input" value={newConsumer.deliver_policy} onChange={e => setNewConsumer({ ...newConsumer, deliver_policy: e.target.value })}>
                <option value="all">All</option>
                <option value="last">Last</option>
                <option value="new">New</option>
                <option value="last_per_subject">Last Per Subject</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('ack_policy')}</label>
              <select className="input" value={newConsumer.ack_policy} onChange={e => setNewConsumer({ ...newConsumer, ack_policy: e.target.value })}>
                <option value="explicit">Explicit</option>
                <option value="none">None</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div className="form-group">
              <label className="form-label">{t('ack_wait')}</label>
              <input type="number" className="input" value={newConsumer.ack_wait} onChange={e => setNewConsumer({ ...newConsumer, ack_wait: parseInt(e.target.value) || 0 })} required min="1" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('max_deliver')}</label>
              <input type="number" className="input" value={newConsumer.max_deliver} onChange={e => setNewConsumer({ ...newConsumer, max_deliver: parseInt(e.target.value) || 0 })} required min="1" />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label className="form-label">{t('filter_subjects')}</label>
            <input className="input" value={newConsumer.filter_subjects} onChange={e => setNewConsumer({ ...newConsumer, filter_subjects: e.target.value })} placeholder={t('filter_subjects_hint')} />
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddConsumer(false)}>{t('cancel')}</button>
            <button type="submit" className="btn btn-primary">{t('create')}</button>
          </div>
        </form>
      </Modal>

      <Modal 
        isOpen={showConsumerDetails} 
        onClose={() => setShowConsumerDetails(false)} 
        title={`${t('details')}: ${detailsStream}/${detailsConsumerName}`}
        width="620px"
      >
        {loadingDetails ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
            <div className="skeleton" style={{ height: '40px', width: '80%' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="skeleton" style={{ height: '150px' }} />
              <div className="skeleton" style={{ height: '150px' }} />
            </div>
          </div>
        ) : selectedConsumerInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {/* 消费者全名 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: 'rgba(0,0,0,0.01)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('durable_name')}</span>
              <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-primary)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                {selectedConsumerInfo.name}
              </span>
            </div>

            {/* 双栏网格排版 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* 左栏：配置参数 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', textTransform: 'uppercase' }}>
                  {t('configuration')}
                </h5>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('deliver_policy')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.config.deliver_policy}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('ack_policy')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.config.ack_policy}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('ack_wait')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{Math.round((selectedConsumerInfo.config.ack_wait || 0) / 1000000000)}s</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('max_deliver')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.config.max_deliver}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('started')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {selectedConsumerInfo.created ? new Date(selectedConsumerInfo.created).toLocaleString() : '-'}
                  </span>
                </div>
              </div>

              {/* 右栏：运行状态指标 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', textTransform: 'uppercase' }}>
                  {t('runtime_status')}
                </h5>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pending:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.num_pending}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Ack Pending:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.num_ack_pending}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('redelivered')}:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.num_redelivered}</span>
                </div>
                
                {/* 针对 Push 模式的投递 Subject */}
                {selectedConsumerInfo.config.deliver_subject && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('deliver_subject')}:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-all' }}>
                      {selectedConsumerInfo.config.deliver_subject}
                    </span>
                  </div>
                )}

                {/* 针对 Pull 模式的等待拉取请求数 */}
                {!selectedConsumerInfo.config.deliver_subject && selectedConsumerInfo.num_waiting !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('waiting_requests')}:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.num_waiting}</span>
                  </div>
                )}

                {/* 最大 Ack Pending 限制数 */}
                {selectedConsumerInfo.config.max_ack_pending !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('max_ack_pending')}:</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedConsumerInfo.config.max_ack_pending}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 描述信息 (如有) */}
            {selectedConsumerInfo.config.description && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('description')}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', minHeight: '32px' }}>
                  {selectedConsumerInfo.config.description}
                </span>
              </div>
            )}

            {/* 过滤主题 (如有) */}
            {selectedConsumerInfo.config.filter_subjects && selectedConsumerInfo.config.filter_subjects.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t('filter_subjects')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {selectedConsumerInfo.config.filter_subjects.map((sub: string) => (
                    <span key={sub} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)', borderRadius: '4px', fontWeight: 600 }}>
                      {sub}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 消费者元数据 (如有) */}
            {selectedConsumerInfo.config.metadata && Object.keys(selectedConsumerInfo.config.metadata).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Metadata</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                  {Object.entries(selectedConsumerInfo.config.metadata).map(([k, v]) => (
                    <span key={k} className="status-badge" style={{ fontSize: '0.7rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.15rem 0.4rem' }}>
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('no_details_data')}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowConsumerDetails(false)}>
            {t('close') || '关闭'}
          </button>
        </div>
      </Modal>

      <Modal 
        isOpen={!!viewingStream} 
        onClose={handleCloseMessages} 
        title={`${t('view_messages')}: ${viewingStream}`}
        width="900px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: 'rgba(0,0,0,0.01)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
            {/* Status indicator on the left */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className={messagesPolling ? 'pulse-green' : 'pulse-gray'} style={{ width: '8px', height: '8px' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {messagesPolling ? t('capturing_live') : t('capture_paused')}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '0.5rem', background: 'var(--border-color)', padding: '0.1rem 0.5rem', borderRadius: '20px' }}>
                {t('captured_count', { count: polledCount })}
              </span>
            </div>

            {/* Controls on the right */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {/* Play/Pause control */}
              {messagesPolling ? (
                <button 
                  className="btn btn-secondary custom-tooltip" 
                  style={{ color: 'var(--error-color)', borderColor: 'var(--error-color)' }}
                  onClick={stopMessagesPolling}
                  data-tooltip={t('stop_capture_tooltip')}
                >
                  <Pause size={16} /> {t('stop_capture')}
                </button>
              ) : (
                <button 
                  className="btn btn-primary custom-tooltip" 
                  onClick={() => startMessagesPolling(viewingStream!)}
                  data-tooltip={t('start_capture_tooltip')}
                >
                  <Play size={16} /> {t('start_capture')}
                </button>
              )}

              {/* Format selection */}
              <div className="btn-group">
                <button className={`btn ${formatMode === 'raw' ? 'active' : ''}`} onClick={() => setFormatMode('raw')}>{t('raw')}</button>
                <button className={`btn ${formatMode === 'json' ? 'active' : ''}`} onClick={() => setFormatMode('json')}>{t('json')}</button>
                <button className={`btn ${formatMode === 'yaml' ? 'active' : ''}`} onClick={() => setFormatMode('yaml')}>{t('yaml')}</button>
              </div>
            </div>
          </div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border-color)' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>{t('no_messages')}</div>
            ) : messages.map((m, i) => (
              <div key={`${m.sequence}-${i}`} className="animate-fade-in" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span style={{ backgroundColor: 'var(--border-color)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>#{m.sequence}</span>
                    <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{m.subject}</span>
                  </div>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{new Date(m.time).toLocaleString()}</span>
                </div>
                <pre className="code-block" style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{formatData(m.data, formatMode)}</pre>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={handleCloseMessages}>
              {t('close') || '关闭'}
            </button>
          </div>
        </div>
      </Modal>

      {viewingStreamDetails && (
        <Modal
          isOpen={true}
          onClose={() => setViewingStreamDetails(null)}
          title={`${t('details') || 'Details'}: ${viewingStreamDetails.config.name}`}
          width="620px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {/* Description */}
            {viewingStreamDetails.config.description && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-color)', borderLeft: '3px solid var(--accent-color)', borderRadius: '4px', fontSize: '0.875rem' }}>
                <strong>{t('description') || 'Description'}:</strong> {viewingStreamDetails.config.description}
              </div>
            )}

            {/* Metadata Section */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('metadata')}
              </div>
              {viewingStreamDetails.config.metadata && Object.keys(viewingStreamDetails.config.metadata).length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {Object.entries(viewingStreamDetails.config.metadata).map(([k, v]) => (
                    <span key={k} className="status-badge" style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.2rem 0.5rem' }}>
                      {k}: {String(v)}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>None</div>
              )}
            </div>

            {/* Configuration Details Grid */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('configuration')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('storage')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.storage === 'file' ? 'File' : 'Memory'}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('retention')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.retention}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('max_messages')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.max_msgs === -1 ? 'Unlimited' : viewingStreamDetails.config.max_msgs}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('max_bytes')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.max_bytes === -1 ? 'Unlimited' : formatBytes(viewingStreamDetails.config.max_bytes)}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('max_age')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.max_age === 0 ? 'Unlimited' : (viewingStreamDetails.config.max_age / 1000000000 / 3600).toFixed(1) + ' hrs'}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('replicas')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.config.num_replicas || 1}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)', gridColumn: 'span 2' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('subjects')}:</span>
                  <div style={{ marginTop: '0.25rem', fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'var(--bg-color)', padding: '0.5rem', borderRadius: '4px', wordBreak: 'break-all' }}>
                    {viewingStreamDetails.config.subjects.join(', ')}
                  </div>
                </div>
              </div>
            </div>

            {/* State Statistics */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('state_statistics')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('total_messages')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.state.messages.toLocaleString()}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('total_bytes')}:</span>
                  <strong style={{ float: 'right' }}>{formatBytes(viewingStreamDetails.state.bytes)}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('first_seq')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.state.first_seq}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('last_seq')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.state.last_seq}</strong>
                </div>
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('consumers')}:</span>
                  <strong style={{ float: 'right' }}>{viewingStreamDetails.state.consumer_count}</strong>
                </div>
                {viewingStreamDetails.cluster && (
                  <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('cluster_leader')}:</span>
                    <strong style={{ float: 'right' }}>{viewingStreamDetails.cluster.leader}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setViewingStreamDetails(null)}>
              {t('close') || '关闭'}
            </button>
          </div>
        </Modal>
      )}

      {purgingStream && (
        <Modal
          isOpen={true}
          onClose={() => setPurgingStream(null)}
          title={t('purge')}
          width="400px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {t('purge_stream_confirm', { name: purgingStream })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setPurgingStream(null)}>
                {t('cancel')}
              </button>
              <button className="btn btn-danger" onClick={handlePurgeConfirm} style={{ backgroundColor: 'var(--error-color)', color: 'white' }}>
                {t('purge')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {streams.length > 0 && (
        <div className="card animate-fade-in" style={{ marginBottom: '2rem', padding: '1.25rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 600 }}>
            <BarChart2 size={18} /> {t('messages')} (Top 10 Streams)
          </div>
          <div style={{ width: '100%', height: '120px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" hide />
                <Tooltip 
                  cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                  contentStyle={{ 
                    backgroundColor: 'var(--card-bg)', 
                    borderColor: 'var(--border-color)',
                    borderRadius: 'var(--radius)',
                    fontSize: '11px',
                    boxShadow: 'var(--shadow)'
                  }}
                />
                <Bar dataKey="messages" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--accent-color)' : 'var(--text-secondary)'} opacity={0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="scroll-area" style={{ flex: 1, paddingRight: '0.5rem' }}>

        {loading ? (
          <div style={{ display: 'grid', gridGap: '1rem' }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: 'var(--radius)' }} />)}
          </div>
        ) : filteredStreams.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Box size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
            <p>{t('no_streams')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridGap: '1rem' }}>
            {filteredStreams.map(s => (
              <div key={s.config.name} className="card animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <h3 style={{ margin: 0 }}>{s.config.name}</h3>
                      <span className="status-badge" style={{ backgroundColor: 'var(--accent-color)', color: 'white' }}>
                        {s.state.messages} {t('messages')}
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{s.config.subjects.join(', ')}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary custom-tooltip" data-tooltip={t('info')} onClick={() => setViewingStreamDetails(s)}><Info size={18} /></button>
                    <button className="btn btn-secondary custom-tooltip" data-tooltip={t('consumers')} onClick={() => loadConsumers(s.config.name)} style={{ backgroundColor: viewingConsumers === s.config.name ? 'var(--accent-color)' : '', color: viewingConsumers === s.config.name ? 'white' : '' }}><Box size={18} /></button>
                    <button className="btn btn-secondary custom-tooltip" data-tooltip={t('view_messages')} onClick={() => loadMessages(s.config.name)}><Eye size={18} /></button>
                    <button className="btn btn-secondary custom-tooltip" data-tooltip={t('purge')} onClick={() => handlePurge(s.config.name)}><Eraser size={18} /></button>
                    <button className="btn btn-secondary custom-tooltip" style={{ color: 'var(--error-color)' }} data-tooltip={t('delete')} onClick={() => handleDelete(s.config.name)}><Trash2 size={18} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{t('storage')}: {s.config.storage === 'file' ? 'File' : 'Memory'}</span>
                  <span>{t('retention')}: {s.config.retention}</span>
                  <span>{t('consumers')}: {s.state.consumer_count}</span>
                  {s.cluster && <span>Cluster: {s.cluster.name} ({s.cluster.leader})</span>}
                </div>
                
                {viewingConsumers === s.config.name && (
                  <div className="animate-fade-in" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.875rem' }}>{t('consumers')}</h4>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary custom-tooltip" style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }} onClick={() => handleOpenAddConsumer(s.config.name)} data-tooltip={t('create_consumer')}>
                          <Plus size={14} /> {t('create_consumer')}
                        </button>
                        <button className="btn btn-secondary custom-tooltip" style={{ padding: '0.25rem 0.5rem' }} onClick={() => loadConsumers(s.config.name, true)} disabled={loadingConsumers} data-tooltip={t('refresh')}>
                          <RefreshCcw size={14} className={loadingConsumers ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    </div>
                    {loadingConsumers ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '45px', width: '100%' }} />)}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        {consumers.length === 0 ? (
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', padding: '1.5rem', margin: 0, textAlign: 'center' }}>{t('no_consumers')}</p>
                        ) : (
                          <>
                            {/* 表头 Headers */}
                            <div style={{ 
                              display: 'grid', 
                              gridTemplateColumns: 'minmax(200px, 2fr) 80px 1.2fr 1.2fr 1.2fr 130px', 
                              gap: '1rem',
                              padding: '0.75rem 1rem',
                              background: 'var(--bg-secondary)',
                              borderBottom: '1px solid var(--border-color)',
                              fontWeight: '600',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              alignItems: 'center'
                            }}>
                              <span>{t('name')}</span>
                              <span>{t('type') || 'Type'}</span>
                              <span>Pending</span>
                              <span>Ack Pending</span>
                              <span>{t('redelivered') || 'Redelivered'}</span>
                              <span style={{ textAlign: 'right' }}>{t('actions') || 'Actions'}</span>
                            </div>

                            {/* 消费者列表行 */}
                            {consumers.map(c => (
                              <div 
                                key={c.name} 
                                className="animate-fade-in" 
                                style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: 'minmax(200px, 2fr) 80px 1.2fr 1.2fr 1.2fr 130px', 
                                  gap: '1rem',
                                  padding: '0.75rem 1rem',
                                  borderBottom: '1px solid var(--border-color)',
                                  alignItems: 'center',
                                  fontSize: '0.875rem',
                                  transition: 'background-color 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.015)'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                {/* 名称 (超长中间省略，不带 hover 提示) */}
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.name.length > 24 ? `${c.name.slice(0, 10)}...${c.name.slice(-8)}` : c.name}
                                </span>

                                {/* 类型 (Push/Pull Badge) */}
                                <div>
                                  <span 
                                    className="status-badge" 
                                    style={{ 
                                      fontSize: '0.65rem', 
                                      padding: '0.1rem 0.3rem', 
                                      backgroundColor: c.config.deliver_subject ? 'var(--accent-color)' : 'var(--border-color)', 
                                      color: c.config.deliver_subject ? 'white' : 'var(--text-secondary)',
                                      opacity: 0.9,
                                      fontWeight: '600'
                                    }}
                                  >
                                    {c.config.deliver_subject ? 'Push' : 'Pull'}
                                  </span>
                                </div>

                                {/* Pending */}
                                <span style={{ color: 'var(--text-secondary)' }}>{c.num_pending}</span>

                                {/* Ack Pending */}
                                <span style={{ color: 'var(--text-secondary)' }}>{c.num_ack_pending}</span>

                                {/* 重发次数 */}
                                <span style={{ color: 'var(--text-secondary)' }}>{c.num_redelivered}</span>

                                {/* 动作按钮 */}
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                  <button 
                                    className="btn btn-secondary custom-tooltip" 
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} 
                                    onClick={() => handleOpenConsumerDetails(s.config.name, c.name)}
                                    data-tooltip={t('details')}
                                  >
                                    <Eye size={12} /> {t('details')}
                                  </button>
                                  <button 
                                    className="btn btn-secondary custom-tooltip" 
                                    style={{ padding: '0.25rem', color: 'var(--error-color)' }} 
                                    onClick={() => handleDeleteConsumer(s.config.name, c.name)}
                                    data-tooltip={t('delete')}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JetStream;
