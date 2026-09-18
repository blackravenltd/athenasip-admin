// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';
import { FakeAdminApi } from './api/FakeAdminApi';
import { routes } from './app/routes';

function show(at: string) {
  render(
    <MemoryRouter initialEntries={[at]}>
      <App api={new FakeAdminApi()} />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('marks the section you are in, which the old navigation never did', async () => {
    show(routes.realms);
    await waitFor(() => expect(screen.getByRole('link', { name: 'SIP' }).className).toContain('active'));
    const topbar = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(topbar).getByRole('link', { name: 'Overview' }).className).not.toContain('active');
  });

  it('shows a section bar inside a section and none on the overview', async () => {
    show(routes.realms);
    expect(await screen.findByRole('navigation', { name: 'SIP navigation' })).toBeTruthy();
  });

  it('has no section bar on the overview', () => {
    show(routes.home);
    expect(screen.queryByRole('navigation', { name: 'SIP navigation' })).toBeNull();
  });

  it('resolves the SIP section root instead of silently rendering the overview', async () => {
    // `/sip` was in the navigation and absent from the old route table, so it
    // fell through to Home and the bar highlighted nothing.
    show(routes.sip);
    expect(await screen.findByRole('heading', { name: 'Realms', level: 1 })).toBeTruthy();
  });

  it('navigates between sections without a page load', async () => {
    show(routes.home);
    fireEvent.click(screen.getByRole('link', { name: 'Media' }));
    expect(await screen.findByRole('heading', { name: 'Media', level: 1 })).toBeTruthy();
  });

  it('says an unknown path is unknown rather than showing the front page', async () => {
    show('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Not found', level: 1 })).toBeTruthy();
  });
});
