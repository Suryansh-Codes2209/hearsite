export const BAR = 132;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BASE = `*{margin:0;box-sizing:border-box}
  body{background:#0b0d10;color:#f0f3f6;overflow:hidden;
    font:500 22px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .note{color:#8b949e;font-size:17px}`;

const KIND_COLOUR = {
  heading: '#a78bfa',
  link: '#58a6ff',
  button: '#3fb950',
  image: '#f0883e',
  field: '#e3b341',
  landmark: '#8b949e',
  list: '#8b949e',
  table: '#8b949e',
  control: '#3fb950',
  page: '#8b949e',
  text: '#8b949e',
};

/** One frame: the page with the current element outlined, and what is being said underneath. */
export function frameHtml({ shot, width, height, item, index, total }) {
  const pct = total > 1 ? (index / (total - 1)) * 100 : 100;
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
  body{width:${width}px;height:${height + BAR}px}
  img{display:block;width:${width}px;height:${height}px}
  .bar{position:relative;height:${BAR}px;display:flex;align-items:center;gap:22px;padding:6px 30px 0}
  .track{position:absolute;left:0;top:0;height:5px;width:100%;background:#1c2128}
  .fill{height:100%;width:${pct}%;background:#ff4d8d}
  .kind{flex:none;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
    color:#0b0d10;background:${KIND_COLOUR[item.kind] ?? '#8b949e'};padding:6px 10px;border-radius:6px}
  .said{flex:1;min-width:0;font-size:28px;font-weight:600;line-height:1.25;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .issue{flex:none;font-size:16px;font-weight:700;color:#ffb454;border:1.5px solid #ffb454;
    padding:5px 10px;border-radius:6px;white-space:nowrap}
  .n{flex:none;font-size:17px;color:#9aa4af;font-variant-numeric:tabular-nums;white-space:nowrap}
  </style><img src="data:image/png;base64,${shot.toString('base64')}">
  <div class="bar"><div class="track"><div class="fill"></div></div>
  <span class="kind">${esc(item.kind)}</span>
  <span class="said">“${esc(item.text)}”</span>
  ${item.issue ? `<span class="issue">${esc(item.issue)}</span>` : ''}
  <span class="n">${index + 1} of ${total}</span></div>`;
}

function minutes(words, rate) {
  const m = words / rate;
  if (m < 1) return `${Math.max(5, Math.round((m * 60) / 5) * 5)} seconds`;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)} minutes`;
}

export function listenTime(report, rate) {
  return minutes(report.words, rate);
}

export function introHtml({ width, height, title, url, report, shown, rate }) {
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
  body{width:${width}px;height:${height + BAR}px;padding:0 ${Math.round(width * 0.08)}px;
    display:flex;flex-direction:column;justify-content:center;gap:18px}
  .eyebrow{color:#ff4d8d;font-size:17px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
  h1{font-size:${width < 600 ? 34 : 52}px;line-height:1.1;font-weight:700;letter-spacing:-.02em;
    display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .url{color:#9aa4af;font:500 20px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
  .facts{margin-top:14px;font-size:24px;color:#c9d1d9}
  .facts b{color:#f0f3f6}
  </style>
  <div class="eyebrow">What a screen reader says</div>
  <h1>${esc(title || 'Untitled page')}</h1>
  <div class="url">${esc(url)}</div>
  <div class="facts"><b>${report.total}</b> announcements to read this page, about <b>${esc(minutes(report.words, rate))}</b> of listening.${
    shown < report.total ? ` Here are the first <b>${shown}</b>.` : ''
  }</div>
  <div class="note">Simulated from the browser's accessibility tree. Real screen readers differ in wording.</div>`;
}

export function outroHtml({ width, height, report, rate }) {
  const rows = report.findings.length
    ? report.findings.slice(0, 7).map((f) => `<li>${esc(f)}</li>`).join('')
    : '<li class="ok">Nothing unlabelled was found on this page</li>';
  return `<!doctype html><meta charset="utf-8"><style>${BASE}
  body{width:${width}px;height:${height + BAR}px;padding:0 ${Math.round(width * 0.08)}px;
    display:flex;flex-direction:column;justify-content:center;gap:16px}
  .eyebrow{color:#ff4d8d;font-size:17px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
  h1{font-size:${width < 600 ? 30 : 44}px;line-height:1.15;font-weight:700;letter-spacing:-.02em}
  ul{list-style:none;margin-top:8px;display:flex;flex-direction:column;gap:10px}
  li{font-size:${width < 600 ? 20 : 26}px;padding-left:34px;position:relative;color:#f0f3f6}
  li::before{content:"";position:absolute;left:4px;top:.42em;width:14px;height:14px;border-radius:50%;background:#ffb454}
  li.ok::before{background:#3fb950}
  </style>
  <div class="eyebrow">What a listener runs into</div>
  <h1>${report.total} announcements, about ${esc(minutes(report.words, rate))} to hear it all</h1>
  <ul>${rows}</ul>
  <div class="note">${report.headings} headings and ${report.links} links to navigate by. Made with hearsite.</div>`;
}
