// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import type { AdminApi } from '../api/AdminApi';
import { OverviewScreen, describeUptime, transportState } from './OverviewScreen';

describe('describeUptime', () => {
  it('says days and hours rather than a count of seconds', () => {
    expect(describeUptime(4523)).toBe('1h 15m');
    expect(describeUptime(90_000)).toBe('1d 1h');
    expect(describeUptime(45)).toBe('45s');
  });

  it('says so rather than rendering NaN when the server sends nonsense', () => {
    expect(describeUptime(Number.NaN)).toBe('unknown');
  });
});

describe('transportState', () => {
  it('does not call a transport down just because the node did not say', () => {
    // An older node that omits `listening` must not be drawn as broken; that
    // is the difference between "no evidence" and "evidence of failure".
    expect(transportState({ transport: 'tls', enabled: true, address: '0.0.0.0', port: 5061 }).tone).toBe('ok');
  });

  it('distinguishes turned off from enabled and not listening', () => {
    expect(transportState({ transport: 'tls', enabled: false, address: '0.0.0.0', port: 5061 }).tone).toBe('warn');
    expect(transportState({ transport: 'tls', enabled: true, address: '0.0.0.0', port: 5061, listening: false }).tone).toBe('down');
  });
});

describe('OverviewScreen', () => {
  it('shows the node and its transports once the server answers', async () => {
    render(<MemoryRouter><OverviewScreen api={new FakeAdminApi()} /></MemoryRouter>);
    expect(await screen.findByText('sip-0001')).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'UDP' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'WS' })).toBeTruthy();
  });

  it('shows the failure rather than an empty panel when the server is unreachable', async () => {
    // The state this console spends most of its early life in.
    const unreachable = {
      status: () => Promise.reject(new TypeError('Failed to fetch')),
    } as unknown as AdminApi;
    render(<MemoryRouter><OverviewScreen api={unreachable} /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Failed to fetch');
  });
});
