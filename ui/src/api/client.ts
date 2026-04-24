const BASE_URL = '/api';

export interface ConnectionConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  user?: string;
  password?: string;
  status?: string;
  insecure?: boolean;
  ca_file?: string;
  cert_file?: string;
  key_file?: string;
  ca_content?: string;
  cert_content?: string;
  key_content?: string;
  domain?: string;
}

export const apiClient = {
  async listConnections(): Promise<ConnectionConfig[]> {
    const res = await fetch(`${BASE_URL}/connections`);
    if (!res.ok) throw new Error('Failed to list connections');
    return res.json();
  },

  async connect(cfg: ConnectionConfig): Promise<ConnectionConfig> {
    const res = await fetch(`${BASE_URL}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(error || 'Failed to connect');
    }
    return res.json();
  },

  async disconnect(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to disconnect');
  },

  async forget(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/forget`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete connection');
  },
};
