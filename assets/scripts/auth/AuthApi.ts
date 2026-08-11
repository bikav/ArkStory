export interface AuthRequestPayload {
  account: string;
  password: string;
  device_id?: string;
  client_version?: string;
}

export interface AuthSessionPayload {
  player_id: number;
  access_token: string;
  refresh_token: string;
  expire_at: string;
  refresh_expire_at: string;
  is_new_player?: boolean;
  platform: string;
  account: string;
  display_name: string;
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_CLIENT_VERSION = '1.0.0';
const DEFAULT_PLATFORM = 'local_account';

type GlobalConfig = typeof globalThis & {
  ARKSTORY_API_BASE_URL?: string;
};

export class AuthApi {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const globalConfig = globalThis as GlobalConfig;
    this.baseUrl = (baseUrl ?? globalConfig.ARKSTORY_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  }

  public async login(payload: AuthRequestPayload): Promise<AuthSessionPayload> {
    return this.post<AuthSessionPayload>('/api/v1/auth/login', payload);
  }

  public async register(payload: AuthRequestPayload): Promise<AuthSessionPayload> {
    return this.post<AuthSessionPayload>('/api/v1/auth/register', payload);
  }

  private async post<T>(path: string, payload: AuthRequestPayload): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform': DEFAULT_PLATFORM,
        'X-Client-Version': payload.client_version ?? DEFAULT_CLIENT_VERSION,
      },
      body: JSON.stringify({
        account: payload.account,
        password: payload.password,
        device_id: payload.device_id ?? 'cocos_editor',
        client_version: payload.client_version ?? DEFAULT_CLIENT_VERSION,
        platform: DEFAULT_PLATFORM,
      }),
    });

    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch (error) {
      throw new Error(`鉴权服务响应不是合法 JSON：${String(error)}`);
    }

    if (!response.ok || !envelope || envelope.code !== 0) {
      throw new Error(envelope?.message ?? `请求失败（HTTP ${response.status}）`);
    }

    return envelope.data;
  }
}
