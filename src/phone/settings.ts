/**
 * What the phone remembers between visits: everything but the password.
 *
 * Principle 5, as Tom amended it on 2026-10-03: the SIP URI, the WebSocket
 * and the devices are not secrets, and typing them after every reload is what
 * made the softphone painful to use. The password is never written here.
 *
 * Browser storage can be missing, full or refused (a private window, a
 * preview, a policy), so every read and write is allowed to fail and the
 * phone works the same without it, from blank fields.
 */
export interface PhoneSettings {
  socket?: string;
  uri?: string;
  /** `deviceId`s; absent for the browser's default. */
  microphone?: string;
  camera?: string;
  speaker?: string;
}

const KEY = 'athenasip.phone.v1';
const FIELDS: ReadonlyArray<keyof PhoneSettings> = ['socket', 'uri', 'microphone', 'camera', 'speaker'];

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): PhoneSettings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const settings: PhoneSettings = {};
    for (const field of FIELDS) {
      const value = (parsed as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) settings[field] = value;
    }
    return settings;
  } catch {
    return {};
  }
}

/** Writes only the known fields, so nothing passed in by mistake (a password) can reach storage. */
export function saveSettings(settings: PhoneSettings, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  const kept: PhoneSettings = {};
  for (const field of FIELDS) {
    const value = settings[field];
    if (value) kept[field] = value;
  }
  try {
    storage?.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Remembering is a convenience; the phone works without it.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
