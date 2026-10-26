// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClusterNode } from '../api/types';
import { FakeAdminApi } from '../api/FakeAdminApi';
import type { AdminApi } from '../api/AdminApi';
import { signedInAs } from '../test/signedIn';
import { OverviewScreen, healthState, nodeState, policyStragglers, selfNode } from './OverviewScreen';

describe('policyStragglers', () => {
  const node = (id: string, fingerprint?: string, driver = 'lua 1.0.0'): ClusterNode => ({
    id, self: id === 'a', transports: [], ...(fingerprint === undefined ? {} : { policy: { driver, fingerprint } }),
  });

  it('names the nodes outside the policy most of them run', () => {
    expect(policyStragglers([node('a', 'x'), node('b', 'y'), node('c', 'y')]).map((each) => each.id)).toEqual(['a']);
  });

  it('finds no fault where they agree, or where a node reported nothing', () => {
    expect(policyStragglers([node('a', 'x'), node('b', 'x'), node('c')])).toEqual([]);
  });

  it('counts a different driver as different, fingerprint or not', () => {
    const builtin: ClusterNode = { id: 'b', self: false, transports: [], policy: { driver: 'builtin 1.0.0' } };
    expect(policyStragglers([node('a', 'x'), builtin]).map((each) => each.id)).toEqual(['b']);
  });
});

describe('healthState', () => {
  it('says a degraded node is not serving, and why', () => {
    expect(healthState({ status: 'degraded', node: 'n', version: 'v', datastore: 'd' }).tone).toBe('down');
    expect(healthState({ status: 'ok', node: 'n', version: 'v', datastore: 'd' }).label).toBe('Serving');
  });
});

describe('selfNode', () => {
  it('picks the node that answered out of the list', () => {
    expect(selfNode([{ id: 'a', self: false, transports: [] }, { id: 'b', self: true, transports: [] }])?.id).toBe('b');
  });
});

describe('nodeState', () => {
  it('does not trust a stale report, whatever it says', () => {
    expect(nodeState({ id: 'a', self: false, status: 'ok', stale: true, transports: [] })).toEqual({ label: 'No recent report', tone: 'warn' });
    expect(nodeState({ id: 'a', self: true, status: 'ok', transports: [] }).tone).toBe('ok');
    expect(nodeState({ id: 'a', self: false, status: 'down', transports: [] }).tone).toBe('down');
  });
});

describe('OverviewScreen', () => {
  it('shows the node, its counts and its transports once it answers', async () => {
    render(<MemoryRouter><OverviewScreen api={new FakeAdminApi()} /></MemoryRouter>);
    expect((await screen.findAllByText('sip-0001')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('group', { name: 'UDP' })).toBeTruthy();
    expect((await screen.findByRole('group', { name: 'TLS' })).textContent).toContain('sips:203.0.113.5:5061');
  });

  it('shows a subscriber manager what it can see, and says quietly what it cannot', async () => {
    const { api } = await signedInAs('helpdesk');
    render(<MemoryRouter><OverviewScreen api={api} /></MemoryRouter>);
    expect(await screen.findByText('sip-0001')).toBeTruthy();
    expect(await screen.findByText('Not available to this login')).toBeTruthy();
    expect(await screen.findAllByText(/roles do not include the node/)).toHaveLength(2);
    expect(await screen.findByText('2')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists the cluster, marking this node and one whose reports stopped', async () => {
    render(<MemoryRouter><OverviewScreen api={new FakeAdminApi()} /></MemoryRouter>);
    const self = await screen.findByRole('group', { name: 'Node sip-0001' });
    expect(self.parentElement!.textContent).toContain('This node');
    const quiet = screen.getByRole('group', { name: 'Node sip-0002' });
    expect(quiet.parentElement!.textContent).toContain('No recent report');
  });

  it('flags a node running different routing scripts from the rest', async () => {
    render(<MemoryRouter><OverviewScreen api={new FakeAdminApi()} /></MemoryRouter>);
    expect(await screen.findByText(/The nodes disagree on their routing scripts: sip-0002 runs/)).toBeTruthy();
    const quiet = screen.getByRole('group', { name: 'Node sip-0002' });
    expect(quiet.parentElement!.textContent).toContain('Different scripts');
    expect(screen.getByRole('group', { name: 'Node sip-0001' }).textContent).toContain('Routing: lua 1.0.0, scripts 9f2c4e1ab07d');
  });

  it('offers a reload of the scripts only with manage-cluster, and says what runs after', async () => {
    const { unmount } = render(<MemoryRouter><OverviewScreen api={new FakeAdminApi()} roles={['view-cluster-status']} /></MemoryRouter>);
    await screen.findByRole('group', { name: 'Node sip-0001' });
    expect(screen.queryByRole('button', { name: 'Reload scripts' })).toBeNull();
    unmount();

    const api = new FakeAdminApi();
    const reload = vi.spyOn(api, 'reloadPolicy');
    render(<MemoryRouter><OverviewScreen api={api} roles={['view-cluster-status', 'manage-cluster']} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Reload scripts' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reload the routing scripts?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reload' }));
    expect(await screen.findByText('This node now runs lua 1.0.0, scripts 9f2c4e1ab07d.')).toBeTruthy();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows the failure rather than an empty panel when the node is unreachable', async () => {
    const unreachable = new Proxy({}, { get: () => () => Promise.reject(new TypeError('Failed to fetch')) }) as AdminApi;
    render(<MemoryRouter><OverviewScreen api={unreachable} /></MemoryRouter>);
    expect((await screen.findAllByRole('alert'))[0]).toHaveProperty('textContent', 'Failed to fetch');
  });
});
