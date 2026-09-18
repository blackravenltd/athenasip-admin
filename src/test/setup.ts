import { afterEach } from 'vitest';

// Suites that render run in jsdom via an `@vitest-environment jsdom` comment
// at the top of the file; the rest run in the fast node environment with no
// DOM at all, so only the former have anything to unmount.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
