import { sys } from 'cc';
import type { MatchSummaryPayload } from './MatchApi';

const BATTLE_SESSION_STORAGE_KEY = 'arkstory.battle.session';

export class BattleSession {
  public static save(match: MatchSummaryPayload) {
    sys.localStorage.setItem(BATTLE_SESSION_STORAGE_KEY, JSON.stringify(match));
  }

  public static load(): MatchSummaryPayload | null {
    const raw = sys.localStorage.getItem(BATTLE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MatchSummaryPayload;
    } catch (error) {
      console.warn('[BattleSession] Failed to parse stored battle session.', error);
      this.clear();
      return null;
    }
  }

  public static clear() {
    sys.localStorage.removeItem(BATTLE_SESSION_STORAGE_KEY);
  }
}
