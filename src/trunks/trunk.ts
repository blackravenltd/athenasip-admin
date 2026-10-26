import type { Attributes, DtmfMode, FocusAttribute, Trunk, TrunkRegistration, TrunkWrite } from '../api/types';
import { DTMF_MODES, TRUNK_EXPIRES_MAX, TRUNK_EXPIRES_MIN } from '../api/types';
import { attributesText, parseAttributes } from '../components/AttributesField';
import { DTMF_TEXT as DTMF_WORDS } from '../realms/policy';

/** The node's rule for a trunk's name, from the OpenAPI document. */
export const TRUNK_NAME = /^[A-Za-z0-9._-]{1,64}$/;

/** How a trunk sends key presses, in words, as a realm's `dtmf` reads. */
export const DTMF_TEXT = Object.fromEntries(
  DTMF_MODES.map((mode) => [mode, DTMF_WORDS[mode].label]),
) as Record<DtmfMode, string>;

/**
 * The trunk's conference focus, when its `focus` attribute has a prefix to
 * match rooms by. Anything else under `focus` is not one: the scripts would
 * route no room to it.
 */
export function focusOf(attributes: Attributes | undefined): FocusAttribute | undefined {
  const focus = attributes?.focus;
  if (!isObject(focus) || typeof focus.prefix !== 'string' || !focus.prefix) return undefined;
  return {
    prefix: focus.prefix,
    realms: Array.isArray(focus.realms) ? focus.realms.filter((realm): realm is string => typeof realm === 'string') : undefined,
    profile: typeof focus.profile === 'string' ? focus.profile : undefined,
  };
}

/** The realms a focus serves, in words: every realm when it names none. */
export function describeFocusRealms(focus: FocusAttribute): string {
  return focus.realms && focus.realms.length > 0 ? focus.realms.join(', ') : 'every realm';
}

/** A list typed one per line or comma separated, as inbound addresses and realms are. */
export function splitList(text: string): string[] {
  return text.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A focus the form's fields can show exactly: a prefix, a list of realm
 * names and a profile name, and nothing else. One with more in it stays in
 * the JSON, so saving cannot lose what the fields have no room for.
 */
function editableFocus(value: unknown): boolean {
  if (!isObject(value) || typeof value.prefix !== 'string' || !value.prefix) return false;
  if (Object.keys(value).some((key) => !['prefix', 'realms', 'profile'].includes(key))) return false;
  if (value.realms !== undefined && !(Array.isArray(value.realms) && value.realms.every((realm) => typeof realm === 'string' && !realm.includes(',')))) return false;
  return value.profile === undefined || typeof value.profile === 'string';
}

/** The add and change dialogues' fields, as the operator types them. */
export interface TrunkForm {
  name: string;
  uri: string;
  proxy: string;
  username: string;
  /** Empty on a change keeps the password held. */
  password: string;
  registerEnabled: boolean;
  expires: string;
  contactUser: string;
  /** One per line or comma separated. */
  inbound: string;
  tlsCa: string;
  focusEnabled: boolean;
  focusPrefix: string;
  /** Comma separated; empty is every realm. */
  focusRealms: string;
  focusProfile: string;
  /** Empty leaves `dtmf` out of the attributes. */
  dtmf: DtmfMode | '';
  /** Every other attribute, as JSON. */
  attributes: string;
}

/**
 * The form for a trunk, or an empty one for a new trunk.
 *
 * `focus` and `dtmf` come out of the attributes into their own fields when
 * those fields can hold them; the JSON keeps the rest, and keeps them too
 * when they cannot (a focus with keys of its own, a `dtmf` no mode names).
 */
export function trunkForm(trunk?: Trunk): TrunkForm {
  const rest: Attributes = { ...(trunk?.attributes ?? {}) };
  const focus = editableFocus(rest.focus) ? rest.focus as FocusAttribute : undefined;
  if (focus) delete rest.focus;
  const dtmf = DTMF_MODES.includes(rest.dtmf as DtmfMode) ? rest.dtmf as DtmfMode : '';
  if (dtmf) delete rest.dtmf;
  return {
    name: trunk?.name ?? '',
    uri: trunk?.uri ?? '',
    proxy: trunk?.proxy ?? '',
    username: trunk?.username ?? '',
    password: '',
    registerEnabled: trunk?.register?.enabled ?? false,
    expires: trunk?.register?.expires !== undefined ? String(trunk.register.expires) : '',
    contactUser: trunk?.register?.contact_user ?? '',
    inbound: (trunk?.inbound_addresses ?? []).join('\n'),
    tlsCa: trunk?.tls_ca ?? '',
    focusEnabled: Boolean(focus),
    focusPrefix: focus?.prefix ?? '',
    focusRealms: (focus?.realms ?? []).join(', '),
    focusProfile: focus?.profile ?? '',
    dtmf,
    attributes: attributesText(rest),
  };
}

/**
 * The whole attributes object the form says: the JSON, with the focus and
 * dtmf fields written into it. A key set in both places is a problem rather
 * than a silent choice between them.
 */
export function formAttributes(form: TrunkForm): { attributes: Attributes } | { problem: string } {
  const parsed = parseAttributes(form.attributes);
  if ('problem' in parsed) return parsed;
  const attributes = { ...parsed.attributes };
  if (form.focusEnabled) {
    const prefix = form.focusPrefix.trim();
    if (!prefix) return { problem: 'A conference focus needs a prefix that its rooms start with.' };
    if ('focus' in attributes) return { problem: 'The attributes JSON has a focus of its own. Remove it there, or turn off the conference focus here.' };
    const focus: FocusAttribute = { prefix };
    const realms = splitList(form.focusRealms);
    if (realms.length > 0) focus.realms = realms;
    if (form.focusProfile.trim()) focus.profile = form.focusProfile.trim();
    attributes.focus = focus;
  }
  if (form.dtmf) {
    if ('dtmf' in attributes) return { problem: 'The attributes JSON has a dtmf of its own. Remove it there, or set key presses to Not set.' };
    attributes.dtmf = form.dtmf;
  }
  return { attributes };
}

/**
 * What the form sends, or the first reason it cannot be sent.
 *
 * A change sends every writable field but the name, so what the dialogue
 * shows is what the node holds after; the password only when one was typed,
 * since empty means keep it. Attributes always go whole, as the node replaces
 * them whole.
 */
export function trunkWrite(form: TrunkForm, creating: boolean): { write: TrunkWrite } | { problem: string } {
  const name = form.name.trim();
  if (creating && !TRUNK_NAME.test(name)) return { problem: 'The name is 1 to 64 letters, digits, dots, dashes or underscores.' };
  const uri = form.uri.trim();
  if (!/^sips?:/i.test(uri)) return { problem: 'The URI has to be a sip: or sips: URI.' };
  const proxy = form.proxy.trim();
  if (proxy && !/^sips?:/i.test(proxy)) return { problem: 'The outbound proxy has to be a sip: or sips: URI.' };
  const register: NonNullable<TrunkWrite['register']> = { enabled: form.registerEnabled, contact_user: form.contactUser.trim() };
  if (form.expires.trim()) {
    const expires = Number(form.expires.trim());
    if (!Number.isInteger(expires) || expires < TRUNK_EXPIRES_MIN || expires > TRUNK_EXPIRES_MAX) {
      return { problem: `The registration lasts ${TRUNK_EXPIRES_MIN} to ${TRUNK_EXPIRES_MAX} seconds.` };
    }
    register.expires = expires;
  }
  const attributes = formAttributes(form);
  if ('problem' in attributes) return attributes;
  const write: TrunkWrite = {
    uri,
    proxy,
    username: form.username.trim(),
    register,
    inbound_addresses: splitList(form.inbound),
    tls_ca: form.tlsCa.trim(),
    attributes: attributes.attributes,
  };
  if (creating) write.name = name;
  if (form.password) write.password = form.password;
  return { write };
}

/** A duration in words, coarse enough to read at a glance. */
function describeDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/** A trunk's registration, in words and a state colour. */
export function describeRegistration(trunk: Trunk, nowSeconds: number): {
  tone: 'ok' | 'warn' | 'down' | 'idle';
  label: string;
  detail?: string;
} {
  if (!trunk.register?.enabled) return { tone: 'idle', label: 'Does not register', detail: 'Calls go to it without registering first.' };
  const registration: TrunkRegistration | null | undefined = trunk.registration;
  if (!registration) return { tone: 'idle', label: 'Not reported yet', detail: 'No node has reported registering to it yet.' };
  const label = registration.state === 'registered' ? 'Registered' : registration.state === 'failed' ? 'Failed' : 'Registering';
  const tone = registration.state === 'registered' ? 'ok' : registration.state === 'failed' ? 'down' : 'warn';
  const parts: string[] = [];
  if (registration.detail) parts.push(registration.detail);
  const reported = registration.at ? Date.parse(registration.at) : NaN;
  const by = registration.node ? `by ${registration.node}` : '';
  if (!Number.isNaN(reported)) {
    parts.push(`reported ${by} ${describeDuration(Math.max(0, Math.round(nowSeconds - reported / 1000)))} ago`.replace(/\s+/g, ' '));
  } else if (by) {
    parts.push(`reported ${by}`);
  }
  if (registration.state === 'registered' && registration.expires_at) {
    const left = registration.expires_at - nowSeconds;
    parts.push(left > 0 ? `lapses in ${describeDuration(Math.round(left))}` : 'lapsed');
  }
  return { tone, label, detail: parts.length > 0 ? parts.join(', ') : undefined };
}
