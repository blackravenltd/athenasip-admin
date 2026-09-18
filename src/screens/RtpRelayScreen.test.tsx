// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeAdminApi } from '../api/FakeAdminApi';
import { RtpRelayScreen, concurrentCalls } from './RtpRelayScreen';

describe('concurrentCalls', () => {
  it('halves the range, because a call takes RTP and RTCP', () => {
    expect(concurrentCalls(22000, 23000)).toBe(500);
  });

  it('is zero rather than negative for an inverted range', () => {
    expect(concurrentCalls(23000, 22000)).toBe(0);
  });
});

describe('RtpRelayScreen', () => {
  it('shows the settings the server holds, not invented defaults', async () => {
    render(<RtpRelayScreen api={new FakeAdminApi()} />);
    expect(await screen.findByLabelText('From')).toHaveProperty('value', '22000');
    expect(await screen.findByLabelText('To')).toHaveProperty('value', '23000');
  });

  it('reports the server rejecting a range rather than claiming it saved', async () => {
    render(<RtpRelayScreen api={new FakeAdminApi()} />);
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The port range starts after it ends.');
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('saves a valid change', async () => {
    render(<RtpRelayScreen api={new FakeAdminApi()} />);
    fireEvent.change(await screen.findByLabelText('To'), { target: { value: '24000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved.'));
  });

  it('puts the server’s values back when changes are discarded', async () => {
    render(<RtpRelayScreen api={new FakeAdminApi()} />);
    const from = await screen.findByLabelText('From');
    fireEvent.change(from, { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.getByLabelText('From')).toHaveProperty('value', '22000'));
  });
});
