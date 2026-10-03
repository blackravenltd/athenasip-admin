import type { Role, SessionInfo } from '../api/types';

export interface SessionState {
  token?: string;
  /** Who the token is and what it may do, as `GET /session` last said. */
  info?: SessionInfo;
  /** Unix seconds, when the node said. */
  expiresAt?: number;
  /** Why the last session ended, when it did not end by the person logging out. */
  ended?: string;
}

/**
 * Who this console is acting as: a bearer token, and who the node says that
 * token is.
 *
 * Held in memory and nowhere else. A token in `localStorage` is a token in
 * every future session of that browser, readable by anything that runs on the
 * origin, so a reload means signing in again. That is the price, and it is
 * the right one for a console that can delete a realm.
 *
 * It lives outside React so that the API can read the token per request, end
 * the session on a 401 and refresh its roles on a 403, without a component in
 * between. It ends itself at the expiry the node gave, rather than waiting for
 * the next request to be refused.
 */
export class Session {
  private current: SessionState = {};
  private readonly listeners = new Set<(state: SessionState) => void>();
  private expiry?: ReturnType<typeof setTimeout>;

  constructor(private readonly clock: () => number = Date.now) {}

  get state(): SessionState {
    return this.current;
  }

  get token(): string | undefined {
    return this.current.token;
  }

  get roles(): readonly Role[] {
    return this.current.info?.roles ?? [];
  }

  has(role: Role): boolean {
    return this.roles.includes(role);
  }

  signIn(token: string, info: SessionInfo, expiresAt?: number): void {
    this.clearExpiry();
    if (expiresAt !== undefined) {
      const remaining = expiresAt * 1000 - this.clock();
      if (remaining <= 0) {
        this.set({ ended: 'Your session expired. Sign in again.' });
        return;
      }
      // setTimeout holds 32 bits of milliseconds; a longer session is ended by the node's 401 instead.
      if (remaining < 2 ** 31) this.expiry = setTimeout(() => this.signOut('Your session expired. Sign in again.'), remaining);
    }
    this.set({ token, info, expiresAt });
  }

  /** What the node now says this session may do. A role taken away mid-session arrives here. */
  update(info: SessionInfo): void {
    if (!this.current.token) return;
    this.set({ ...this.current, info });
  }

  /** `reason` is shown on the sign-in screen, so a session that ended on its own says why. */
  signOut(reason?: string): void {
    if (!this.current.token) return;
    this.clearExpiry();
    this.set({ ended: reason });
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private clearExpiry(): void {
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = undefined;
  }

  private set(state: SessionState): void {
    this.current = state;
    for (const listener of this.listeners) listener(state);
  }
}
