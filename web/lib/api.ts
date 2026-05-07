// Cliente HTTP simples. Usa rewrite do Next pra falar com a API
// (ver next.config.mjs). Token JWT vai em Authorization (quando houver).

const BASE = '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('painel-token');
}

export function getCurrentUser(): { id: string; name: string; email: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('painel-user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Força sem cache — caso contrário browser/Vercel CDN podem mostrar
    // dados antigos depois de mutações (ex: ver grupos que já foram apagados).
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.message ?? text;
    } catch {
      // não-JSON, mantém texto bruto
    }
    throw new Error(`${res.status}: ${Array.isArray(message) ? message.join(', ') : message}`);
  }

  return res.json() as Promise<T>;
}

// ─── Image Presets (banco de imagens reutilizáveis) ───
export type PresetCategory = 'AUMENTADAS' | 'NBA' | 'BINGOS' | 'SIMPLES';

export type ImagePreset = {
  id: string;
  category: PresetCategory;
  url: string;
  label: string | null;
  sortOrder: number;
  createdAt: string;
};

export const imagePresets = {
  list: (category?: PresetCategory) => {
    const qs = category ? `?category=${category}` : '';
    return request<{ categories: PresetCategory[]; presets: ImagePreset[] }>(
      `/image-presets${qs}`,
    );
  },
  create: (input: { category: PresetCategory; url: string; label?: string }) =>
    request<ImagePreset>('/image-presets', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/image-presets/${id}`, { method: 'DELETE' }),
};

// ─── Upload de imagem (Vercel Blob) ───
export const uploads = {
  image: async (file: File): Promise<{ url: string; size: number }> => {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      let message = text;
      try {
        message = JSON.parse(text).message ?? text;
      } catch {
        // mantém texto bruto
      }
      throw new Error(message);
    }
    return res.json();
  },
};

// ─── Auth ───
export const auth = {
  login: (username: string, password: string) =>
    request<{
      token: string;
      user: {
        id: string;
        username: string | null;
        email: string | null;
        name: string;
        role: string;
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
};

// ─── Instances ───
export type Instance = {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: string;
  lastConnectedAt: string | null;
  communities: Array<{ id: string; name: string; membersCount: number | null }>;
};

export type Group = {
  id: string;
  name: string;
  isAnnouncementChannel: boolean;
  membersCount: number | null;
  community: { id: string; name: string } | null;
};

export type SyncResult = {
  ok: boolean;
  instance: { status: string; session?: string };
  syncedGroups: number;
  groups: Array<{ id: string; name: string; isAnnouncement: boolean }>;
};

export const instances = {
  list: () => request<Instance[]>('/instances'),
  groups: (instanceId: string) => request<Group[]>(`/instances/${instanceId}/groups`),
  sync: (instanceId: string) =>
    request<SyncResult>(`/instances/${instanceId}/sync`, { method: 'POST' }),
};

// ─── Messages ───
export type DestinationType = 'ANNOUNCEMENT_CHANNEL' | 'GROUP' | 'MULTI_GROUP';

export type CreateMessageInput = {
  instanceId: string;
  destinationType: DestinationType;
  communityId?: string;
  groupId?: string;
  groupIds?: string[];
  content: string;
  imageUrl?: string;
  nickname?: string;
  mentionAll?: boolean;
  scheduledFor?: string; // ISO datetime
  createdById: string;
};

export type TipResult = 'GREEN' | 'RED' | 'VOID' | null;

export type Message = {
  id: string;
  destinationType: DestinationType;
  content: string;
  imageUrl: string | null;
  nickname: string | null;
  result: TipResult;
  mentionAll: boolean;
  scheduledFor: string;
  status: string;
  sentAt: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  instance: { id: string; name: string };
  community: { id: string; name: string } | null;
  createdBy: { id: string; name: string; email: string };
  targets: Array<{
    id: string;
    status: string;
    sentAt: string | null;
    group: { id: string; name: string; isAnnouncementChannel: boolean };
  }>;
};

export const messages = {
  create: (input: CreateMessageInput) =>
    request<Message>('/messages', { method: 'POST', body: JSON.stringify(input) }),
  list: (params: { status?: string; instanceId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.instanceId) q.set('instanceId', params.instanceId);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<Message[]>(`/messages${qs ? `?${qs}` : ''}`);
  },
  cancel: (id: string) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' }),
    }),
  update: (
    id: string,
    input: {
      content?: string;
      scheduledFor?: string;
      imageUrl?: string | null;
      mentionAll?: boolean;
      nickname?: string | null;
      result?: TipResult;
    },
  ) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

// ─── Insights ───
export type CommunityInsights = {
  community: { id: string; name: string };
  summary: {
    membersNow: number;
    growth7d: number;
    growth7dPct: number;
    churn7dPct: number;
    joins7d: number;
    lefts7d: number;
  };
  realtime: {
    hours: number;
    joins: number;
    lefts: number;
    net: number;
    churnPct: number;
  };
  growthSeries: Array<{
    date: string;
    membersCount: number;
    channelViews: number | null;
  }>;
  daily: Array<{
    date: string;
    joins: number;
    lefts: number;
    net: number;
    membersCount: number | null;
    churnPct: number;
  }>;
  comparison: {
    days: number;
    periodA: { label: string; joins: number; lefts: number; net: number };
    periodB: { label: string; joins: number; lefts: number; net: number };
    diff: {
      joins: number;
      lefts: number;
      net: number;
      joinsPct: number;
      leftsPct: number;
    };
  };
  topBurners: Array<{
    id: string;
    content: string;
    sentAt: string | null;
    leftsIn60min: number;
    leftsTotal: number;
  }>;
};

export const insights = {
  community: (communityId: string, params: { compareDays?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.compareDays) q.set('compareDays', String(params.compareDays));
    const qs = q.toString();
    return request<CommunityInsights>(
      `/communities/${communityId}/insights${qs ? `?${qs}` : ''}`,
    );
  },
};
