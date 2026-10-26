import { describe, expect, it } from 'vitest';
import type { Trunk } from '../api/types';
import { describeRegistration, focusOf, formAttributes, splitList, trunkForm, trunkWrite } from './trunk';

const carrier: Trunk = {
  name: 'acme',
  uri: 'sip:sip.acme.example',
  password_set: true,
  register: { enabled: true, expires: 3600, contact_user: 'athena' },
  inbound_addresses: ['198.51.100.0/24', '203.0.113.7'],
  attributes: { prefixes: ['0'], dtmf: 'rfc4733', focus: { prefix: 'conf-', realms: ['a.example'], profile: 'default' } },
};

describe('focusOf', () => {
  it('reads a focus only when it has a prefix', () => {
    expect(focusOf({ focus: { prefix: 'conf-' } })).toEqual({ prefix: 'conf-', realms: undefined, profile: undefined });
    expect(focusOf({ focus: { prefix: '' } })).toBeUndefined();
    expect(focusOf({ focus: 'conf-' })).toBeUndefined();
    expect(focusOf(undefined)).toBeUndefined();
  });
});

describe('splitList', () => {
  it('takes lines and commas alike, and drops blanks', () => {
    expect(splitList(' 10.0.0.1 ,\n10.0.0.0/8\n\n, ')).toEqual(['10.0.0.1', '10.0.0.0/8']);
  });
});

describe('trunkForm', () => {
  it('takes focus and dtmf out of the JSON into their fields', () => {
    const form = trunkForm(carrier);
    expect(form).toMatchObject({
      focusEnabled: true, focusPrefix: 'conf-', focusRealms: 'a.example', focusProfile: 'default', dtmf: 'rfc4733',
      inbound: '198.51.100.0/24\n203.0.113.7', expires: '3600', password: '',
    });
    expect(JSON.parse(form.attributes)).toEqual({ prefixes: ['0'] });
  });

  it('leaves in the JSON a focus or dtmf the fields cannot hold', () => {
    const form = trunkForm({ ...carrier, attributes: { dtmf: 'loud', focus: { prefix: 'conf-', bridge: 'x' } } });
    expect(form.focusEnabled).toBe(false);
    expect(form.dtmf).toBe('');
    expect(JSON.parse(form.attributes)).toEqual({ dtmf: 'loud', focus: { prefix: 'conf-', bridge: 'x' } });
  });
});

describe('formAttributes', () => {
  it('gives back what it was given, whole', () => {
    expect(formAttributes(trunkForm(carrier))).toEqual({ attributes: carrier.attributes });
  });

  it('writes the focus and dtmf into the JSON, leaving out what is empty', () => {
    const form = { ...trunkForm(), focusEnabled: true, focusPrefix: ' 8 ', dtmf: 'info' as const, attributes: '{"codes":["*55"]}' };
    expect(formAttributes(form)).toEqual({ attributes: { codes: ['*55'], focus: { prefix: '8' }, dtmf: 'info' } });
  });

  it('refuses a key set in both places, and a focus with no prefix', () => {
    const both = { ...trunkForm(), dtmf: 'info' as const, attributes: '{"dtmf":"auto"}' };
    expect(formAttributes(both)).toHaveProperty('problem');
    expect(formAttributes({ ...trunkForm(), focusEnabled: true })).toHaveProperty('problem');
    expect(formAttributes({ ...trunkForm(), attributes: '[1]' })).toHaveProperty('problem');
  });
});

describe('trunkWrite', () => {
  it('sends the name only on creation and the password only when typed', () => {
    const change = trunkWrite(trunkForm(carrier), false);
    expect(change).toHaveProperty('write');
    if (!('write' in change)) return;
    expect(change.write.name).toBeUndefined();
    expect('password' in change.write).toBe(false);
    expect(change.write.register).toEqual({ enabled: true, expires: 3600, contact_user: 'athena' });

    const created = trunkWrite({ ...trunkForm(), name: 'b', uri: 'sips:b.example', password: 'pw' }, true);
    expect(created).toEqual({ write: expect.objectContaining({ name: 'b', password: 'pw', attributes: {} }) });
  });

  it('checks the name, the URIs and the registration length', () => {
    const form = { ...trunkForm(), name: 'ok', uri: 'sip:x' };
    expect(trunkWrite({ ...form, name: 'no spaces' }, true)).toHaveProperty('problem');
    expect(trunkWrite({ ...form, uri: 'http://x' }, true)).toHaveProperty('problem');
    expect(trunkWrite({ ...form, proxy: 'x.example' }, true)).toHaveProperty('problem');
    expect(trunkWrite({ ...form, expires: '59' }, true)).toHaveProperty('problem');
    expect(trunkWrite({ ...form, expires: '86400' }, true)).toHaveProperty('write');
  });
});

describe('describeRegistration', () => {
  const now = 1_800_000_000;
  it('says what the node reported', () => {
    const registered = describeRegistration({
      ...carrier,
      registration: { node: 'sip-0001', state: 'registered', detail: '200 OK', expires_at: now + 3000, at: new Date((now - 600) * 1000).toISOString() },
    }, now);
    expect(registered).toEqual({ tone: 'ok', label: 'Registered', detail: '200 OK, reported by sip-0001 10m ago, lapses in 50m' });
    expect(describeRegistration({ ...carrier, registration: { node: 'n', state: 'failed', detail: '403 Forbidden' } }, now))
      .toMatchObject({ tone: 'down', label: 'Failed' });
    expect(describeRegistration({ ...carrier, registration: { node: 'n', state: 'registering', expires_at: 0 } }, now))
      .toMatchObject({ tone: 'warn', label: 'Registering' });
    expect(describeRegistration({ ...carrier, registration: null }, now)).toMatchObject({ label: 'Not reported yet' });
    expect(describeRegistration({ ...carrier, register: { enabled: false } }, now)).toMatchObject({ label: 'Does not register' });
  });
});
