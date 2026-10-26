// @vitest-environment jsdom
import { EventEmitter } from 'node:events';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UA, UAConfiguration } from 'jssip/lib/UA';
import type { AdminApi } from '../api/AdminApi';
import { ApiError } from '../api/errors';
import { FakeAdminApi } from '../api/FakeAdminApi';
import type { CallRecord, ClientConfig, Registration, Role, Subscriber, SubscriberLine } from '../api/types';
import type { SipStack } from '../softphone/Softphone';
import PhoneHost from './PhoneHost';
import { loadSettings, saveSettings } from './settings';

class FakeAgent extends EventEmitter {
  sessions: FakeSession[] = [];
  calls: Array<{ target: string; options: { pcConfig?: RTCConfiguration; mediaConstraints?: MediaStreamConstraints } }> = [];
  constructor(readonly configuration: UAConfiguration) { super(); }
  flow = 1;
  stopped = 0;
  start() {}
  stop() { this.stopped += 1; }
  call(target: string, options: { pcConfig?: RTCConfiguration; mediaConstraints?: MediaStreamConstraints }) {
    this.calls.push({ target, options });
    const session = new FakeSession();
    this.sessions.push(session);
    this.emit('newRTCSession', { originator: 'local', session, request: {} });
  }
}

class FakeSession extends EventEmitter {
  log: string[] = [];
  remote_identity = { uri: { toString: () => 'sip:athenaphone@10.35.1.20' } };
  answer(options: { mediaConstraints?: MediaStreamConstraints }) { this.log.push(`answer ${JSON.stringify(options.mediaConstraints)}`); }
  terminate(options?: { status_code?: number }) { this.log.push(`terminate ${options?.status_code ?? ''}`.trim()); }
  mute() { this.log.push('mute'); }
  unmute() { this.log.push('unmute'); }
  hold() { this.log.push('hold'); return true; }
  unhold() { this.log.push('unhold'); return true; }
  sendDTMF(tone: string) { this.log.push(`dtmf ${tone}`); }
}

function stack(): SipStack & { agents: FakeAgent[] } {
  const agents: FakeAgent[] = [];
  return {
    agents,
    createUserAgent: (configuration, flow = 1) => {
      const agent = new FakeAgent(configuration);
      agent.flow = flow;
      agents.push(agent);
      return agent as unknown as UA;
    },
    createSocket: (url) => ({ url } as unknown as UAConfiguration['sockets']),
  };
}

const CONFIG: ClientConfig = {
  websocket_uri: 'wss://10.35.1.20:8089',
  transports: [{ transport: 'ws', address: '10.35.1.20', port: 8088, uri: 'sip:10.35.1.20:8088;transport=ws' }],
  ice_servers: [{ urls: 'stun:10.35.1.20:3478' }],
};

/** A node with no call history and nobody registered, whose client configuration any line's credentials open. */
function node(): AdminApi & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    subscriberConfig: async (line: SubscriberLine) => { asked.push(`${line.user}@${line.realm} ${line.password}`); return CONFIG; },
    listCallRecords: async () => [],
    listRegistrations: async () => [],
  } as unknown as AdminApi & { asked: string[] };
}

const STATUS: readonly Role[] = ['view-cluster-status'];

function show(sip = stack(), visible = true, api: AdminApi = node(), roles: readonly Role[] = STATUS) {
  const slot = document.createElement('div');
  document.body.appendChild(slot);
  const view = render(<MemoryRouter><PhoneHost api={api} roles={roles} visible={visible} indicator={slot} stack={sip} /></MemoryRouter>);
  return { sip, slot, view };
}

async function registered(sip = stack(), api: AdminApi = node(), roles: readonly Role[] = STATUS) {
  saveSettings({ uri: 'sip:1001@10.35.1.20', socket: 'ws://10.35.1.20:8088' });
  const shown = show(sip, true, api, roles);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  // The node's configuration is asked for first, which says how to register.
  await vi.waitFor(() => expect(sip.agents.length).toBeGreaterThan(0));
  act(() => { sip.agents[0].emit('registered', {}); });
  await screen.findByText('Registered as 1001');
  return shown;
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

/** A browser with two microphones and a camera, labelled only once the microphone is allowed. */
function withDevices() {
  let allowed = false;
  const devices = [
    { kind: 'audioinput', deviceId: 'default', label: 'Default' },
    { kind: 'audioinput', deviceId: 'mic-builtin', label: 'MacBook Pro Microphone' },
    { kind: 'audioinput', deviceId: 'mic-blackhole', label: 'BlackHole 2ch' },
    { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD Camera' },
  ];
  const asked: MediaStreamConstraints[] = [];
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      enumerateDevices: async () => devices.map((device) => ({ ...device, label: allowed ? device.label : '' })),
      getUserMedia: async (constraints: MediaStreamConstraints) => { asked.push(constraints); allowed = true; return { getTracks: () => [] }; },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  return asked;
}

describe('PhoneHost', () => {
  it('signs in to a line where the node says, asked with its own credentials, and remembers everything but the password', async () => {
    const sip = stack();
    const api = node();
    show(sip, true, api, []);
    expect((screen.getByLabelText('WebSocket') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('SIP address'), { target: { value: 'sip:1001@10.35.1.20' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await vi.waitFor(() => expect(sip.agents).toHaveLength(1));
    expect(api.asked).toEqual(['1001@10.35.1.20 secret']);
    expect(sip.agents[0].configuration).toMatchObject({ uri: 'sip:1001@10.35.1.20', password: 'secret' });
    expect(loadSettings()).toEqual({ uri: 'sip:1001@10.35.1.20' });
    expect(JSON.stringify(window.localStorage)).not.toContain('secret');
  });

  it('does not register when the node refuses the line, and says so', async () => {
    const sip = stack();
    const api = {
      subscriberConfig: async () => { throw new ApiError('unauthorized', 401, 'unauthorized'); },
      listCallRecords: async () => [],
      listRegistrations: async () => [],
    } as unknown as AdminApi;
    show(sip, true, api);
    fireEvent.change(screen.getByLabelText('SIP address'), { target: { value: 'sip:1001@10.35.1.20' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The node did not accept that SIP address and password.');
    expect(sip.agents).toHaveLength(0);
  });

  it('dials an extension from the pad in its own realm, with the node ICE servers', async () => {
    const { sip } = await registered();
    const pad = screen.getByRole('group', { name: 'Dial pad' });
    for (const key of ['1', '0', '0', '2']) fireEvent.click(within(pad).getByRole('button', { name: key }));
    expect((screen.getByLabelText('Number or address') as HTMLInputElement).value).toBe('1002');
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));

    await vi.waitFor(() => expect(sip.agents[0].calls).toHaveLength(1));
    expect(sip.agents[0].calls[0].target).toBe('sip:1002@10.35.1.20');
    expect(sip.agents[0].calls[0].options.pcConfig).toEqual({ iceServers: [{ urls: 'stun:10.35.1.20:3478' }] });
    expect(sip.agents[0].calls[0].options.mediaConstraints).toEqual({ audio: true, video: false });
  });

  it('rings in the top bar, and answers with video or declines', async () => {
    const { sip, slot } = await registered();
    const session = new FakeSession();
    act(() => { sip.agents[0].emit('newRTCSession', { originator: 'remote', session, request: {} }); });

    expect(slot.textContent).toBe('Incoming call from athenaphone');
    fireEvent.click(screen.getByRole('button', { name: 'Answer with video' }));
    await vi.waitFor(() => expect(session.log).toEqual(['answer {"audio":true,"video":true}']));

    const second = new FakeSession();
    act(() => { session.emit('ended', { cause: 'Terminated' }); });
    act(() => { sip.agents[0].emit('newRTCSession', { originator: 'remote', session: second, request: {} }); });
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(second.log).toEqual(['terminate 603']);
  });

  it('on a connected call, sends the pad as tones, and mutes and holds', async () => {
    const { sip } = await registered();
    fireEvent.change(screen.getByLabelText('Number or address'), { target: { value: 'athenaphone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].sessions).toHaveLength(1));
    const [session] = sip.agents[0].sessions;
    act(() => { session.emit('accepted', {}); });

    fireEvent.click(within(screen.getByRole('group', { name: 'Send tones' })).getByRole('button', { name: '5' }));
    fireEvent.keyDown(window, { key: '#' });
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    expect(screen.getByLabelText('Tones sent').textContent).toBe('5#');
    expect(screen.getByRole('status').textContent).toContain('on hold, muted');
    expect(session.log).toEqual(['dtmf 5', 'dtmf #', 'mute', 'hold']);

    fireEvent.click(screen.getByRole('button', { name: 'Hang up' }));
    expect(session.log).toContain('terminate');
  });

  it('asks for the microphone before a line, then calls with the one chosen, remembered', async () => {
    const asked = withDevices();
    const sip = stack();
    saveSettings({ uri: 'sip:1001@10.35.1.20', socket: 'ws://10.35.1.20:8088' });
    show(sip);
    fireEvent.click(screen.getByRole('button', { name: 'Allow the microphone' }));
    const microphone = await screen.findByLabelText('Microphone') as HTMLSelectElement;
    expect(asked).toEqual([{ audio: true, video: false }]);
    expect([...microphone.options].map((option) => option.text)).toEqual(['Browser default', 'MacBook Pro Microphone', 'BlackHole 2ch']);

    fireEvent.change(microphone, { target: { value: 'mic-builtin' } });
    expect(loadSettings().microphone).toBe('mic-builtin');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await vi.waitFor(() => expect(sip.agents.length).toBeGreaterThan(0));
    act(() => { sip.agents[0].emit('registered', {}); });
    fireEvent.change(await screen.findByLabelText('Number or address'), { target: { value: '1002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].calls).toHaveLength(1));
    expect(sip.agents[0].calls[0].options.mediaConstraints).toEqual({ audio: { deviceId: { exact: 'mic-builtin' } }, video: false });
  });

  it('lists this line recent calls and the realm directory, and calls back from either', async () => {
    const records: CallRecord[] = [
      { id: 'a', caller: 'sip:1001@10.35.1.20', callee: 'sip:athenaphone@10.35.1.20', created_at: '2026-10-03T19:00:00Z', answered_at: '2026-10-03T19:00:05Z', ended_at: '2026-10-03T19:03:09Z', duration: 184, nodes: [], media_engine: null },
      { id: 'b', caller: 'sip:1002@10.35.1.20;transport=ws', callee: 'sip:1001@10.35.1.20', created_at: null, answered_at: null, ended_at: '2026-10-03T18:00:00Z', duration: 0, nodes: [], media_engine: null },
      { id: 'c', caller: 'sip:1002@10.35.1.20', callee: 'sip:1003@10.35.1.20', created_at: null, answered_at: null, ended_at: null, duration: 0, nodes: [], media_engine: null },
    ];
    const subscribers = ['1001', '1002', 'athenaphone'].map((user) => ({ uri: `sip:${user}@10.35.1.20`, user, realm: '10.35.1.20' })) as Subscriber[];
    const registrations = [{ subscriber: 'sip:athenaphone@10.35.1.20' }] as Registration[];
    const api = {
      subscriberConfig: async () => CONFIG,
      listCallRecords: async () => records,
      listSubscribers: async (realm: string) => (realm === '10.35.1.20' ? subscribers : []),
      listRegistrations: async () => registrations,
    } as unknown as AdminApi;
    const sip = stack();
    await registered(sip, api, ['view-cluster-status', 'manage-realm-subscribers']);

    const recent = await screen.findByRole('list', { name: 'Recent calls' });
    expect([...recent.querySelectorAll('li')].map((row) => row.querySelector('.phone-list-detail')!.textContent!.replace(/, [^,]+ago$|, \d+ \w+$/, ''))).toEqual(['Outgoing, 3:04', 'Missed']);
    const directory = await screen.findByRole('list', { name: 'Directory' });
    expect(within(directory).getAllByRole('listitem').map((row) => row.querySelector('.phone-list-detail')!.textContent)).toEqual(['Not registered', 'Registered']);

    fireEvent.click(within(directory).getByRole('button', { name: 'Call athenaphone' }));
    await vi.waitFor(() => expect(sip.agents[0].calls).toHaveLength(1));
    expect(sip.agents[0].calls[0].target).toBe('sip:athenaphone@10.35.1.20');
  });

  it('says why there is no history or directory when the console user has no role for them', async () => {
    await registered(stack(), node(), []);
    expect(screen.getByText(/call records, which need the View cluster status role/)).toBeTruthy();
    expect(screen.getByText(/needs the Manage subscribers or View cluster status role/)).toBeTruthy();
  });

  it('calls with the node ICE servers for a console user with no roles, asked with the line', async () => {
    const api = node();
    const sip = stack();
    await registered(sip, api, []);
    fireEvent.change(screen.getByLabelText('Number or address'), { target: { value: '1002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].calls).toHaveLength(1));
    expect(sip.agents[0].calls[0].options.pcConfig).toEqual({ iceServers: [{ urls: 'stun:10.35.1.20:3478' }] });
    // Once at registering, for the realm's rooms, and once for the call's ICE servers.
    expect(api.asked).toEqual(['1001@10.35.1.20 pw', '1001@10.35.1.20 pw']);
  });

  it('keeps the call, and its indicator, while another screen is shown', async () => {
    const sip = stack();
    const { slot, view } = await registered(sip);
    fireEvent.change(screen.getByLabelText('Number or address'), { target: { value: 'athenaphone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].sessions).toHaveLength(1));
    act(() => { sip.agents[0].sessions[0].emit('accepted', {}); });

    view.rerender(<MemoryRouter><PhoneHost api={node()} roles={STATUS} visible={false} indicator={slot} stack={sip} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Phone' })).toBeNull();
    expect(slot.textContent).toMatch(/^Connected athenaphone 0:0\d$/);
    expect(sip.agents[0].sessions[0].log).toEqual([]);
  });
});

describe('PhoneHost conferences', () => {
  /** Registers `uri` against the fake node, which seeds a room `conf-sales` in sip.athenasip.org. */
  async function on(uri: string, roles: readonly Role[] = STATUS, api = new FakeAdminApi()) {
    const config = vi.spyOn(api, 'subscriberConfig');
    const sip = stack();
    saveSettings({ uri, socket: 'ws://203.0.113.5:8088' });
    show(sip, true, api, roles);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await vi.waitFor(() => expect(sip.agents.length).toBeGreaterThan(0));
    act(() => { sip.agents[0].emit('registered', {}); });
    await screen.findByText(/^Registered as /);
    await vi.waitFor(() => expect(config).toHaveBeenCalled());
    await act(async () => { await config.mock.results[0].value; });
    return { sip, api };
  }

  async function dialByHand(sip: ReturnType<typeof stack>, typed: string) {
    fireEvent.change(screen.getByLabelText('Number or address'), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].sessions).toHaveLength(1));
    act(() => { sip.agents[0].sessions[0].emit('accepted', {}); });
  }

  it('offers rooms in a realm with a focus, and none in a realm without', async () => {
    await on('sip:tomweb@sip.athenasip.org');
    expect(await screen.findByRole('heading', { name: 'Conferences' })).toBeTruthy();
    expect(screen.getByText(/A room exists once somebody dials it/)).toBeTruthy();
    document.body.innerHTML = '';

    await on('sip:reception@blackraven.co.nz');
    expect(screen.queryByRole('heading', { name: 'Conferences' })).toBeNull();
    expect(screen.queryByLabelText('Room')).toBeNull();
  });

  it('joins a room by name, with the realm prefix added once', async () => {
    const { sip } = await on('sip:tomweb@sip.athenasip.org');
    fireEvent.change(await screen.findByLabelText('Room'), { target: { value: 'conf-sales' } });
    expect(screen.getByText('sip:conf-sales@sip.athenasip.org')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'sales' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join with video' }));

    await vi.waitFor(() => expect(sip.agents[0].calls).toHaveLength(1));
    expect(sip.agents[0].calls[0].target).toBe('sip:conf-sales@sip.athenasip.org');
    expect(sip.agents[0].calls[0].options.mediaConstraints).toEqual({ audio: true, video: true });
  });

  it('shows a room dialled by hand as a conference, with who the node routed to it', async () => {
    const { sip } = await on('sip:tomweb@sip.athenasip.org');
    await dialByHand(sip, 'conf-sales');

    expect(sip.agents[0].calls[0].target).toBe('sip:conf-sales@sip.athenasip.org');
    expect(screen.getByRole('status').textContent).toContain('In conference conf-sales');
    expect(screen.getByRole('heading', { name: 'In conference conf-sales' })).toBeTruthy();
    const roster = await screen.findByRole('list', { name: 'In the room' });
    expect(within(roster).getAllByRole('listitem').map((row) => row.querySelector('.phone-list-name')!.textContent)).toEqual(['tom', 'tomweb (you)']);
    expect(roster.textContent).toMatch(/In the room, joined 4 min ago/);
  });

  it('shows a call from a room’s focus as that conference', async () => {
    const { sip } = await on('sip:tomweb@sip.athenasip.org');
    const session = new FakeSession();
    session.remote_identity = { uri: { toString: () => 'sip:conf-sales@sip.athenasip.org' } };
    act(() => { sip.agents[0].emit('newRTCSession', { originator: 'remote', session, request: {} }); });
    act(() => { session.emit('accepted', {}); });
    expect(await screen.findByRole('heading', { name: 'In conference conf-sales' })).toBeTruthy();
  });

  it('says nobody else is in yet when the node knows no one in the room', async () => {
    const { sip } = await on('sip:tomweb@sip.athenasip.org');
    await dialByHand(sip, 'conf-support');
    expect(await screen.findByText('Nobody else is in this room yet, or the focus has not answered.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the roster needs a role, and never asks, for a console user without it', async () => {
    const api = new FakeAdminApi();
    const roster = vi.spyOn(api, 'getConference');
    const { sip } = await on('sip:tomweb@sip.athenasip.org', [], api);
    await dialByHand(sip, 'sip:conf-sales@sip.athenasip.org');

    expect(screen.getByRole('heading', { name: 'In conference conf-sales' })).toBeTruthy();
    expect(screen.getByText(/Who is in the room comes from the node.s live calls, which need the View cluster status role/)).toBeTruthy();
    expect(roster).not.toHaveBeenCalled();
  });
});

describe('PhoneHost registration', () => {
  /** A page event as the browser fires it; jsdom has no PageTransitionEvent. */
  const page = (type: 'pagehide' | 'pageshow', persisted: boolean) => Object.assign(new Event(type), { persisted });

  it('unregisters as the tab closes', async () => {
    const { sip } = await registered();
    act(() => { window.dispatchEvent(page('pagehide', false)); });
    expect(sip.agents[0].stopped).toBe(1);
    act(() => { window.dispatchEvent(page('pageshow', false)); });
    expect(sip.agents).toHaveLength(1);
  });

  it('registers again when a page kept in the back-forward cache is shown', async () => {
    const { sip } = await registered();
    act(() => { window.dispatchEvent(page('pagehide', true)); });
    act(() => { window.dispatchEvent(page('pageshow', true)); });
    await vi.waitFor(() => expect(sip.agents).toHaveLength(2));
    expect(sip.agents[1].configuration).toMatchObject({ uri: 'sip:1001@10.35.1.20', password: 'pw' });
  });

  it('keeps a flow to each of two nodes, for as long as the realm grants, when the cluster asks', async () => {
    const sip = stack();
    const cluster: ClientConfig = {
      ...CONFIG,
      nodes: [
        { id: 'a', self: true, transports: [{ transport: 'ws', address: '10.35.1.20', port: 8088, uri: '' }] },
        { id: 'b', self: false, transports: [{ transport: 'ws', address: '10.44.1.50', port: 8088, uri: '' }] },
      ],
      realm: { name: '10.35.1.20', registration: { expires: 3600, minimum: 0 }, outbound: { flows: 2 }, push: [], conferences: [] },
    };
    const api = { ...node(), subscriberConfig: async () => cluster } as unknown as AdminApi;
    show(sip, true, api, []);
    fireEvent.change(screen.getByLabelText('SIP address'), { target: { value: 'sip:1001@10.35.1.20' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await vi.waitFor(() => expect(sip.agents).toHaveLength(2));
    expect(sip.agents.map((agent) => agent.flow)).toEqual([1, 2]);
    expect(sip.agents[0].configuration.register_expires).toBe(3600);
    act(() => { sip.agents[0].emit('registered', {}); sip.agents[1].emit('registered', {}); });
    expect(await screen.findByText('Reachable through 2 nodes, so calls still arrive if one of them stops.')).toBeTruthy();
  });
});
