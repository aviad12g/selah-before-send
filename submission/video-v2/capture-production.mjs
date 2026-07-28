#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(here, "clips");
const productionUrl =
  process.env.SELAH_PRODUCTION_URL ??
  "https://selah-before-send.aviadcoh.chatgpt.site";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewport = { width: 1920, height: 1080 };
const sampleDraft =
  "You don’t get to decide what mattered to me. You have no idea what I was carrying—maybe stop making everything about you.";
const safetyDraft =
  "I don’t want to be alive anymore. Nobody would miss me if I was gone.";

const clipSpecs = {
  "01": {
    filename: "01-composer-hook.mp4",
    duration: 12.436,
    capture: captureComposerHook,
  },
  "02": {
    filename: "02-pause-reveal.mp4",
    duration: 2.596,
    capture: capturePauseReveal,
  },
  "03": {
    filename: "03-live-result.mp4",
    duration: 21.532,
    capture: captureLiveResult,
  },
  "04": {
    filename: "04-agency.mp4",
    duration: 14.452,
    capture: captureAgency,
  },
  "05": {
    filename: "05-safety-stop.mp4",
    duration: 15.434,
    capture: captureSafetyStop,
  },
  "06": {
    filename: "06-architecture-bed.mp4",
    duration: 11.564,
    capture: captureArchitecture,
  },
  "07": {
    filename: "07-return-composer.mp4",
    duration: 3.105,
    capture: captureReturnComposer,
  },
};

const requested = parseRequestedClips(process.argv.slice(2));
const temporaryDirectory = await mkdtemp(join(tmpdir(), "selah-production-capture-"));
await mkdir(outputDirectory, { recursive: true });

let browser;
try {
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-features=Translate,MediaRouter",
      "--disable-notifications",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
    ],
  });

  for (const id of requested) {
    const spec = clipSpecs[id];
    const outputPath = join(outputDirectory, spec.filename);
    console.log(`Capturing ${spec.filename} from ${productionUrl}`);
    await recordClip(browser, spec, outputPath);
    const probe = await probeVideo(outputPath);
    console.log(
      `Verified ${spec.filename}: ${probe.width}x${probe.height}, ${probe.duration.toFixed(3)}s`,
    );
  }
} finally {
  if (browser) {
    await Promise.race([browser.close(), sleep(5_000)]).catch(() => {});
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function parseRequestedClips(args) {
  const value =
    args.find((argument) => argument.startsWith("--clips="))?.split("=")[1] ??
    "01,02,03,04,05,06,07";
  const clips = value
    .split(",")
    .map((clip) => clip.trim().padStart(2, "0"))
    .filter(Boolean);
  for (const clip of clips) {
    if (!clipSpecs[clip]) {
      throw new Error(`Unknown clip "${clip}". Choose from ${Object.keys(clipSpecs).join(", ")}.`);
    }
  }
  return clips;
}

async function recordClip(activeBrowser, spec, outputPath) {
  const rawDirectory = join(temporaryDirectory, spec.filename.replace(".mp4", ""));
  await mkdir(rawDirectory, { recursive: true });
  const context = await activeBrowser.newContext({
    viewport,
    screen: viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    recordVideo: {
      dir: rawDirectory,
      size: viewport,
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const openedAt = Date.now();
  const video = page.video();
  let captureResult;

  try {
    await preparePage(page);
    captureResult = await spec.capture(page);
    if (typeof captureResult === "number") {
      const elapsedSinceStart = Date.now() - captureResult;
      const minimumCaptureMilliseconds = Math.ceil(spec.duration * 1_000) + 800;
      if (elapsedSinceStart < minimumCaptureMilliseconds) {
        await sleep(minimumCaptureMilliseconds - elapsedSinceStart);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  if (!video || !captureResult) {
    throw new Error(`The browser did not produce a recording for ${spec.filename}.`);
  }

  const rawPath = await video.path();
  if (typeof captureResult === "number") {
    const offsetSeconds = Math.max(0, (captureResult - openedAt) / 1_000);
    await transcodeClip(rawPath, outputPath, offsetSeconds, spec.duration);
  } else {
    const segments = captureResult.segments.map((segment) => ({
      offset: Math.max(0, (segment.startedAt - openedAt) / 1_000),
      duration: Math.max(0.2, (segment.endedAt - segment.startedAt) / 1_000),
    }));
    await transcodeSegments(rawPath, outputPath, segments, spec.duration);
  }
}

async function preparePage(page) {
  await page.goto(productionUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.getByText("Mara wrote", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause before sending" }).waitFor();
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await installVisibleCursor(page);
  await moveMouse(page, 900, 940, 0);
}

async function installVisibleCursor(page) {
  await page.evaluate(() => {
    const existing = document.querySelector("#selah-capture-cursor");
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = "selah-capture-cursor-style";
    style.textContent = `
      #selah-capture-cursor {
        position: fixed;
        z-index: 2147483647;
        left: 0;
        top: 0;
        width: 18px;
        height: 18px;
        border: 2px solid #0b0d0b;
        border-radius: 50%;
        background: #c8ff4d;
        box-shadow: 0 0 0 2px rgba(200, 255, 77, 0.46);
        pointer-events: none;
        transform: translate(-50%, -50%);
        transition: width 120ms ease, height 120ms ease, box-shadow 120ms ease;
      }
      #selah-capture-cursor.is-clicking {
        width: 28px;
        height: 28px;
        box-shadow: 0 0 0 8px rgba(200, 255, 77, 0.18);
      }
    `;
    document.head.append(style);

    const cursor = document.createElement("div");
    cursor.id = "selah-capture-cursor";
    cursor.setAttribute("aria-hidden", "true");
    document.body.append(cursor);

    window.addEventListener(
      "pointermove",
      (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      },
      { passive: true },
    );
    window.addEventListener(
      "pointerdown",
      () => {
        cursor.classList.add("is-clicking");
      },
      { passive: true },
    );
    window.addEventListener(
      "pointerup",
      () => {
        window.setTimeout(() => cursor.classList.remove("is-clicking"), 120);
      },
      { passive: true },
    );
  });
}

async function captureComposerHook(page) {
  const textarea = page.getByLabel("Your reply");
  await textarea.fill("");
  await moveToLocator(page, textarea, 250);
  await textarea.click();
  const startedAt = Date.now();
  await sleep(700);
  await textarea.pressSequentially(sampleDraft, { delay: 54 });
  await sleep(850);
  await moveToLocator(page, page.getByRole("button", { name: "Send without pause" }), 1_250);
  await sleep(1_700);
  return startedAt;
}

async function capturePauseReveal(page) {
  const pause = page.getByRole("button", { name: "Pause before sending" });
  const startedAt = Date.now();
  await sleep(500);
  await moveToLocator(page, pause, 850);
  await sleep(280);
  await pause.click();
  await sleep(1_000);
  return startedAt;
}

async function captureLiveResult(page) {
  await openLiveResult(page);
  const startedAt = Date.now();
  await moveToLocator(page, page.getByText("LIVE API PATH", { exact: true }), 700);
  await sleep(2_500);
  const contextButton = page.getByRole("button", { name: "Read passage context" });
  await moveToLocator(page, contextButton, 850);
  await contextButton.click();
  await page.locator("#passage-context").waitFor();
  await sleep(6_000);
  await moveMouse(page, 1_460, 680, 900);
  await sleep(4_500);
  await moveMouse(page, 1_460, 940, 850);
  await sleep(4_500);
  return startedAt;
}

async function captureAgency(page) {
  await openLiveResult(page);
  const firstSegmentStartedAt = Date.now();
  const privateQuestion = page.locator(".private-question");
  await moveToLocator(page, privateQuestion, 500);
  await sleep(900);
  const editButton = page.getByRole("button", { name: "Edit in my own words" });
  await moveToLocator(page, editButton, 450);
  await editButton.click();
  await page.locator(".edit-coach").waitFor();
  await sleep(3_600);
  const firstSegmentEndedAt = Date.now();

  const pauseAgain = page.getByRole("button", { name: "Pause before sending" });
  await pauseAgain.click();
  await page.getByText("LIVE API PATH", { exact: true }).waitFor({ timeout: 150_000 });
  await sleep(500);
  const secondSegmentStartedAt = Date.now();
  const sendAnyway = page.getByRole("button", { name: "Send anyway" });
  await moveToLocator(page, sendAnyway, 450);
  await sleep(750);
  const holdButton = page.getByRole("button", { name: "Pause 10 minutes" });
  await moveToLocator(page, holdButton, 450);
  await holdButton.click();
  await page.getByText("DRAFT HELD", { exact: true }).waitFor();
  await sleep(4_000);
  const secondSegmentEndedAt = Date.now();
  return {
    segments: [
      { startedAt: firstSegmentStartedAt, endedAt: firstSegmentEndedAt },
      { startedAt: secondSegmentStartedAt, endedAt: secondSegmentEndedAt },
    ],
  };
}

async function captureSafetyStop(page) {
  const textarea = page.getByLabel("Your reply");
  await textarea.fill(safetyDraft);
  await moveToLocator(page, textarea, 350);
  const startedAt = Date.now();
  await sleep(1_600);
  const pause = page.getByRole("button", { name: "Pause before sending" });
  await moveToLocator(page, pause, 750);
  await pause.click();
  const alert = page.getByRole("alert");
  await alert.waitFor({ timeout: 30_000 });
  await page
    .getByRole("link", { name: "Find a verified helpline in your country" })
    .waitFor();
  await moveToLocator(
    page,
    page.getByRole("link", { name: "Find a verified helpline in your country" }),
    700,
  );
  await sleep(7_500);
  return startedAt;
}

async function captureArchitecture(page) {
  await page.evaluate(() => {
    document.body.style.paddingBottom = "720px";
  });
  const architecture = page.locator(".architecture-strip");
  await architecture.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const element = document.querySelector(".architecture-strip");
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: "instant" });
  });
  await sleep(600);
  const startedAt = Date.now();
  await moveMouse(page, 825, 565, 700);
  await sleep(3_000);
  await moveMouse(page, 1_185, 565, 1_100);
  await sleep(3_000);
  await moveMouse(page, 1_520, 565, 1_100);
  await sleep(2_100);
  return startedAt;
}

async function captureReturnComposer(page) {
  const pause = page.getByRole("button", { name: "Pause before sending" });
  const startedAt = Date.now();
  await sleep(500);
  await moveToLocator(page, pause, 1_150);
  await sleep(1_200);
  return startedAt;
}

async function openLiveResult(page) {
  await page.getByRole("button", { name: "Pause before sending" }).click();
  await page.getByText("LIVE API PATH", { exact: true }).waitFor({
    timeout: 150_000,
  });
  await page.locator(".copyright").waitFor();
  await sleep(700);
}

async function moveToLocator(page, locator, duration = 500) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not find a visible target for the recorded cursor.");
  await moveMouse(
    page,
    Math.round(box.x + box.width / 2),
    Math.round(box.y + box.height / 2),
    duration,
  );
}

async function moveMouse(page, x, y, duration = 500) {
  const steps = Math.max(1, Math.round(duration / 25));
  await page.mouse.move(x, y, { steps });
}

async function transcodeClip(rawPath, outputPath, offsetSeconds, durationSeconds) {
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    offsetSeconds.toFixed(3),
    "-i",
    rawPath,
    "-vf",
    "fps=30,scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=30",
    "-t",
    durationSeconds.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function transcodeSegments(
  rawPath,
  outputPath,
  segments,
  durationSeconds,
) {
  const filters = [];
  const inputs = [];
  segments.forEach((segment, index) => {
    filters.push(
      `[0:v]trim=start=${segment.offset.toFixed(3)}:duration=${segment.duration.toFixed(3)},setpts=PTS-STARTPTS[v${index}]`,
    );
    inputs.push(`[v${index}]`);
  });
  filters.push(
    `${inputs.join("")}concat=n=${segments.length}:v=1:a=0,fps=30,scale=1920:1080:flags=lanczos,tpad=stop_mode=clone:stop_duration=30[out]`,
  );
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    rawPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-t",
    durationSeconds.toFixed(3),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function probeVideo(path) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    path,
  ]);
  const probe = JSON.parse(stdout);
  const width = Number(probe.streams?.[0]?.width);
  const height = Number(probe.streams?.[0]?.height);
  const duration = Number(probe.format?.duration);
  if (width !== viewport.width || height !== viewport.height) {
    throw new Error(`${path} is ${width}x${height}; expected 1920x1080.`);
  }
  return { width, height, duration };
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}
