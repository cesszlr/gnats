import React, { useState, useEffect } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Plus, Trash2, Eye, Eraser, X, List, Box, Search, BarChart2, RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Modal from '../components/Modal';

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
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [consumers, setConsumers] = useState<ConsumerInfo[]>([]);
  const [loadingConsumers, setLoadingConsumers] = useState(false);
  const [viewingConsumers, setViewingConsumers] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formatMode, setFormatMode] = useState<'raw' | 'json' | 'yaml'>('raw');

  useEffect(() => {
    loadStreams();
    setViewingStream(null);
    setViewingConsumers(null);
    setExpandedStream(null);
    setMessages([]);
    setConsumers([]);
  }, [activeConnection]);

  const loadStreams = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/streams`);
      const data = await res.json();
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
      const res = await fetch(`/api/connections/${activeConnection.id}/streams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStream.name,
          subjects: newStream.subjects.split(',').map(s => s.trim()),
          storage: newStream.storage,
          retention: newStream.retention,
          max_msgs: Number(newStream.max_msgs),
          max_bytes: Number(newStream.max_bytes),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowAdd(false);
      loadStreams();
    } catch (err) {
      alert(err);
    }
  };

  const handleDelete = async (name: string) => {
    if (!activeConnection || !confirm(`Delete stream ${name}?`)) return;
    try {
      await fetch(`/api/connections/${activeConnection.id}/streams/${name}`, { method: 'DELETE' });
      loadStreams();
    } catch (err) {
      alert(err);
    }
  };

  const handlePurge = async (name: string) => {
    if (!activeConnection || !confirm(`Purge all messages in stream ${name}?`)) return;
    try {
      await fetch(`/api/connections/${activeConnection.id}/streams/${name}/purge`, { method: 'POST' });
      loadStreams();
    } catch (err) {
      alert(err);
    }
  };

  const loadMessages = async (stream: string) => {
    if (!activeConnection) return;
    setViewingStream(stream);
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/connections/${activeConnection.id}/streams/${stream}/messages`);
      const data = await res.json();
      setMessages(data || []);
    } catch (err) {
      alert(err);
    } finally {
      setLoadingMsgs(false);
    }
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
      const res = await fetch(`/api/connections/${activeConnection.id}/streams/${stream}/consumers`);
      const data = await res.json();
      setConsumers(data || []);
    } catch (err) {
      alert(err);
    } finally {
      setLoadingConsumers(false);
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

      {streams.length > 0 && !viewingStream && (
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
        {viewingStream && (
          <div className="card animate-fade-in" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Messages: {viewingStream}</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button className="btn btn-secondary" onClick={() => loadMessages(viewingStream)} disabled={loadingMsgs} title={t('refresh')}>
                  <RefreshCcw size={18} className={loadingMsgs ? 'animate-spin' : ''} />
                </button>
                <div className="btn-group">
                  <button className={`btn ${formatMode === 'raw' ? 'active' : ''}`} onClick={() => setFormatMode('raw')}>{t('raw')}</button>
                  <button className={`btn ${formatMode === 'json' ? 'active' : ''}`} onClick={() => setFormatMode('json')}>{t('json')}</button>
                  <button className={`btn ${formatMode === 'yaml' ? 'active' : ''}`} onClick={() => setFormatMode('yaml')}>{t('yaml')}</button>
                </div>
                <button className="btn btn-secondary" onClick={() => setViewingStream(null)}><X size={18} /></button>
              </div>
            </div>
            <div style={{ maxHeight: '600px', overflowY: 'auto', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: 'var(--radius)' }}>
              {loadingMsgs ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '60px', width: '100%' }} />)}
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{t('no_messages')}</div>
              ) : messages.map((m, i) => (
                <div key={`${m.sequence}-${i}`} className="animate-fade-in" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ backgroundColor: 'var(--border-color)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>#{m.sequence}</span>
                      <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{m.subject}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{new Date(m.time).toLocaleString()}</span>
                  </div>
                  <pre className="code-block">{formatData(m.data, formatMode)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    <button className="btn btn-secondary" title={t('consumers')} onClick={() => loadConsumers(s.config.name)} style={{ backgroundColor: viewingConsumers === s.config.name ? 'var(--accent-color)' : '', color: viewingConsumers === s.config.name ? 'white' : '' }}><Box size={18} /></button>
                    <button className="btn btn-secondary" title={t('subjects')} onClick={() => setExpandedStream(expandedStream === s.config.name ? null : s.config.name)}><List size={18} /></button>
                    <button className="btn btn-secondary" title={t('view_messages')} onClick={() => loadMessages(s.config.name)}><Eye size={18} /></button>
                    <button className="btn btn-secondary" title={t('purge')} onClick={() => handlePurge(s.config.name)}><Eraser size={18} /></button>
                    <button className="btn btn-secondary" style={{ color: 'var(--error-color)' }} title={t('delete')} onClick={() => handleDelete(s.config.name)}><Trash2 size={18} /></button>
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
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => loadConsumers(s.config.name, true)} disabled={loadingConsumers} title={t('refresh')}>
                        <RefreshCcw size={14} className={loadingConsumers ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {loadingConsumers ? (
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: '80px', flex: 1 }} />)}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                        {consumers.length === 0 ? <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('no_consumers')}</p> : consumers.map(c => (
                          <div key={c.name} className="card" style={{ padding: '0.75rem', margin: 0, background: 'rgba(0,0,0,0.02)', borderStyle: 'dashed' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{c.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'grid', gap: '0.25rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('pending')}:</span> <span style={{ color: 'var(--text-primary)' }}>{c.num_pending}</span></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('ack_pending')}:</span> <span style={{ color: 'var(--text-primary)' }}>{c.num_ack_pending}</span></div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('redelivered')}:</span> <span style={{ color: 'var(--text-primary)' }}>{c.num_redelivered}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {expandedStream === s.config.name && (
                  <div className="animate-fade-in" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <h4 style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{t('subjects')}</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {s.config.subjects.map(sub => (
                        <span key={sub} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-color)', borderRadius: '4px', fontWeight: '500' }}>{sub}</span>
                      ))}
                    </div>
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
