import React, { useState, useEffect, useRef } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { Send, Play, Square, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Message {
  subject: string;
  data: string;
  timestamp: string;
}

const Core: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [pubSubject, setPubSubject] = useState('');
  const [pubData, setPubData] = useState('');
  const [pubReply, setPubReply] = useState('');
  const [pubHeaders, setPubHeaders] = useState('');
  const [subSubject, setSubSubject] = useState('>');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

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
      const res = await fetch(`/api/connections/${activeConnection.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject: pubSubject, 
          data: pubData,
          reply: pubReply,
          headers: headers
        }),
      });
      if (!res.ok) throw new Error(await res.text());
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
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/${activeConnection.id}/subscribe?subject=${subSubject}`);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setMessages(prev => [{ ...msg, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 100));
      };
      ws.onclose = () => setIsSubscribed(false);
      wsRef.current = ws;
      setIsSubscribed(true);
    }
  };

  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div>
      <h1>{t('core')}</h1>
      
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
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <input className="input" style={{ marginBottom: 0 }} value={subSubject} onChange={e => setSubSubject(e.target.value)} disabled={isSubscribed} />
            <button className={`btn ${isSubscribed ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleSubscribe}>
              {isSubscribed ? <Square size={18} /> : <Play size={18} />}
            </button>
          </div>

          <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)', padding: '1.25rem', overflowY: 'auto', maxHeight: '500px', border: '1px solid var(--border-color)' }}>
            {messages.map((msg, i) => (
              <div key={i} className="animate-fade-in" style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: '600', color: 'var(--accent-color)' }}>{msg.subject}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{msg.timestamp}</span>
                </div>
                <pre className="code-block" style={{ padding: '0.75rem', fontSize: '0.8125rem' }}>{msg.data}</pre>
              </div>
            ))}
            {messages.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>{isSubscribed ? t('waiting_messages') : t('subscribe_hint')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Core;
