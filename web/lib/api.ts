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

// ─── Auth ───
export const auth = {
  login: (email: string, name?: string) =>
    request<{ token: string; user: { id: string; email: string; name: string; role: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, name }) },
    ),
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
  scheduledFor?: string; // ISO datetime
  createdById: string;
};

export type Message = {
  id: string;
  destinationType: DestinationType;
  content: string;
  imageUrl: string | null;
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
  growthSeries: Array<{
    date: string;
    membersCount: number;
    channelViews: number | null;
  }>;
  topBurners: Array<{
    id: string;
    content: string;
    sentAt: string | null;
    leftsIn60min: number;
    leftsTotal: number;
  }>;
};

export const insights = {
  community: (communityId: string) =>
    request<CommunityInsights>(`/communities/${communityId}/insights`),
};
