#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { run } from '../src/index.js';

const HELP = `hearsite — hear your website the way a screen reader user does

Usage
  hearsite <url or html file> [options]

Output
  -o, --out <file>     Video to write (default: hearsite.mp4). A transcript
                       with the full reading order is written next to it.
      --no-video       Write only the transcript

What to read
  -n, --max <n>        Most announcements to put in the video (default: 60)
      --start <n>      Skip this many announcements first (default: 0)
      --wait <ms>      Pause after the page loads (default: 800)

How it sounds
      --rate <wpm>     Speaking speed in words per minute (default: 200)
      --voice <name>   Voice to use (macOS: see "say -v ?")
      --silent         Captions only, no voice

How it looks
      --width <px>     Viewport width (default: 1280)
      --height <px>    Viewport height (default: 720)
      --mobile         Phone viewport (390 x 720, touch)
      --scale <n>      Pixel density, 2 for a sharper video (default: 1)

  -h, --help           Show this help

The reading order comes from the browser's accessibility tree. It is a
simulation: real screen readers such as VoiceOver, NVDA and JAWS differ
in wording and behaviour.
`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o', default: 'hearsite.mp4' },
      'no-video': { type: 'boolean', default: false },
      max: { type: 'string', short: 'n', default: '60' },
      start: { type: 'string', default: '0' },
      wait: { type: 'string', default: '800' },
      rate: { type: 'string', default: '200' },
      voice: { type: 'string' },
      silent: { type: 'boolean', default: false },
      width: { type: 'string' },
      height: { type: 'string', default: '720' },
      mobile: { type: 'boolean', default: false },
      scale: { type: 'string', default: '1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
} catch (err) {
  console.error(`${err.message}\n\nRun "hearsite --help" for usage.`);
  process.exit(2);
}

const { values: v, positionals } = parsed;
if (v.help || !positionals.length) {
  console.log(HELP);
  process.exit(v.help ? 0 : 2);
}

function num(name, { min = 0, integer = false } = {}) {
  const n = Number(v[name]);
  if (!Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))) {
    console.error(`--${name} must be ${integer ? 'a whole number' : 'a number'} of at least ${min}.`);
    process.exit(2);
  }
  return n;
}

const even = (n) => n - (n % 2);
if (v.width === undefined) v.width = v.mobile ? '390' : '1280';

try {
  const result = await run({
    target: positionals[0],
    out: v.out,
    video: !v['no-video'],
    max: num('max', { min: 1, integer: true }),
    start: num('start', { integer: true }),
    wait: num('wait'),
    rate: num('rate', { min: 80, integer: true }),
    voice: v.voice,
    silent: v.silent,
    width: even(num('width', { min: 320, integer: true })),
    height: even(num('height', { min: 320, integer: true })),
    mobile: v.mobile,
    scale: num('scale', { min: 1 }),
  });
  console.error('');
  for (const file of result.outputs) console.log(file);
  const { findings } = result.report;
  console.error(findings.length ? `\nWhat a listener runs into:\n${findings.map((f) => `  - ${f}`).join('\n')}` : '\nNothing unlabelled was found.');
} catch (err) {
  console.error(`\nhearsite: ${err.message}`);
  process.exit(1);
}
