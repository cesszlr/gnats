import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ConnectionConfig } from '../api/client';
import { apiClient } from '../api/client';
import { useTranslation } from 'react-i18next';

interface ConnectionContextType {
  activeConnection: ConnectionConfig | null;
  setActiveConnection: (conn: ConnectionConfig | null) => void;
  connections: ConnectionConfig[];
  refreshConnections: (newActiveID?: string, forceCheck?: boolean) => Promise<void>;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null);
  const activeConnectionRef = useRef<ConnectionConfig | null>(activeConnection);

  useEffect(() => {
    activeConnectionRef.current = activeConnection;
  }, [activeConnection]);

  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('gnats-theme') as any) || 'system');
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    const saved = localStorage.getItem('gnats-lang');
    if (saved === 'zh' || saved === 'en') return saved;
    return i18n.language.startsWith('zh') ? 'zh' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('gnats-theme', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('gnats-lang', lang);
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  useEffect(() => {
    if (activeConnection) {
      localStorage.setItem('gnats-active-connection-id', activeConnection.id);
    } else {
      localStorage.removeItem('gnats-active-connection-id');
    }
  }, [activeConnection]);

  const refreshConnections = useCallback(async (newActiveID?: string, forceCheck?: boolean) => {
    try {
      const currentActive = activeConnectionRef.current;
      const savedActiveID = localStorage.getItem('gnats-active-connection-id');
      const checkID = forceCheck ? (newActiveID || currentActive?.id || savedActiveID || undefined) : undefined;
      const data = await apiClient.listConnections(checkID);
      setConnections(data);
      
      // Update active connection status from the list if it exists
      if (currentActive) {
        const current = data.find(c => c.id === currentActive.id);
        if (current && JSON.stringify(current) !== JSON.stringify(currentActive)) {
          setActiveConnection(current);
        }
      }

      if (newActiveID) {
        const found = data.find(c => c.id === newActiveID);
        if (found) setActiveConnection(found);
      } else if (currentActive && !data.find(c => c.id === currentActive.id)) {
        setActiveConnection(data.length > 0 ? data[0] : null);
      } else if (!currentActive && data.length > 0) {
        const saved = savedActiveID ? data.find(c => c.id === savedActiveID) : null;
        if (saved) {
          setActiveConnection(saved);
        } else {
          const connected = data.find(c => c.status === 'CONNECTED' || (c as any).Status === 'CONNECTED');
          if (connected) {
            setActiveConnection(connected);
          } else {
            setActiveConnection(data[0]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    refreshConnections(undefined, true); // Force check at startup to reconcile connected status
  }, []);

  return (
    <ConnectionContext.Provider value={{ 
      activeConnection, setActiveConnection, connections, refreshConnections,
      theme, setTheme, lang, setLang
    }}>
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error('useConnection must be used within a ConnectionProvider');
  return context;
};
