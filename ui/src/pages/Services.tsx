import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useConnection } from '../contexts/ConnectionContext';
import { RefreshCcw, Info, Activity, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../api/client';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import Modal from '../components/Modal';

interface ServiceInfo {
  name: string;
  id: string;
  version: string;
  metadata?: Record<string, string>;
}

interface EndpointInfo {
  name: string;
  subject: string;
  metadata?: Record<string, string>;
}

const validatePayload = (value: string, format: 'raw' | 'json' | 'yaml'): string | null => {
  if (!value.trim()) return null;
  if (format === 'raw') return null;
  if (format === 'json') {
    try {
      JSON.parse(value);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid JSON';
    }
  }
  if (format === 'yaml') {
    if (/\t/.test(value)) {
      return 'Tab characters are not allowed for indentation in YAML. Please use spaces.';
    }
    try {
      const lines = value.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        if (trimmed.startsWith('-')) continue;
        if (trimmed.includes(':')) {
          const parts = trimmed.split(':');
          const key = parts[0].trim();
          if (!key) {
            return `Line ${i + 1}: Key cannot be empty before colon`;
          }
          if (/\s/.test(key) && !(/^['"].*['"]$/.test(key))) {
            return `Line ${i + 1}: Key '${key}' contains spaces and must be quoted`;
          }
        }
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid YAML';
    }
  }
  return null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toYaml = (val: any, indent = 0): string => {
  if (val === null) return 'null';
  if (typeof val !== 'object') {
    if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`;
    return String(val);
  }
  const spaces = '  '.repeat(indent);
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return val.map(item => {
      if (typeof item === 'object' && item !== null) {
        return `\n${spaces}- ${toYaml(item, indent + 1).trimStart()}`;
      }
      return `\n${spaces}- ${toYaml(item, indent)}`;
    }).join('');
  }
  return Object.entries(val).map(([k, v]) => {
    if (typeof v === 'object' && v !== null) {
      return `\n${spaces}${k}:${toYaml(v, indent + 1)}`;
    }
    return `\n${spaces}${k}: ${toYaml(v, indent)}`;
  }).join('');
};

interface EndpointItemProps {
  ep: EndpointInfo;
  connectionId: string;
}

const EndpointItem: React.FC<EndpointItemProps> = ({
  ep,
  connectionId
}) => {
  const { t } = useTranslation();
  const { theme } = useConnection();
  const [debugOpen, setDebugOpen] = useState(false);
  const [payload, setPayload] = useState('{}');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [timeoutVal, setTimeoutVal] = useState(5000);
  const [activeTab, setActiveTab] = useState<'payload' | 'headers'>('payload');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<{ data: string; latency_ms?: number; headers?: Record<string, string>; error?: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [payloadFormat, setPayloadFormat] = useState<'raw' | 'json' | 'yaml'>('json');
  const [validationError, setValidationError] = useState<string | null>(null);

  const cmTheme = useMemo(() => {
    if (theme === 'dark') return vscodeDark;
    if (theme === 'light') return vscodeLight;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? vscodeDark : vscodeLight;
  }, [theme]);

  const handleToggleDebug = () => {
    setDebugOpen(!debugOpen);
  };

  const handleSend = async () => {
    setSending(true);
    setResponse(null);
    const headerMap: Record<string, string> = {};
    headers.forEach(h => {
      if (h.key.trim()) {
        headerMap[h.key.trim()] = h.value;
      }
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await apiClient.request(connectionId, {
        subject: ep.subject,
        data: payload,
        headers: headerMap,
        timeout: timeoutVal
      }, controller.signal);

      setResponse({
        data: res.data,
        latency_ms: res.latency_ms,
        headers: res.headers
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setResponse({
        data: '',
        error: err.message || 'Request failed'
      });
    } finally {
      setSending(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setSending(false);
      setResponse({
        data: '',
        error: 'Request aborted'
      });
    }
  };

  const handlePayloadChange = (val: string) => {
    setPayload(val);
    setValidationError(validatePayload(val, payloadFormat));
  };

  const handleFormatChange = (format: 'raw' | 'json' | 'yaml') => {
    setPayloadFormat(format);
    setValidationError(validatePayload(payload, format));
  };

  const handleFormat = () => {
    if (!payload.trim()) return;
    if (payloadFormat === 'json') {
      try {
        const parsed = JSON.parse(payload);
        const formatted = JSON.stringify(parsed, null, 2);
        setPayload(formatted);
        setValidationError(null);
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    } else if (payloadFormat === 'yaml') {
      try {
        const parsed = JSON.parse(payload);
        const yamlStr = toYaml(parsed).trim();
        setPayload(yamlStr);
        setValidationError(null);
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Invalid JSON to format');
      }
    }
  };

  return (
    <div style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem', transition: 'all 0.2s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.9rem' }}>{ep.name}</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {t('subject')}: {ep.subject}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {ep.metadata && Object.keys(ep.metadata).length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Object.entries(ep.metadata).map(([k, v]) => (
                <span key={k} className="status-badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', backgroundColor: 'var(--bg-color)' }}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}
          <button
            className="btn btn-primary"
            style={{
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              height: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 500
            }}
            onClick={handleToggleDebug}
          >
            <Terminal size={14} />
            {t('debug')}
          </button>
        </div>
      </div>

      <Modal
        isOpen={debugOpen}
        onClose={() => setDebugOpen(false)}
        title={`${t('debug')} - ${ep.name}`}
        width="680px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Endpoint Info Header */}
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'var(--bg-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Subject:</span>
            <code style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {ep.subject}
            </code>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '1rem' }}>
            <button
              style={{
                padding: '0.5rem 0.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'payload' ? '2px solid var(--accent-color)' : '2px solid transparent',
                color: activeTab === 'payload' ? 'var(--accent-color)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'payload' ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
              onClick={() => setActiveTab('payload')}
            >
              {t('payload')}
            </button>
            <button
              style={{
                padding: '0.5rem 0.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'headers' ? '2px solid var(--accent-color)' : '2px solid transparent',
                color: activeTab === 'headers' ? 'var(--accent-color)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'headers' ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
              onClick={() => setActiveTab('headers')}
            >
              {t('headers')} {headers.filter(h => h.key.trim()).length > 0 && `(${headers.filter(h => h.key.trim()).length})`}
            </button>
          </div>

          {/* Tab Contents */}
          {activeTab === 'payload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {t('payload')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="btn-group" style={{ background: 'rgba(0,0,0,0.03)', padding: '0.1rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
                    <button 
                      type="button" 
                      className={`btn ${payloadFormat === 'raw' ? 'active' : ''}`}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none', height: 'auto' }}
                      onClick={() => handleFormatChange('raw')}
                    >
                      {t('raw_text')}
                    </button>
                    <button 
                      type="button" 
                      className={`btn ${payloadFormat === 'json' ? 'active' : ''}`}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none', height: 'auto' }}
                      onClick={() => handleFormatChange('json')}
                    >
                      JSON
                    </button>
                    <button 
                      type="button" 
                      className={`btn ${payloadFormat === 'yaml' ? 'active' : ''}`}
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: 'none', height: 'auto' }}
                      onClick={() => handleFormatChange('yaml')}
                    >
                      YAML
                    </button>
                  </div>
                  {payloadFormat !== 'raw' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 'auto', display: 'flex', alignItems: 'center' }}
                      onClick={handleFormat}
                    >
                      {t('format_payload')}
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                <CodeMirror
                  value={payload}
                  height="120px"
                  theme={cmTheme}
                  extensions={payloadFormat === 'json' ? [json()] : payloadFormat === 'yaml' ? [yaml()] : []}
                  onChange={handlePayloadChange}
                />
              </div>

              {payloadFormat !== 'raw' && payload.trim() && validationError && (
                <div style={{ 
                  marginTop: '0.25rem', 
                  fontSize: '0.75rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem', 
                  color: 'var(--error-color)' 
                }}>
                  <span>⚠️</span>
                  <span>
                    {t('invalid_' + payloadFormat, { error: validationError }) || `${payloadFormat.toUpperCase()} 语法不合法: ${validationError}`}
                  </span>
                </div>
              )}
              {payloadFormat !== 'raw' && payload.trim() && !validationError && (
                <div style={{ 
                  marginTop: '0.25rem', 
                  fontSize: '0.75rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem', 
                  color: 'var(--success-color)' 
                }}>
                  <span>✓</span>
                  <span>{t('valid_' + payloadFormat) || `${payloadFormat.toUpperCase()} 语法合法`}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'headers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {headers.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Key"
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.8rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-primary)'
                      }}
                      value={h.key}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[i].key = e.target.value;
                        setHeaders(newHeaders);
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      style={{
                        flex: 1,
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.8rem',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        backgroundColor: 'var(--card-bg)',
                        color: 'var(--text-primary)'
                      }}
                      value={h.value}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[i].value = e.target.value;
                        setHeaders(newHeaders);
                      }}
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => {
                        setHeaders(headers.filter((_, idx) => idx !== i));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-secondary"
                style={{ alignSelf: 'flex-start', padding: '0.25rem 0.6rem', fontSize: '0.75rem', height: 'auto' }}
                onClick={() => setHeaders([...headers, { key: '', value: '' }])}
              >
                + {t('add_header')}
              </button>
            </div>
          )}

          {/* Action Buttons & Config */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Timeout (ms):</span>
              <input
                type="number"
                style={{
                  width: '80px',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)'
                }}
                value={timeoutVal}
                onChange={(e) => setTimeoutVal(Number(e.target.value))}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.4rem 1.25rem', fontSize: '0.8rem', height: 'auto' }}
                onClick={() => setDebugOpen(false)}
              >
                {t('cancel')}
              </button>
              {sending ? (
                <button
                  className="btn"
                  style={{ backgroundColor: 'var(--error-color)', color: 'white', padding: '0.4rem 1rem', fontSize: '0.8rem', height: 'auto' }}
                  onClick={handleAbort}
                >
                  {t('abort')}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ padding: '0.4rem 1.25rem', fontSize: '0.8rem', height: 'auto' }}
                  onClick={handleSend}
                >
                  {t('send')}
                </button>
              )}
            </div>
          </div>

          {/* Response Panel */}
          {response && (
            <div style={{
              borderTop: '1px dashed var(--border-color)',
              paddingTop: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('response')}</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {response.latency_ms !== undefined && (
                    <span className="status-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-color)' }}>
                      {t('latency')}: {response.latency_ms.toFixed(2)} ms
                    </span>
                  )}
                  {response.error ? (
                    <span className="status-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error-color)' }}>
                      Error
                    </span>
                  ) : (
                    <span className="status-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success-color)' }}>
                      Success
                    </span>
                  )}
                </div>
              </div>

              {response.error && (
                <div style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  borderLeft: '3px solid var(--error-color)',
                  borderRadius: '4px',
                  color: 'var(--error-color)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}>
                  {response.error}
                </div>
              )}

              {response.data && (
                <pre style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  overflowX: 'auto',
                  maxHeight: '150px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(response.data), null, 2);
                    } catch (e) {
                      return response.data;
                    }
                  })()}
                </pre>
              )}

              {response.headers && Object.keys(response.headers).length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                    {t('response_headers')}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '0.25rem 0.75rem',
                    padding: '0.5rem',
                    backgroundColor: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    maxHeight: '100px',
                    overflowY: 'auto'
                  }}>
                    {Object.entries(response.headers).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{k}:</span>
                        <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{v}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

interface ServiceInfo {
  name: string;
  id: string;
  version: string;
  metadata?: Record<string, string>;
}

const Services: React.FC = () => {
  const { activeConnection } = useConnection();
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedService, setExpandedService] = useState<Record<string, 'info' | 'stats' | null>>({});
  const [serviceDetails, setServiceDetails] = useState<Record<string, { info?: any; stats?: any; loadingInfo?: boolean; loadingStats?: boolean }>>({});
  
  const loadServices = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const data = await apiClient.listServices(activeConnection.id);
      setServices(data || []);
      // Reset expanded states on refresh
      setExpandedService({});
      setServiceDetails({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceDetail = async (name: string, id: string, type: 'info' | 'stats') => {
    if (!activeConnection) return null;
    const subject = type === 'info' ? `$SRV.INFO.${name}.${id}` : `$SRV.STATS.${name}.${id}`;
    try {
      const res = await apiClient.request(activeConnection.id, {
        subject,
        data: "",
        timeout: 3000
      });
      if (res && res.data) {
        return JSON.parse(res.data);
      }
    } catch (err) {
      console.error(`Failed to fetch service ${type}:`, err);
    }
    return null;
  };

  const togglePanel = async (name: string, id: string, type: 'info' | 'stats') => {
    const key = `${name}-${id}`;
    const currentType = expandedService[key];

    if (currentType === type) {
      setExpandedService(prev => ({ ...prev, [key]: null }));
      return;
    }

    setExpandedService(prev => ({ ...prev, [key]: type }));

    // Set loading state
    setServiceDetails(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [`loading${type === 'info' ? 'Info' : 'Stats'}`]: true
      }
    }));

    const data = await fetchServiceDetail(name, id, type);

    setServiceDetails(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [type]: data,
        [`loading${type === 'info' ? 'Info' : 'Stats'}`]: false
      }
    }));
  };

  useEffect(() => {
    loadServices();
  }, [activeConnection]);

  const renderDetailPanel = (s: ServiceInfo, type: 'info' | 'stats') => {
    const key = `${s.name}-${s.id}`;
    const details = serviceDetails[key];
    if (!details) return null;

    if (type === 'info') {
      if (details.loadingInfo) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('loading')}
          </div>
        );
      }
      const infoData = details.info;
      if (!infoData) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', color: 'var(--error-color)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
            {t('service_load_failed')}
          </div>
        );
      }
      return (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {infoData.description && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <strong>{t('description')}:</strong> {infoData.description}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.50rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('endpoints')}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {infoData.endpoints && infoData.endpoints.map((ep: any, idx: number) => {
                return (
                  <EndpointItem
                    key={idx}
                    ep={ep}
                    connectionId={activeConnection?.id || ''}
                  />
                );
              })}
            </div>
          </div>
        </div>
      );
    } else {
      if (details.loadingStats) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {t('loading')}
          </div>
        );
      }
      const statsData = details.stats;
      if (!statsData) {
        return (
          <div style={{ marginTop: '1rem', padding: '1rem', color: 'var(--error-color)', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
            {t('service_load_failed')}
          </div>
        );
      }

      const formatNsToMs = (ns: number) => {
        if (!ns && ns !== 0) return '0.00 ms';
        return `${(ns / 1000000).toFixed(2)} ms`;
      };

      return (
        <div style={{ marginTop: '1.25rem', padding: '1.25rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {statsData.started && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <strong>{t('started')}:</strong> {new Date(statsData.started).toLocaleString()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.50rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('stats')}
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {statsData.endpoints && statsData.endpoints.map((ep: any, idx: number) => (
                <div key={idx} style={{ padding: '0.75rem', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{ep.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ep.subject}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', backgroundColor: 'var(--bg-color)', padding: '0.5rem', borderRadius: '4px' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('requests')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent-color)' }}>{ep.num_requests ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('errors')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: ep.num_errors > 0 ? 'var(--error-color)' : 'var(--success-color)' }}>{ep.num_errors ?? 0}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('avg_latency')}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatNsToMs(ep.average_processing_time)}</div>
                    </div>
                  </div>
                  {ep.last_error && (
                    <div style={{ padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderLeft: '3px solid var(--error-color)', fontSize: '0.75rem', color: 'var(--error-color)', wordBreak: 'break-all' }}>
                      <strong>{t('last_error')}:</strong> {ep.last_error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
  };

  if (!activeConnection) return <div>{t('select_connection')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{t('discovery')}</h1>
        <button className="btn btn-primary" onClick={loadServices} disabled={loading}>
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /> {t('refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridGap: '1rem' }}>
        {services.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <Activity size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
            <p>{t('no_messages')}</p>
          </div>
        )}
        {services.map(s => {
          const key = `${s.name}-${s.id}`;
          const currentType = expandedService[key];
          return (
            <div key={s.id} className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>{s.name}</h3>
                    <span className="status-badge" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                      {s.version}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                    {t('info')} ID: {s.id}
                  </div>
                  {s.metadata && Object.keys(s.metadata).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                      {Object.entries(s.metadata).map(([k, v]) => (
                        <span key={k} className="status-badge" style={{ fontSize: '0.7rem', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.15rem 0.4rem' }}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary custom-tooltip"
                    data-tooltip={t('stats')}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: currentType === 'stats' ? 'var(--accent-color)' : '',
                      color: currentType === 'stats' ? 'white' : ''
                    }}
                    onClick={() => togglePanel(s.name, s.id, 'stats')}
                  >
                    <Activity size={18} />
                  </button>
                  <button
                    className="btn btn-secondary custom-tooltip"
                    data-tooltip={t('info')}
                    style={{
                      padding: '0.5rem',
                      backgroundColor: currentType === 'info' ? 'var(--accent-color)' : '',
                      color: currentType === 'info' ? 'white' : ''
                    }}
                    onClick={() => togglePanel(s.name, s.id, 'info')}
                  >
                    <Info size={18} />
                  </button>
                </div>
              </div>
              {currentType && renderDetailPanel(s, currentType)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Services;
