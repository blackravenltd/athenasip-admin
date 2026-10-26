// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import type { CallRecord } from '../api/types';
import { CallHistoryScreen, recordOutcome } from './CallHistoryScreen';

const record = (overrides: Partial<CallRecord>): CallRecord => ({
  id: 'r', created_at: null, answered_at: '2026-10-26T10:00:00Z', ended_at: null, duration: 65,
  caller: null, callee: null, nodes: [], media_engine: null, ...overrides,
});

describe('recordOutcome', () => {
  it('gives talking time for an answered call, and says when one was not', () => {
    expect(recordOutcome(record({}))).toEqual({ label: '1:05', tone: 'ok' });
    expect(recordOutcome(record({ duration: 3725 }))).toEqual({ label: '1:02:05', tone: 'ok' });
    expect(recordOutcome(record({ answered_at: null, duration: 0 }))).toEqual({ label: 'Not answered', tone: 'warn' });
  });
});

describe('CallHistoryScreen', () => {
  it('lists the ended calls, newest first, with the latest hundred by default', async () => {
    const api = new FakeAdminApi();
    const list = vi.spyOn(api, 'listCallRecords');
    render(<CallHistoryScreen api={api} />);
    const first = await screen.findByRole('group', { name: 'r1@192.168.1.24' });
    expect(first.textContent).toContain('sip:tom@sip.athenasip.org to sip:tomweb@sip.athenasip.org');
    expect(screen.getByText('Not answered')).toBeTruthy();
    expect(list).toHaveBeenCalledWith(100, expect.anything());
  });

  it('asks for more when told to', async () => {
    const api = new FakeAdminApi();
    const list = vi.spyOn(api, 'listCallRecords');
    render(<CallHistoryScreen api={api} />);
    await screen.findByRole('group', { name: 'r1@192.168.1.24' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), { target: { value: '1000' } });
    expect(list).toHaveBeenLastCalledWith(1000, expect.anything());
  });
});
