import { describe, expect, it } from 'vitest';
import { sectionNavFor, topNav } from './navigation';
import { routes } from './routes';

describe('topNav', () => {
  it('points every section at a path the router actually serves', () => {
    // The previous navigation listed `/sip`, the route table did not, and the
    // link silently rendered Home. Anything in the bar has to be a route.
    const known = new Set<string>(Object.values(routes));
    for (const item of topNav) expect(known).toContain(item.to);
  });

  it('matches the overview exactly, so it is not active on every page', () => {
    // `/` is a prefix of everything. Without `end` the overview stays
    // highlighted while you are four pages away from it.
    const overview = topNav.find((item) => item.to === routes.home);
    expect(overview?.end).toBe(true);
  });
});

describe('sectionNavFor', () => {
  it('keeps a section bar for every path inside that section', () => {
    expect(sectionNavFor(routes.realms)?.ariaLabel).toBe('SIP navigation');
    expect(sectionNavFor(routes.subscribers)?.ariaLabel).toBe('SIP navigation');
    expect(sectionNavFor(routes.registrations)?.ariaLabel).toBe('SIP navigation');
  });

  it('shows the section bar on the section root itself', () => {
    expect(sectionNavFor(routes.sip)?.ariaLabel).toBe('SIP navigation');
    expect(sectionNavFor(routes.media)?.ariaLabel).toBe('Media navigation');
  });

  it('gives the overview no section bar rather than an empty one', () => {
    expect(sectionNavFor(routes.home)).toBeUndefined();
  });

  it('matches on a path boundary, not on a bare prefix', () => {
    // `/mediaserver` is not inside `/media`, and a `startsWith` says it is.
    // Getting this wrong puts the Media bar above an unrelated page.
    expect(sectionNavFor('/mediaserver')).toBeUndefined();
    expect(sectionNavFor('/sipstack')).toBeUndefined();
  });

  it('has no unreachable links in any section bar', () => {
    const known = new Set<string>(Object.values(routes));
    for (const item of topNav) {
      for (const child of sectionNavFor(item.to)?.items ?? []) {
        expect(known).toContain(child.to);
      }
    }
  });
});
