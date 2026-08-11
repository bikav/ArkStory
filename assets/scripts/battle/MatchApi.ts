import { AuthSession } from '../auth/AuthSession';
import type { TerrainPieceType } from '../TerrainPieceDefinitions';

export interface MatchOpponentPayload {
  player_id: number;
  account: string;
  display_name: string;
}

export interface BoardTerrainCellPayload {
  q: number;
  r: number;
  stack: TerrainPieceType[];
}

export interface BoardAnimalCellPayload {
  q: number;
  r: number;
  card_id: string;
}

export interface BoardSnapshotPayload {
  version: number;
  owner_player_id: number;
  seat_no: number;
  terrain_cells: BoardTerrainCellPayload[];
  animal_cells: BoardAnimalCellPayload[];
}

export interface AnimalAnchorPayload {
  q: number;
  r: number;
}

export interface AnimalRuntimeStatePayload {
  card_id: string;
  recruited: boolean;
  placed_anchors: AnimalAnchorPayload[];
}

export interface MatchAnimalStatePayload {
  market_card_ids: string[];
  recruited_this_turn: boolean;
  runtime_states: AnimalRuntimeStatePayload[];
}

export interface MatchSummaryPayload {
  match_id: number;
  match_type: string;
  room_status: number;
  turn_no: number;
  step_status: string;
  state_version: number;
  turn_player_id: number | null;
  turn_deadline_at: string | null;
  terrain_bag_remaining: number;
  terrain_market_snapshot: TerrainMarketSnapshotPayload;
  seat_no: number;
  my_player_id: number;
  is_my_turn: boolean;
  my_board_snapshot: BoardSnapshotPayload;
  opponent_board_public_snapshot: BoardSnapshotPayload | null;
  my_animal_state: MatchAnimalStatePayload;
  opponent_animal_state: MatchAnimalStatePayload | null;
  opponent: MatchOpponentPayload | null;
}

export interface MatchStateEnvelopePayload {
  unchanged: boolean;
  match_id: number;
  state_version: number;
  match?: MatchSummaryPayload;
}

export interface TerrainMarketSnapshotPayload {
  slot_groups: TerrainPieceType[][];
  active_slot_index: number | null;
  remaining_piece_indices: number[];
}

export interface MatchmakingStatePayload {
  status: 'idle' | 'waiting' | 'matched';
  queue_id: number | null;
  match_id: number | null;
  enqueue_time?: string;
  matched_time?: string;
  elapsed_seconds: number;
  match: MatchSummaryPayload | null;
  deck_id?: number;
}

export interface LeaveMatchResultPayload {
  deleted: boolean;
  remaining_connected_players: number;
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

export class MatchApi {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const globalConfig = globalThis as GlobalConfig;
    this.baseUrl = (baseUrl ?? globalConfig.ARKSTORY_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  }

  public async enqueue(matchType = 'casual'): Promise<MatchmakingStatePayload> {
    return this.request<MatchmakingStatePayload>('/api/v1/matchmaking/enqueue', 'POST', {
      match_type: matchType,
      client_version: DEFAULT_CLIENT_VERSION,
      platform: DEFAULT_PLATFORM,
    });
  }

  public async getStatus(): Promise<MatchmakingStatePayload> {
    return this.request<MatchmakingStatePayload>('/api/v1/matchmaking/status', 'GET');
  }

  public async cancel(): Promise<MatchmakingStatePayload> {
    return this.request<MatchmakingStatePayload>('/api/v1/matchmaking/cancel', 'POST');
  }

  public async getMatchState(matchId: number, sinceVersion?: number): Promise<MatchStateEnvelopePayload> {
    const query = Number.isInteger(sinceVersion) && (sinceVersion ?? 0) > 0
      ? `?since_version=${sinceVersion}`
      : '';
    return this.request<MatchStateEnvelopePayload>(`/api/v1/matches/${matchId}/state${query}`, 'GET');
  }

  public async selectMatchSlot(matchId: number, slotIndex: number): Promise<MatchSummaryPayload> {
    return this.request<MatchSummaryPayload>(`/api/v1/matches/${matchId}/select-slot`, 'POST', {
      slot_index: slotIndex,
    });
  }

  public async endTurn(matchId: number): Promise<MatchSummaryPayload> {
    return this.request<MatchSummaryPayload>(`/api/v1/matches/${matchId}/end-turn`, 'POST');
  }

  public async placeTerrainPiece(
    matchId: number,
    previewIndex: number,
    q: number,
    r: number,
  ): Promise<MatchSummaryPayload> {
    return this.request<MatchSummaryPayload>(`/api/v1/matches/${matchId}/place-piece`, 'POST', {
      preview_index: previewIndex,
      q,
      r,
    });
  }

  public async recruitAnimal(matchId: number, slotIndex: number): Promise<MatchSummaryPayload> {
    return this.request<MatchSummaryPayload>(`/api/v1/matches/${matchId}/recruit-animal`, 'POST', {
      slot_index: slotIndex,
    });
  }

  public async placeAnimal(
    matchId: number,
    cardId: string,
    q: number,
    r: number,
  ): Promise<MatchSummaryPayload> {
    return this.request<MatchSummaryPayload>(`/api/v1/matches/${matchId}/place-animal`, 'POST', {
      card_id: cardId,
      q,
      r,
    });
  }

  public async leaveMatch(
    matchId: number,
    reason = 'leave_match',
    keepalive = false,
  ): Promise<LeaveMatchResultPayload> {
    return this.request<LeaveMatchResultPayload>(
      `/api/v1/matches/${matchId}/leave`,
      'POST',
      { reason },
      { keepalive },
    );
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    payload?: Record<string, unknown>,
    options?: { keepalive?: boolean },
  ): Promise<T> {
    const authSession = AuthSession.load();
    if (!authSession?.access_token) {
      throw new Error('登录态已失效，请重新登录。');
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authSession.access_token}`,
        'X-Platform': DEFAULT_PLATFORM,
        'X-Client-Version': DEFAULT_CLIENT_VERSION,
      },
      keepalive: options?.keepalive ?? false,
      body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
    });

    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch (error) {
      throw new Error(`匹配服务响应不是合法 JSON：${String(error)}`);
    }

    if (!response.ok || !envelope || envelope.code !== 0) {
      throw new Error(envelope?.message ?? `匹配请求失败（HTTP ${response.status}）`);
    }

    return envelope.data;
  }
}
