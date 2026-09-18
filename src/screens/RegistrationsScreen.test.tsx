// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { RegistrationsScreen, describeExpiry } from './RegistrationsScreen';

describe('describeExpiry', () => {
  const now = 1_000_000;

  it('treats a nearly-expired binding as ordinary, not as a failure', () => {
    // Phones refresh at half the interval, so a short remainder is normal.
    // Drawing it red would make a healthy server look broken all day.
    expect(describeExpiry(now + 30_000, now)).toEqual({ label: '30s left', tone: 'warn' });
    expect(describeExpiry(now + 240_000, now)).toEqual({ label: '4m left', tone: 'ok' });
  });

  it('calls an elapsed binding expired rather than reporting negative time', () => {
    expect(describeExpiry(now - 5_000, now)).toEqual({ label: 'Expired', tone: 'down' });
  });
});

describe('RegistrationsScreen', () => {
  it('lists the live bindings with their transport', async () => {
    render(<RegistrationsScreen api={new FakeAdminApi()} />);
    expect(await screen.findByRole('group', { name: 'sip:tom@sip.athenasip.org' })).toBeTruthy();
    expect(await screen.findByText('WS')).toBeTruthy();
  });
});
