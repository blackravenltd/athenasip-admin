// @vitest-environment jsdom
import { EventEmitter } from 'node:events';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UA, UAConfiguration } from 'jssip/lib/UA';
import { READOUT_KEY } from '../softphone/page';
import type { SipStack } from '../softphone/Softphone';
import { SoftphoneScreen, callInProgress, defaultConnection, describeCallState } from './SoftphoneScreen';

class FakeAgent extends EventEmitter {
  sessions: FakeSession[] = [];
  stopped = 0;
  constructor(readonly configuration: UAConfiguration) { super(); }
  start() {}
  stop() { this.stopped += 1; }
  call() {
    const session = new FakeSession();
    this.sessions.push(session);
    this.emit('newRTCSession', { originator: 'local', session, request: {} });
  }
}

class FakeSession extends EventEmitter {
  answered = 0;
  terminated = 0;
  remote_identity = { uri: { toString: () => 'sip:1002@example.com' } };
  answer() { this.answered += 1; }
  terminate() { this.terminated += 1; }
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

beforeEach(() => {
  // jsdom has no media devices and no AudioContext; the meters warn and
  // stand down, which is the behaviour and is not what is under test.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SoftphoneScreen', () => {
  it('registers with what was typed and shows the registration state', async () => {
    const sip = stack();
    render(<SoftphoneScreen stack={sip} />);

    fireEvent.change(screen.getByLabelText('WebSocket URL'), { target: { value: 'ws://node:8088' } });
    fireEvent.change(screen.getByLabelText('SIP URI'), { target: { value: 'sip:1001@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(sip.agents[0].configuration.uri).toBe('sip:1001@example.com');
    expect(screen.getByTestId('softphone-registration').textContent).toBe('Registering...');

    act(() => { sip.agents[0].emit('registered', {}); });
    expect(screen.getByTestId('softphone-registration').textContent).toBe('Registered');
    expect(screen.getByTestId('softphone-call-state').getAttribute('data-state')).toBe('idle');
  });

  it('reports a refused registration where a person will see it', () => {
    const sip = stack();
    render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', password: 'wrong', register: true, answer: false }} stack={sip} />);
    act(() => { sip.agents[0].emit('registrationFailed', { cause: 'Unauthorized' }); });
    expect(screen.getByRole('alert').textContent).toBe('Registration failed: Unauthorized');
    expect(screen.getByTestId('softphone-registration').getAttribute('data-state')).toBe('failed');
  });

  it('registers on load when the page asks for it, prefilled from the query string', () => {
    const sip = stack();
    render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', password: 'pw', target: 'sip:1002@example.com', register: true, answer: false }} stack={sip} />);
    expect(sip.agents).toHaveLength(1);
    expect(sip.agents[0].configuration.password).toBe('pw');
    expect((screen.getByLabelText('Call target') as HTMLInputElement).value).toBe('sip:1002@example.com');
  });

  it('places a call, shows the negotiation, and hangs up', () => {
    const sip = stack();
    render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', password: 'pw', target: 'sip:1002@example.com', register: true, answer: false }} stack={sip} />);
    const [agent] = sip.agents;
    act(() => { agent.emit('registered', {}); });

    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    const [session] = agent.sessions;
    expect(screen.getByTestId('softphone-call-state').textContent).toBe('Calling... (sip:1002@example.com)');
    expect(screen.getByRole('button', { name: 'Call' })).toHaveProperty('disabled', true);

    act(() => {
      session.emit('sdp', { originator: 'local', type: 'offer', sdp: 'v=0 offer' });
      session.emit('sdp', { originator: 'remote', type: 'answer', sdp: 'v=0 answer' });
      session.emit('accepted', {});
    });
    expect(screen.getByTestId('softphone-call-state').getAttribute('data-state')).toBe('connected');
    expect(screen.getByTestId('softphone-local-sdp').textContent).toBe('v=0 offer');
    expect(screen.getByTestId('softphone-remote-sdp').textContent).toBe('v=0 answer');

    fireEvent.click(screen.getByRole('button', { name: 'Hang up' }));
    expect(session.terminated).toBe(1);
    act(() => { session.emit('ended', { originator: 'local', cause: 'Terminated' }); });
    expect(screen.getByTestId('softphone-call-state').textContent).toBe('Call ended (sip:1002@example.com)');
  });

  it('answers on arrival when the page asks for it, and offers the button otherwise', () => {
    const sip = stack();
    const { unmount } = render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', register: true, answer: false }} stack={sip} />);
    act(() => { sip.agents[0].emit('registered', {}); });
    const session = new FakeSession();
    act(() => { sip.agents[0].emit('newRTCSession', { originator: 'remote', session, request: {} }); });
    expect(session.answered).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    expect(session.answered).toBe(1);
    unmount();

    render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', register: true, answer: true }} stack={sip} />);
    act(() => { sip.agents[1].emit('registered', {}); });
    const auto = new FakeSession();
    act(() => { sip.agents[1].emit('newRTCSession', { originator: 'remote', session: auto, request: {} }); });
    expect(auto.answered).toBe(1);
  });

  it('exposes the readout while mounted and removes it on unmount, stopping the agent', () => {
    const sip = stack();
    const { unmount } = render(<SoftphoneScreen options={{ socket: 'ws://node:8088', uri: 'sip:1001@example.com', register: true, answer: false }} stack={sip} />);
    expect(window[READOUT_KEY]?.state().registration).toBe('connecting');
    unmount();
    expect(window[READOUT_KEY]).toBeUndefined();
    expect(sip.agents[0].stopped).toBe(1);
  });
});

describe('the pure parts', () => {
  it('names every call state', () => {
    expect(describeCallState('ringing')).toBe('Ringing...');
    expect(callInProgress('incoming')).toBe(true);
    expect(callInProgress('ended')).toBe(false);
  });

  it('defaults the socket to the page host when nothing says otherwise', () => {
    const connection = defaultConnection({ register: false, answer: false });
    expect(connection.socket).toMatch(/^ws:\/\/.*:9500$/);
    expect(connection.password).toBe('');
  });
});
