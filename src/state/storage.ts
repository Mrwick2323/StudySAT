/**
 * Defensive wrappers around localStorage. Storage can be unavailable (private
 * browsing, disabled cookies), full, or contain stale data from an older
 * version, so every access is guarded and failures are reported, not thrown.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// Each helper's `store` defaults to localStorage when omitted or undefined.

export function readJson<T>(key: string, store: KeyValueStore | null = defaultStore()): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored (e.g. quota exceeded). */
export function writeJson(key: string, value: unknown, store: KeyValueStore | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Ignore: nothing useful to do if storage is unavailable.
  }
}

export const STORAGE_KEYS = {
  config: 'studysat.config.v1',
  catalog: (subject: string) => `studysat.catalog.v1.${subject}`,
  testSession: 'studysat.test-session.v1',
  practiceSession: 'studysat.practice-session.v1',
} as const;
