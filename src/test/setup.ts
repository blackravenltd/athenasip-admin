import { afterEach } from 'vitest';

// Suites that render opt in to jsdom with an `@vitest-environment jsdom`
// comment; the rest run in the node environment and have nothing to unmount.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
