// End-to-end check against a local page with known accessibility problems.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearsite-test-'));
const page = path.join(tmp, 'page.html');
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

fs.writeFileSync(
  page,
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme Store</title>
<style>body{font-family:system-ui;margin:0}header,main,footer{padding:24px 40px}nav a{margin-right:16px}
.card{display:inline-block;width:220px;margin:0 16px 16px 0;padding:16px;border:1px solid #ddd;border-radius:8px}
.card img{width:100%;height:120px;background:#e5e7eb}.icon{width:36px;height:36px;border-radius:50%;border:0;background:#111}
main{min-height:1400px}</style></head><body>
<header><nav aria-label="Primary"><a href="/">Home</a><a href="/shop">Shop</a><a href="/cart"><img src="${pixel}" width="20" height="20"></a></nav></header>
<main>
  <h1>Summer sale</h1>
  <p>Everything is <a href="/sale">20% off</a> this week.</p>
  <h3>Popular right now</h3>
  <ul>
    <li class="card"><img src="${pixel}" alt="Blue canvas backpack"><div>Backpack</div><button>Add to cart</button></li>
    <li class="card"><img src="${pixel}"><div>Water bottle</div><button class="icon"></button></li>
  </ul>
  <form><input type="email" placeholder=""><label><input type="checkbox" checked> Send me offers</label><button disabled>Subscribe</button></form>
  <img src="${pixel}" alt="">
</main>
<footer>© Acme</footer></body></html>`,
);

const out = path.join(tmp, 'out.mp4');
const stdout = execFileSync(process.execPath, [path.join(here, '..', 'bin', 'hearsite.js'), page, '-o', out, '--max', '12'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
assert.ok(stdout.includes(out), 'prints the video path');

const text = fs.readFileSync(out.replace('.mp4', '.txt'), 'utf8');
const expectLine = (re, what) => assert.match(text, re, `transcript should include ${what}\n${text}`);
expectLine(/1\. Acme Store, web content/, 'the page title first');
expectLine(/Primary, navigation landmark/, 'the named navigation landmark');
expectLine(/link, Home/, 'a named link');
expectLine(/\d\. link {3}\[link has no name\]/, 'the image-only link with no name');
expectLine(/main landmark/, 'the main landmark');
expectLine(/heading level 1, Summer sale/, 'the level 1 heading');
expectLine(/link, 20% off/, 'the inline link');
expectLine(/heading level 3, Popular right now/, 'the level 3 heading');
expectLine(/list, 2 items/, 'the list with its size');
expectLine(/image, Blue canvas backpack/, 'the described image');
expectLine(/\d\. image {3}\[image has no description\]/, 'the undescribed image');
expectLine(/button, Add to cart/, 'the named button');
expectLine(/\d\. button {3}\[button has no name\]/, 'the unnamed button');
expectLine(/edit text {3}\[field has no label\]/, 'the unlabelled field');
expectLine(/checkbox, Send me offers, checked/, 'the checkbox with its state');
expectLine(/button, Subscribe, dimmed/, 'the disabled button');
expectLine(/content information landmark/, 'the footer landmark');

// The decorative image (alt="") must stay silent: exactly one undescribed image.
assert.equal((text.match(/\[image has no description\]/g) || []).length, 1);
for (const finding of ['1 image has no description', '1 link has no name', '1 button has no name', '1 form field has no label', '1 heading skips a level']) {
  assert.ok(text.includes(finding), `findings should include "${finding}"`);
}
assert.ok(!text.includes('no main landmark'), 'main landmark is present');

const info = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', out], { encoding: 'utf8' }),
);
const video = info.streams.find((s) => s.codec_type === 'video');
const audio = info.streams.find((s) => s.codec_type === 'audio');
assert.equal(video.codec_name, 'h264');
assert.equal(video.width, 1280);
assert.equal(video.height, 852);
assert.ok(audio, 'video has an audio track');
assert.ok(Number(info.format.duration) > 12, `duration ${info.format.duration}`);

console.log(`ok — ${Number(info.format.duration).toFixed(1)}s video with ${audio.codec_name} audio`);
console.log(`kept for inspection: ${tmp}`);
