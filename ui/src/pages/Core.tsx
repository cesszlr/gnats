import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Send, Play, Square, MessageSquare, Zap, Clock, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';

interface Message {
  subject: string;
  reply?: string;
  data: string;
  headers?: Record<string, string[]>;
  timestamp: string;
}

const Core: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'pubsub' | 'request'>('pubsub');

  // Pub/Sub States
  const [pubSubject, setPubSubject] = useState('');
  const [pubData, setPubData] = useState('');
  const [pubReply, setPubReply] = useState('');
  const [pubHeaders, setPubHeaders] = useState('');
  const [subSubject, setSubSubject] = useState('>');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Subscribe Advanced Options
  const [showSubAdvanced, setShowSubAdvanced] = useState(false);
  const [subQueue, setSubQueue] = useState('');
  const [subMaxMsgs, setSubMaxMsgs] = useState('');
  const [subPendingLimit, setSubPendingLimit] = useState('');

  // Request-Reply States
  const [reqSubject, setReqSubject] = useState('');
  const [reqData, setReqData] = useState('');
  const [reqHeaders, setReqHeaders] = useState('');
  const [reqTimeout, setReqTimeout] = useState('5000');
  const [reqLoading, setReqLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [responseFormat, setResponseFormat] = useState<'raw' | 'json'>('raw');
  const [showReqAdvanced, setShowReqAdvanced] = useState(false);
  const [customReplyTo, setCustomReplyTo] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    
    let headers = {};
    if (pubHeaders) {
      try {
        headers = JSON.parse(pubHeaders);
      } catch (err) {
        alert('Invalid headers JSON');
        return;
      }
    }

    try {
      await apiClient.publish(activeConnection.id, { 
        subject: pubSubject, 
        data: pubData,
        reply: pubReply,
        headers: headers
      });
    } catch (err) {
      alert(err);
    }
  };

  const toggleSubscribe = () => {
    if (isSubscribed) {
      wsRef.current?.close();
      setIsSubscribed(false);
    } else {
      if (!activeConnection) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      const params = new URLSearchParams({
        subject: subSubject
      });
      if (subQueue) params.append('queue', subQueue);
      if (subMaxMsgs) params.append('max_msgs', subMaxMsgs);
      if (subPendingLimit) params.append('pending_limit', subPendingLimit);

      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${activeConnection.id}/subscribe?${params.toString()}`);
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.info === 'auto_unsubscribed') {
          setIsSubscribed(false);
          wsRef.current?.close();
          return;
        }
        setMessages(prev => [{ ...msg, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
      };
      ws.onclose = () => setIsSubscribed(false);
      wsRef.current = ws;
      setIsSubscribed(true);
    }
  };

  const handleCancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConnection) return;
    setReqLoading(true);
    setResponse(null);

    let headers = {};
    if (reqHeaders) {
      try {
        headers = JSON.parse(reqHeaders);
      } catch (err) {
        alert('Invalid headers JSON');
        setReqLoading(false);
        return;
      }
    }

    abortControllerRef.current = new AbortController();

    try {
      const res = await apiClient.request(activeConnection.id, {
        subject: reqSubject,
        data: reqData,
        reply: customReplyTo || undefined,
        headers: headers,
        timeout: Number(reqTimeout)
      }, abortControllerRef.current.signal);
      setResponse({
        success: true,
        subject: res.subject,
        data: res.data,
        headers: res.headers,
        latency_ms: res.latency_ms
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setResponse({
          success: false,
          error: t('request_cancelled') || 'Request cancelled'
        });
        return;
      }
      setResponse({
        success: false,
        error: err.toString() || 'Request failed'
      });
    } finally {
      setReqLoading(false);
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      abortControllerRef.current?.abort();
    };
  }, []);

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  const renderFormattedResponse = (data: string) => {
    if (responseFormat === 'json') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch (err) {
        return data;
      }
    }
    return data;
  };

  return (
    <div>
      <h1 style={{ marginBottom: '1.25rem' }}>{t('core')}</h1>
      
      <div className="core-tabs">
        <button 
          className={`core-tab-item ${activeTab === 'pubsub' ? 'active' : ''}`}
          onClick={() => setActiveTab('pubsub')}
        >
          <Send size={16} /> Pub / Sub
        </button>
        <button 
          className={`core-tab-item ${activeTab === 'request' ? 'active' : ''}`}
          onClick={() => setActiveTab('request')}
        >
          <Zap size={16} /> {t('request_reply')}
        </button>
      </div>

      {activeTab === 'pubsub' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div className="card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Send size={24} style={{ color: 'var(--accent-color)' }} /> {t('publish')}
            </h2>
            <form onSubmit={handlePublish}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">{t('subject')}</label>
                  <input className="input" value={pubSubject} onChange={e => setPubSubject(e.target.value)} placeholder="e.g. orders.new" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('reply_to')} ({t('optional')})</label>
                  <input className="input" value={pubReply} onChange={e => setPubReply(e.target.value)} placeholder="e.g. reply.subject" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('headers')} (JSON, {t('optional')})</label>
                <input className="input" value={pubHeaders} onChange={e => setPubHeaders(e.target.value)} placeholder='e.g. {"Content-Type": "application/json"}' />
              </div>
              <div className="form-group">
                <label className="form-label">{t('payload')}</label>
                <textarea className="input" style={{ height: '120px', fontFamily: 'monospace' }} value={pubData} onChange={e => setPubData(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary">{t('publish')}</button>
            </form>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MessageSquare size={24} style={{ color: 'var(--accent-color)' }} /> {t('subscribe')}
            </h2>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <input className="input" style={{ marginBottom: 0 }} value={subSubject} onChange={e => setSubSubject(e.target.value)} disabled={isSubscribed} />
              <button className={`btn ${isSubscribed ? 'btn-danger' : 'btn-primary'}`} onClick={toggleSubscribe}>
                {isSubscribed ? <Square size={18} /> : <Play size={18} />}
              </button>
            </div>

            {/* Advanced Subscription Options */}
            <div style={{ marginBottom: '1.5rem' }}>
              <button 
                type="button" 
                className="advanced-trigger" 
                onClick={() => setShowSubAdvanced(!showSubAdvanced)}
                disabled={isSubscribed}
                style={{ opacity: isSubscribed ? 0.5 : 1 }}
              >
                {showSubAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {t('advanced_options')}
              </button>
              
              <div className={`advanced-panel ${showSubAdvanced ? 'open' : ''}`}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('queue_group')}</label>
                    <input 
                      className="input" 
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: 0 }} 
                      value={subQueue} 
                      onChange={e => setSubQueue(e.target.value)} 
                      placeholder={t('queue_group_hint')} 
                      disabled={isSubscribed} 
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('max_messages')}</label>
                    <input 
                      className="input" 
                      type="number"
                      min="1"
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: 0 }} 
                      value={subMaxMsgs} 
                      onChange={e => setSubMaxMsgs(e.target.value)} 
                      placeholder={t('max_messages_hint')} 
                      disabled={isSubscribed} 
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('pending_limit')}</label>
                  <input 
                    className="input" 
                    type="number"
                    min="1"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: 0 }} 
                    value={subPendingLimit} 
                    onChange={e => setSubPendingLimit(e.target.value)} 
                    placeholder={t('pending_limit_hint')} 
                    disabled={isSubscribed} 
                  />
                </div>
              </div>
            </div>

            <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)', padding: '1.25rem', overflowY: 'auto', maxHeight: '420px', border: '1px solid var(--border-color)' }}>
              {messages.map((msg, i) => (
                <div key={i} className="animate-fade-in" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{msg.subject}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{msg.timestamp}</span>
                  </div>
                  {msg.reply && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: '600' }}>Reply: </span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--accent-color)', background: 'rgba(0,0,0,0.03)', padding: '0.1rem 0.3rem', borderRadius: 'var(--radius-sm)' }}>{msg.reply}</span>
                    </div>
                  )}
                  {msg.headers && Object.keys(msg.headers).length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600' }}>Headers: </span>
                      {Object.entries(msg.headers).map(([k, v]) => (
                        <span key={k} style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.04)', padding: '0.1rem 0.3rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem' }}>
                          {k}: {Array.isArray(v) ? v.join(', ') : v}
                        </span>
                      ))}
                    </div>
                  )}
                  <pre className="code-block" style={{ padding: '0.75rem', fontSize: '0.8125rem', marginTop: '0.25rem' }}>{msg.data}</pre>
                </div>
              ))}
              {messages.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>{isSubscribed ? t('waiting_messages') : t('subscribe_hint')}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div className="card">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Zap size={24} style={{ color: 'var(--accent-color)' }} /> {t('request_reply')}
            </h2>
            <form onSubmit={handleRequest}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">{t('subject')}</label>
                  <input className="input" value={reqSubject} onChange={e => setReqSubject(e.target.value)} placeholder="e.g. service.get_info" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('timeout')} (ms)</label>
                  <input className="input" type="number" value={reqTimeout} onChange={e => setReqTimeout(e.target.value)} min="100" max="30000" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('headers')} (JSON, {t('optional')})</label>
                <input className="input" value={reqHeaders} onChange={e => setReqHeaders(e.target.value)} placeholder='e.g. {"Content-Type": "application/json"}' />
              </div>

              {/* Advanced Request Options */}
              <div style={{ marginBottom: '1.5rem' }}>
                <button 
                  type="button" 
                  className="advanced-trigger" 
                  onClick={() => setShowReqAdvanced(!showReqAdvanced)}
                  disabled={reqLoading}
                  style={{ opacity: reqLoading ? 0.5 : 1 }}
                >
                  {showReqAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {t('advanced_options')}
                </button>
                
                <div className={`advanced-panel ${showReqAdvanced ? 'open' : ''}`}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>{t('custom_reply_to')}</label>
                    <input 
                      className="input" 
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.8125rem', marginBottom: 0 }} 
                      value={customReplyTo} 
                      onChange={e => setCustomReplyTo(e.target.value)} 
                      placeholder={t('custom_reply_to_hint')} 
                      disabled={reqLoading} 
                    />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('payload')}</label>
                <textarea className="input" style={{ height: '120px', fontFamily: 'monospace' }} value={reqData} onChange={e => setReqData(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={reqLoading}>
                {reqLoading ? t('loading') : t('send_request')}
              </button>
            </form>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Terminal size={24} style={{ color: 'var(--accent-color)' }} /> {t('response')}
              </h2>
              {response?.success && (
                <div className="btn-group" style={{ background: 'rgba(0,0,0,0.03)', padding: '0.1rem', borderRadius: 'var(--radius-sm)' }}>
                  <button 
                    type="button" 
                    className={`btn ${responseFormat === 'raw' ? 'active' : ''}`}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}
                    onClick={() => setResponseFormat('raw')}
                  >
                    {t('raw')}
                  </button>
                  <button 
                    type="button" 
                    className={`btn ${responseFormat === 'json' ? 'active' : ''}`}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none' }}
                    onClick={() => setResponseFormat('json')}
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              {reqLoading && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <Clock size={32} className="animate-spin" style={{ color: 'var(--accent-color)', marginBottom: '1rem' }} />
                  <p style={{ marginBottom: '1.5rem' }}>{t('waiting_response')}</p>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleCancelRequest}
                  >
                    {t('cancel_request')}
                  </button>
                </div>
              )}

              {!reqLoading && !response && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <Zap size={32} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p>{t('no_response_yet')}</p>
                </div>
              )}

              {!reqLoading && response && !response.success && (
                <div style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid var(--error-color)', borderRadius: 'var(--radius)', padding: '1.5rem', color: 'var(--error-color)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0' }}>Request Failed</h4>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.875rem' }}>{response.error}</pre>
                </div>
              )}

              {!reqLoading && response && response.success && (
                <div className="animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="stat-item" style={{ padding: '0.5rem 0.75rem' }}>
                      <div className="stat-label">{t('subject')}</div>
                      <div className="stat-value" style={{ fontSize: '0.9rem', color: 'var(--accent-color)' }}>{response.subject}</div>
                    </div>
                    <div className="stat-item" style={{ padding: '0.5rem 0.75rem' }}>
                      <div className="stat-label">{t('latency')}</div>
                      <div className="stat-value" style={{ fontSize: '0.9rem' }}>{response.latency_ms.toFixed(2)} ms</div>
                    </div>
                  </div>

                  {response.headers && Object.keys(response.headers).length > 0 && (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', background: 'rgba(0,0,0,0.01)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('headers')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {Object.entries(response.headers).map(([k, v]: any) => (
                          <div key={k} style={{ display: 'flex', fontSize: '0.8rem' }}>
                            <span style={{ fontWeight: '600', color: 'var(--text-secondary)', minWidth: '120px' }}>{k}:</span>
                            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('payload')}</div>
                    <pre className="code-block" style={{ flex: 1, margin: 0, padding: '1rem', overflow: 'auto', maxHeight: '300px', fontSize: '0.8125rem' }}>
                      {renderFormattedResponse(response.data)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Core;
