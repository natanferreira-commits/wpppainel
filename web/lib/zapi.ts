// Cliente HTTP tipado para a Z-API.
//
// Auth:
//  - Path:   /instances/{instanceId}/token/{instanceToken}/...
//  - Header: Client-Token: {clientToken}  (obrigatório no plano Plus)
//
// Doc: https://developer.z-api.io
//
// Convenções importantes do projeto:
//  - Phone format pra grupos: o Z-API aceita o "phone" do grupo (ID interno
//    do WhatsApp tipo "120363xxxx@g.us"). Pra DMs aceita o número internacional
//    sem + (ex: 5511999999999).
//  - Pra mandar pra canal de anúncios de comunidade, o phone também é o ID
//    dele (formato similar ao de grupo, mas com sufixo ou flag isAnnouncement
//    no retorno de /chats).

const DEFAULT_BASE_URL = 'https://api.z-api.io';

export type ZapiConfig = {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  baseUrl?: string;
};

export class ZapiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public endpoint: string,
  ) {
    super(`Z-API ${status} em ${endpoint}: ${body}`);
    this.name = 'ZapiError';
  }
}

// ─── Tipos de retorno (best-effort baseado em doc Z-API) ──────────────────

export type ZapiStatusResponse = {
  connected: boolean;
  smartphoneConnected?: boolean;
  session?: string | boolean;
  needsConnection?: boolean;
  error?: string;
};

export type ZapiDevice = {
  phone: string; // ex: "552123425243"
  name?: string; // ex: "Dupla Aposta"
  imgUrl?: string | null;
  about?: string | null;
  isBusiness?: boolean;
  device?: { sessionName?: string; device_model?: string };
};

export type ZapiGroup = {
  phone: string; // ID do grupo (formato "120363xxx-group" ou "120363xxx@g.us")
  name: string;
  // Flag real retornada pelo /groups da Z-API:
  isGroupAnnouncement?: boolean; // canal de anúncios da comunidade
  // Comunidade WhatsApp à qual o grupo/canal pertence:
  communityId?: string;
  // Aliases vistos em outras versões:
  isAnnouncement?: boolean;
  announcement?: boolean;
  participantsCount?: number;
  // Outros campos úteis:
  pinned?: string;
  archived?: string;
  about?: string;
};

export type ZapiGroupMetadata = {
  phone: string;
  name: string;
  subject?: string;
  description?: string;
  owner?: string;
  creation?: number;
  invitationLink?: string;
  communityId?: string;
  isGroupAnnouncement?: boolean;
  participants?: Array<{ phone: string; isAdmin?: boolean; isSuperAdmin?: boolean }>;
};

export type ZapiSendTextResponse = {
  messageId?: string;
  zaapId?: string;
  id?: string; // alguns retornos chamam de "id"
};

export type ZapiSendImageResponse = ZapiSendTextResponse;

// ─── Client ───────────────────────────────────────────────────────────────

export class ZapiClient {
  private baseUrl: string;
  private instancePath: string;
  private clientToken: string;

  constructor(config: ZapiConfig) {
    if (!config.instanceId || !config.instanceToken || !config.clientToken) {
      throw new Error('ZapiClient: instanceId, instanceToken e clientToken são obrigatórios');
    }
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.instancePath = `/instances/${config.instanceId}/token/${config.instanceToken}`;
    this.clientToken = config.clientToken;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${this.instancePath}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': this.clientToken,
      },
      body: body ? JSON.stringify(body) : undefined,
      // Importante em Vercel Functions: não cache
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) {
      throw new ZapiError(res.status, text, path);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Algumas respostas vêm vazias ou não-JSON
      return text as unknown as T;
    }
  }

  // ── Status / conexão ──────────────────────────────────────────────────

  async getStatus(): Promise<ZapiStatusResponse> {
    return this.request<ZapiStatusResponse>('GET', '/status');
  }

  async getQrCode(): Promise<{ value: string }> {
    return this.request<{ value: string }>('GET', '/qr-code');
  }

  async getQrCodeImage(): Promise<{ value: string }> {
    // Retorna a imagem em base64 (data URI ou string crua dependendo da versão)
    return this.request<{ value: string }>('GET', '/qr-code/image');
  }

  async disconnect(): Promise<{ value: boolean }> {
    return this.request<{ value: boolean }>('GET', '/disconnect');
  }

  async getDevice(): Promise<ZapiDevice> {
    return this.request<ZapiDevice>('GET', '/device');
  }

  // ── Grupos / comunidades ──────────────────────────────────────────────

  async getGroups(pageSize = 100): Promise<ZapiGroup[]> {
    // Z-API pagina /groups. pageSize=100 cobre a maioria dos casos
    // (instâncias que não estão em centenas de grupos).
    return this.request<ZapiGroup[]>('GET', `/groups?page=1&pageSize=${pageSize}`);
  }

  async getChats(): Promise<Array<{ phone: string; name: string; isGroup: boolean }>> {
    return this.request('GET', '/chats');
  }

  async getGroupMetadata(groupId: string): Promise<ZapiGroupMetadata> {
    return this.request<ZapiGroupMetadata>(
      'GET',
      `/group-metadata/${encodeURIComponent(groupId)}`,
    );
  }

  // ── Envio ────────────────────────────────────────────────────────────

  async sendText(phone: string, message: string): Promise<ZapiSendTextResponse> {
    return this.request<ZapiSendTextResponse>('POST', '/send-text', {
      phone,
      message,
    });
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<ZapiSendImageResponse> {
    return this.request<ZapiSendImageResponse>('POST', '/send-image', {
      phone,
      image: imageUrl,
      caption,
    });
  }

  // ── Webhook config ────────────────────────────────────────────────────
  // Eventos importantes pro painel:
  //   - on-message-received   (pra debug/futuro)
  //   - on-message-status     (delivered/read — atualiza Message.status)
  //   - on-disconnect         (alerta admin)
  //   - on-presence-changed   (membro entrou/saiu — popula MemberEvent)
  //
  // Cada evento tem endpoint próprio na Z-API.

  async setWebhook(event: ZapiWebhookEvent, url: string, value = true): Promise<unknown> {
    return this.request('PUT', `/update-webhook-${event}`, { value: url, enabled: value });
  }
}

export type ZapiWebhookEvent =
  | 'received'
  | 'delivery'
  | 'disconnected'
  | 'connected'
  | 'message-status'
  | 'presence';

// ─── Factory: pega config do env ─────────────────────────────────────────

export function getZapiConfigFromEnv(): ZapiConfig | null {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const baseUrl = process.env.ZAPI_BASE_URL;

  if (!instanceId || !instanceToken || !clientToken) {
    return null;
  }
  return { instanceId, instanceToken, clientToken, baseUrl };
}

export function getZapiClient(): ZapiClient {
  const config = getZapiConfigFromEnv();
  if (!config) {
    throw new Error(
      'Z-API não configurada. Setar ZAPI_INSTANCE_ID, ZAPI_TOKEN e ZAPI_CLIENT_TOKEN nas env vars.',
    );
  }
  return new ZapiClient(config);
}
