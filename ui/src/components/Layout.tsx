import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Database, HardDrive, Box, Activity, Link as LinkIcon, ChevronDown, Sun, Moon, Languages } from 'lucide-react';
import { useConnection } from '../contexts/ConnectionContext';
import { useTranslation } from 'react-i18next';

const Layout: React.FC = () => {
  const { activeConnection, setActiveConnection, connections, theme, setTheme, lang, setLang } = useConnection();
  const { t, i18n } = useTranslation();

  const handleLangChange = (newLang: 'zh' | 'en') => {
    setLang(newLang);
    i18n.changeLanguage(newLang);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Activity size={32} strokeWidth={3} />
          <span>GNATS</span>
        </div>
        
        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
          <label className="form-label">{t('active_connection')}</label>
          <div style={{ position: 'relative' }}>
            <select 
              className="input" 
              style={{ appearance: 'none', marginBottom: 0 }}
              value={activeConnection?.id || ''}
              onChange={(e) => {
                const conn = connections.find(c => c.id === e.target.value);
                setActiveConnection(conn || null);
              }}
            >
              <option value="">{t('select_connection')}</option>
              {connections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={16} style={{ position: 'absolute', right: '10px', top: '10px', pointerEvents: 'none' }} />
          </div>
        </div>

        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={18} />
            {t('dashboard')}
          </NavLink>
          <NavLink to="/connections" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LinkIcon size={18} />
            {t('connections')}
          </NavLink>
          <NavLink to="/core" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Box size={18} />
            {t('core')}
          </NavLink>
          <NavLink to="/jetstream" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={18} />
            {t('jetstream')}
          </NavLink>
          <NavLink to="/kv" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Database size={18} />
            {t('kv')}
          </NavLink>
          <NavLink to="/object-store" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <HardDrive size={18} />
            {t('object_store')}
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Box size={18} />
            {t('services')}
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="settings-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              {t('theme')}
            </div>
            <select className="mini-select" value={theme} onChange={e => setTheme(e.target.value as any)}>
              <option value="light">{t('light')}</option>
              <option value="dark">{t('dark')}</option>
              <option value="system">{t('system')}</option>
            </select>
          </div>
          <div className="settings-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <Languages size={16} />
              {t('language')}
            </div>
            <select className="mini-select" value={lang} onChange={e => handleLangChange(e.target.value as any)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
