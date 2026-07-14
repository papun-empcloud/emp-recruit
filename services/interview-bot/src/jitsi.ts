// Joins a Jitsi (meet.jit.si) room with a headless Chromium via Puppeteer.
//
// The prejoin screen is skipped and the display name set through Jitsi's URL
// config overrides (#config.* / #userInfo.*). We rely on Chromium using the
// PulseAudio virtual devices (set as defaults in audio.ts) for mic/speaker.
//
// NOTE (PoC): join detection and participant count use Jitsi's internal
// `window.APP.conference` API, which is not a stable public contract — selectors
// may need updating for a given deployment. Self-hosting Jitsi + the iframe/
// external API would make this far more robust than driving meet.jit.si.

import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { config } from "./config.js";

export interface JitsiSession {
  browser: Browser;
  page: Page;
}

export async function joinRoom(): Promise<JitsiSession> {
  const browser = await puppeteer.launch({
    executablePath: config.chromiumPath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--use-fake-ui-for-media-stream", // auto-accept the mic/camera permission prompt
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const page = await browser.newPage();

  const url = new URL(config.roomUrl);
  url.hash = [
    "config.prejoinConfig.enabled=false",
    "config.prejoinPageEnabled=false",
    "config.startWithVideoMuted=true",
    "config.disableModeratorIndicator=true",
    `userInfo.displayName="${config.botName}"`,
  ].join("&");

  await page.goto(url.toString(), { waitUntil: "networkidle2", timeout: 60000 });

  // Best-effort: wait until the conference reports it has joined.
  await page
    .waitForFunction(() => (window as any).APP?.conference?.isJoined?.() === true, { timeout: 60000 })
    .catch(() => {
      /* internal API may differ; continue anyway */
    });

  return { browser, page };
}

/** Number of other (human) participants currently in the room. */
export async function participantCount(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      try {
        return (window as any).APP?.conference?.membersCount ?? 0;
      } catch {
        return 0;
      }
    })
    .catch(() => 0);
}

export async function leave(session: JitsiSession): Promise<void> {
  try {
    await session.browser.close();
  } catch {
    /* ignore */
  }
}
