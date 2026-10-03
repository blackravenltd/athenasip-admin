import { defineConfig } from '@playwright/test';

/**
 * The browser end of AthenaSIP's end-to-end run.
 *
 * Two Chromium contexts open the softphone page against a running interop
 * fixture (`test/interop/up.sh --rtpengine` in the server's checkout) and
 * call each other through it. The fixture is brought up by the server's own
 * scripts, never by this configuration: what is under test is the node and
 * the engine, and a harness that started them itself would be testing its own
 * arrangement of them.
 *
 * Chromium's fake media devices stand in for a microphone, so the run needs no
 * hardware and no permission prompt. The page is opened over loopback, which
 * is a secure context, so `getUserMedia` needs no flag either.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'e2e/results/playwright',
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
});
