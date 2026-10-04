import { defineConfig } from '@playwright/test';

/**
 * End-to-end specs against a running interop fixture. The server's checkout
 * brings the fixture up (`test/interop/up.sh --rtpengine`); this
 * configuration never starts it.
 *
 * Chromium's fake media devices stand in for a microphone and camera, and
 * loopback is a secure context, so `getUserMedia` needs no hardware, prompt
 * or flag.
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
