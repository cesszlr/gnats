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
  monitoring_url?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Request failed');
  }
  return json.data;
}

export const apiClient = {
  // Connections
  async listConnections(): Promise<ConnectionConfig[]> {
    const res = await fetch(`${BASE_URL}/connections`);
    return handleResponse<ConnectionConfig[]>(res);
  },

  async connect(cfg: ConnectionConfig): Promise<ConnectionConfig> {
    const res = await fetch(`${BASE_URL}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return handleResponse<ConnectionConfig>(res);
  },

  async disconnect(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async forget(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/forget`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async updateConnection(id: string, cfg: ConnectionConfig): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return handleResponse<void>(res);
  },

  async getStats(id: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/stats`);
    return handleResponse<any>(res);
  },

  async publish(id: string, req: any): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<void>(res);
  },

  // JetStream
  async listStreams(id: string): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams`);
    return handleResponse<any[]>(res);
  },

  async createStream(id: string, cfg: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return handleResponse<any>(res);
  },

  async deleteStream(id: string, stream: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams/${stream}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async purgeStream(id: string, stream: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams/${stream}/purge`, {
      method: 'POST',
    });
    return handleResponse<void>(res);
  },

  async getStreamMessages(id: string, stream: string, limit = 50): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams/${stream}/messages?limit=${limit}`);
    return handleResponse<any[]>(res);
  },

  async listConsumers(id: string, stream: string): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/streams/${stream}/consumers`);
    return handleResponse<any[]>(res);
  },

  // KV
  async listKV(id: string): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv`);
    return handleResponse<string[]>(res);
  },

  async createKV(id: string, cfg: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return handleResponse<any>(res);
  },

  async deleteKV(id: string, bucket: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async getKVStatus(id: string, bucket: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}/status`);
    return handleResponse<any>(res);
  },

  async listKVKeys(id: string, bucket: string, search = '', offset = 0, limit = 100): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}/keys?search=${encodeURIComponent(search)}&offset=${offset}&limit=${limit}`);
    return handleResponse<any>(res);
  },

  async getKVKey(id: string, bucket: string, key: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}/keys/${key}`);
    return handleResponse<any>(res);
  },

  async putKVKey(id: string, bucket: string, key: string, value: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}/keys/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    return handleResponse<void>(res);
  },

  async deleteKVKey(id: string, bucket: string, key: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/kv/${bucket}/keys/${key}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  // Object Store
  async listObjectStores(id: string): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store`);
    return handleResponse<string[]>(res);
  },

  async createObjectStore(id: string, cfg: any): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return handleResponse<any>(res);
  },

  async deleteObjectStore(id: string, bucket: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store/${bucket}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  async getObjectStoreStatus(id: string, bucket: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store/${bucket}/status`);
    return handleResponse<any>(res);
  },

  async listObjects(id: string, bucket: string): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store/${bucket}/objects`);
    return handleResponse<any[]>(res);
  },

  async deleteObject(id: string, bucket: string, key: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/connections/${id}/object-store/${bucket}/objects/${key}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(res);
  },

  // Services
  async listServices(id: string): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/connections/${id}/services`);
    return handleResponse<any[]>(res);
  },
};
