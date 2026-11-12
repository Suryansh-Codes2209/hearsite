import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BAR, frameHtml, introHtml, listenTime, outroHtml } from './cards.js';
import { announcements, audit } from './read.js';
import { silence, speak, speechEngine } from './speech.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function resolveTarget(target) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
  if (fs.existsSync(target)) return pathToFileURL(path.resolve(target)).href;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(target)) return `http://${target}`;
  return `https://${target}`;
}

async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed. Run: npm install playwright');
  }
  try {
    return await chromium.launch();
  } catch (err) {
    if (/Executable doesn't exist|playwright install/i.test(String(err))) {
      throw new Error('Chromium for Playwright is missing. Run: npx playwright install chromium');
    }
    throw err;
  }
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) reject(new Error(err.code === 'ENOENT' ? 'ffmpeg not found. Install it (macOS: brew install ffmpeg).' : `ffmpeg failed: ${stderr || err.message}`));
      else resolve();
    });
  });
}

/** Scroll the element into view and return its box on screen, or null if it has none. */
async function locate(cdp, backendNodeId, viewport) {
  if (!backendNodeId) return null;
  try {
    await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId });
    const { quads } = await cdp.send('DOM.getContentQuads', { backendNodeId });
    if (!quads?.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const q of quads) {
      for (let i = 0; i < 8; i += 2) {
        x1 = Math.min(x1, q[i]);
        x2 = Math.max(x2, q[i]);
        y1 = Math.min(y1, q[i + 1]);
        y2 = Math.max(y2, q[i + 1]);
      }
    }
    x1 = Math.max(0, x1);
    y1 = Math.max(0, y1);
    x2 = Math.min(viewport.width, x2);
    y2 = Math.min(viewport.height, y2);
    if (x2 - x1 < 2 || y2 - y1 < 2) return null;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  } catch {
    return null;
  }
}

const setHighlight = (page, box) =>
  page.evaluate((b) => {
    let el = document.getElementById('__hearsite_focus');
    if (!b) return el?.remove();
    if (!el) {
      el = document.createElement('div');
      el.id = '__hearsite_focus';
      el.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(el);
    }
    el.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;
      left:${b.x - 5}px;top:${b.y - 5}px;width:${b.w + 10}px;height:${b.h + 10}px;
      border:3px solid #ff4d8d;border-radius:6px;background:rgba(255,77,141,.10);
      box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 9999px rgba(11,13,16,.28)`;
  }, box);

function transcript({ url, title, items, report, rate }) {
  const lines = [
    `What a screen reader says: ${title || 'Untitled page'}`,
    url,
    '',
    `${report.total} announcements, about ${listenTime(report, rate)} of listening at ${rate} words per minute.`,
    '',
    ...(report.findings.length ? ['What a listener runs into:', ...report.findings.map((f) => `  - ${f}`)] : ['Nothing unlabelled was found.']),
    '',
    'Reading order:',
    ...items.map((it, i) => `${String(i + 1).padStart(4)}. ${it.text}${it.issue ? `   [${it.issue}]` : ''}`),
    '',
    "Simulated from the browser's accessibility tree. Real screen readers differ in wording.",
    '',
  ];
  return lines.join('\n');
}

export async function run(opts, log = console.error) {
  const url = resolveTarget(opts.target);
  const viewport = { width: opts.width, height: opts.height };
  const out = path.resolve(opts.out);
  const txt = out.replace(/\.[^.]+$/, '') + '.txt';
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const browser = await launchBrowser();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearsite-'));
  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: opts.scale,
      isMobile: opts.mobile,
      hasTouch: opts.mobile,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    log(`Loading ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
    } catch {
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    }
    if (opts.wait) await sleep(opts.wait);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' }).catch(() => {});

    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const items = announcements(nodes);
    if (!items.length) throw new Error('The page exposed nothing to read.');
    const report = audit(items);
    const title = await page.title();

    fs.writeFileSync(txt, transcript({ url, title, items, report, rate: opts.rate }));
    log(`${report.total} announcements, about ${listenTime(report, opts.rate)} of listening.`);
    if (!opts.video) return { outputs: [txt], report, shown: 0 };

    const engine = opts.silent ? null : speechEngine();
    if (!engine && !opts.silent) log('No speech engine found (macOS say or espeak-ng). The video will have captions only.');

    const shown = items.slice(opts.start, opts.start + opts.max);
    const composer = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height + BAR },
      deviceScaleFactor: opts.scale,
    });
    const segments = [];
    const card = async (html, seconds, name) => {
      await composer.setContent(html, { waitUntil: 'load' });
      const image = path.join(tmp, `${name}.png`);
      await composer.screenshot({ path: image });
      const audio = path.join(tmp, `${name}.wav`);
      segments.push({ image, audio, seconds: await silence(seconds, audio) });
    };

    await card(introHtml({ ...viewport, title, url, report, shown: shown.length, rate: opts.rate }), 3.5, 'intro');

    for (let i = 0; i < shown.length; i++) {
      const item = shown[i];
      const box = await locate(cdp, item.backendNodeId, viewport);
      await setHighlight(page, box);
      const shot = await page.screenshot({ animations: 'disabled' });
      await composer.setContent(frameHtml({ shot, ...viewport, item, index: opts.start + i, total: report.total }), { waitUntil: 'load' });
      const image = path.join(tmp, `f${String(i).padStart(4, '0')}.png`);
      await composer.screenshot({ path: image });
      const audio = path.join(tmp, `f${String(i).padStart(4, '0')}.wav`);
      const seconds = await speak(item.text, audio, { engine, rate: opts.rate, voice: opts.voice });
      segments.push({ image, audio, seconds });
      if ((i + 1) % 10 === 0 || i === shown.length - 1) log(`  ${i + 1} of ${shown.length} narrated`);
    }
    await setHighlight(page, null);

    await card(outroHtml({ ...viewport, report, rate: opts.rate }), 6, 'outro');

    const q = (f) => `file '${f.replace(/'/g, "'\\''")}'`;
    const frames = path.join(tmp, 'frames.txt');
    const sound = path.join(tmp, 'sound.txt');
    fs.writeFileSync(
      frames,
      [...segments.flatMap((s) => [q(s.image), `duration ${s.seconds}`]), q(segments[segments.length - 1].image)].join('\n'),
    );
    fs.writeFileSync(sound, segments.map((s) => q(s.audio)).join('\n'));
    const total = segments.reduce((a, s) => a + s.seconds, 0);

    log('Rendering video…');
    await ffmpeg([
      '-f', 'concat', '-safe', '0', '-i', frames,
      '-f', 'concat', '-safe', '0', '-i', sound,
      '-t', String(total),
      '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-tune', 'stillimage',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      out,
    ]);
    return { outputs: [out, txt], report, shown: shown.length, seconds: total, voiced: Boolean(engine) };
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
