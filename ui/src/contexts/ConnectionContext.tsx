import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ConnectionConfig } from '../api/client';
import { apiClient } from '../api/client';
import { useTranslation } from 'react-i18next';

interface ConnectionContextType {
  activeConnection: ConnectionConfig | null;
  setActiveConnection: (conn: ConnectionConfig | null) => void;
  connections: ConnectionConfig[];
  refreshConnections: (newActiveID?: string) => Promise<void>;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [activeConnection, setActiveConnection] = useState<ConnectionConfig | null>(null);
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

  const refreshConnections = async (newActiveID?: string) => {
    try {
      const data = await apiClient.listConnections();
      setConnections(data);
      if (newActiveID) {
        const found = data.find(c => c.id === newActiveID);
        if (found) setActiveConnection(found);
      } else if (activeConnection && !data.find(c => c.id === activeConnection.id)) {
        setActiveConnection(data.length > 0 ? data[0] : null);
      } else if (!activeConnection && data.length > 0) {
        setActiveConnection(data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    refreshConnections();
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
