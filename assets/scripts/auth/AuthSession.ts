import { sys } from 'cc';
import type { AuthSessionPayload } from './AuthApi';

const SESSION_STORAGE_KEY = 'arkstory.auth.session';
const PENDING_LOGOUT_STORAGE_KEY = 'arkstory.auth.pending_logout';

export class AuthSession {
  public static save(session: AuthSessionPayload) {
    sys.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  public static load(): AuthSessionPayload | null {
    const raw = sys.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthSessionPayload;
    } catch (error) {
      console.warn('[AuthSession] Failed to parse stored auth session.', error);
      this.clear();
      return null;
    }
  }

  public static clear() {
    sys.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  public static queueLogout(accessToken: string) {
    if (accessToken) {
      sys.localStorage.setItem(PENDING_LOGOUT_STORAGE_KEY, accessToken);
    }
  }

  public static loadPendingLogout(): string | null {
    return sys.localStorage.getItem(PENDING_LOGOUT_STORAGE_KEY);
  }

  public static clearPendingLogout(accessToken: string) {
    if (this.loadPendingLogout() === accessToken) {
      sys.localStorage.removeItem(PENDING_LOGOUT_STORAGE_KEY);
    }
  }
}
