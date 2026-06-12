import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import Modal from './Modal';

interface PutKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (key: string, value: string) => void;
  t: (key: string) => string;
  cmTheme: any;
}

export const PutKeyModal: React.FC<PutKeyModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  t,
  cmTheme,
}) => {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(key, value);
    // Reset state
    setKey('');
    setValue('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('put_key')} width="600px">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('key')}</label>
          <input
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. config.timeout"
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('value')} (JSON supported)</label>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <CodeMirror
              value={value}
              height="200px"
              theme={cmTheme}
              extensions={[json()]} // Default to JSON for new keys
              onChange={(val) => setValue(val)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('create')}</button>
        </div>
      </form>
    </Modal>
  );
};
