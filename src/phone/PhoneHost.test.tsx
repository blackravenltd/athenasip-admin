// @vitest-environment jsdom
import { EventEmitter } from 'node:events';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UA, UAConfiguration } from 'jssip/lib/UA';
import type { AdminApi } from '../api/AdminApi';
import type { ClientConfig } from '../api/types';
import type { SipStack } from '../softphone/Softphone';
import PhoneHost from './PhoneHost';
import { loadSettings, saveSettings } from './settings';

class FakeAgent extends EventEmitter {
  sessions: FakeSession[] = [];
  calls: Array<{ target: string; options: { pcConfig?: RTCConfiguration; mediaConstraints?: MediaStreamConstraints } }> = [];
  constructor(readonly configuration: UAConfiguration) { super(); }
  start() {}
  stop() {}
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
    createUserAgent: (configuration) => {
      const agent = new FakeAgent(configuration);
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

function node(): AdminApi {
  return { clientConfig: async () => CONFIG } as unknown as AdminApi;
}

function show(sip = stack(), visible = true) {
  const slot = document.createElement('div');
  document.body.appendChild(slot);
  const view = render(<MemoryRouter><PhoneHost api={node()} visible={visible} indicator={slot} stack={sip} /></MemoryRouter>);
  return { sip, slot, view };
}

async function registered(sip = stack()) {
  saveSettings({ uri: 'sip:1001@10.35.1.20', socket: 'ws://10.35.1.20:8088' });
  const shown = show(sip);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'Register' }));
  act(() => { sip.agents[0].emit('registered', {}); });
  await screen.findByText('Registered as 1001');
  return shown;
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('PhoneHost', () => {
  it('signs in to a line where the node says, and remembers everything but the password', async () => {
    const sip = stack();
    show(sip);
    await vi.waitFor(() => expect((screen.getByLabelText('WebSocket') as HTMLInputElement).value).toBe('ws://10.35.1.20:8088'));
    fireEvent.change(screen.getByLabelText('SIP address'), { target: { value: 'sip:1001@10.35.1.20' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(sip.agents[0].configuration).toMatchObject({ uri: 'sip:1001@10.35.1.20', password: 'secret' });
    expect(loadSettings()).toEqual({ uri: 'sip:1001@10.35.1.20', socket: 'ws://10.35.1.20:8088' });
    expect(JSON.stringify(window.localStorage)).not.toContain('secret');
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

  it('keeps the call, and its indicator, while another screen is shown', async () => {
    const sip = stack();
    const { slot, view } = await registered(sip);
    fireEvent.change(screen.getByLabelText('Number or address'), { target: { value: 'athenaphone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    await vi.waitFor(() => expect(sip.agents[0].sessions).toHaveLength(1));
    act(() => { sip.agents[0].sessions[0].emit('accepted', {}); });

    view.rerender(<MemoryRouter><PhoneHost api={node()} visible={false} indicator={slot} stack={sip} /></MemoryRouter>);
    expect(screen.queryByRole('heading', { name: 'Phone' })).toBeNull();
    expect(slot.textContent).toMatch(/^Connected athenaphone 0:0\d$/);
    expect(sip.agents[0].sessions[0].log).toEqual([]);
  });
});
