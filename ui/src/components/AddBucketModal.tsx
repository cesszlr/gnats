import React, { useState } from 'react';
import Modal from './Modal';

interface AddBucketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (bucketData: {
    bucket: string;
    history: number;
    ttl: number;
    storage: string;
    replicas: number;
  }) => void;
  t: (key: string) => string;
}

export const AddBucketModal: React.FC<AddBucketModalProps> = ({ isOpen, onClose, onCreate, t }) => {
  const [bucket, setBucket] = useState('');
  const [history, setHistory] = useState(1);
  const [ttl, setTtl] = useState(0);
  const [storage, setStorage] = useState('file');
  const [replicas, setReplicas] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ bucket, history, ttl, storage, replicas });
    // Reset state
    setBucket('');
    setHistory(1);
    setTtl(0);
    setStorage('file');
    setReplicas(1);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('new_bucket')} width="600px">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('bucket_name')}</label>
            <input className="input" value={bucket} onChange={(e) => setBucket(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('history')}</label>
            <input
              type="number"
              className="input"
              value={history}
              onChange={(e) => setHistory(parseInt(e.target.value) || 1)}
              min={1}
              max={64}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">{t('ttl')} ({t('optional')})</label>
            <input
              type="number"
              className="input"
              value={ttl}
              onChange={(e) => setTtl(parseInt(e.target.value) || 0)}
              min={0}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('storage')}</label>
            <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}>
              <option value="file">File</option>
              <option value="memory">Memory</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('replicas')}</label>
            <input
              type="number"
              className="input"
              value={replicas}
              onChange={(e) => setReplicas(parseInt(e.target.value) || 1)}
              min={1}
              max={5}
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
