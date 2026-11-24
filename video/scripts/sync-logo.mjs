// Copies the exact logo files from design/logo/svg and extracts their path data for the film.
// The film never redraws the logo: geometry and colours come from these files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SRC = path.resolve('../design/logo/svg');
const files = ['vaanika-mark-colour-for-dark-bg.svg', 'vaanika-stacked-colour-transparent-for-dark-bg.svg', 'vaanika-horizontal-colour-transparent-for-dark-bg.svg'];
fs.mkdirSync('public/logo', { recursive: true });
const out = { source: {}, mark: [], stacked: { viewBox: '', defs: '', wordmark: [], tagline: '', markGroup: '' } };
for (const f of files) {
  const buf = fs.readFileSync(path.join(SRC, f));
  fs.writeFileSync(path.join('public/logo', f), buf);
  out.source[f] = crypto.createHash('sha256').update(buf).digest('hex');
}
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

// Mark: the five elements inside the transformed group, in drawing order.
const mark = fs.readFileSync(path.join(SRC, files[0]), 'utf8');
const g = mark.match(/<g transform="([^"]+)">([\s\S]*?)<\/g>/);
out.markTransform = g[1];
const names = ['saraswati', 'kali', 'lakshmi', 'chandra', 'base'];
[...g[2].matchAll(/<path [^>]*\/>/g)].forEach((m, i) => out.mark.push({ name: names[i], ...attrs(m[0]) }));

// Stacked lockup: defs, mark group, wordmark letters and the PRIVATE AVIATION group, verbatim.
const st = fs.readFileSync(path.join(SRC, files[1]), 'utf8');
out.stacked.viewBox = st.match(/viewBox="([^"]+)"/)[1];
out.stacked.defs = st.match(/<defs>[\s\S]*?<\/defs>/)[0];
out.stacked.markGroup = st.match(/<g transform="[^"]+">[\s\S]*?<\/g>/)[0];
const afterMark = st.slice(st.indexOf(out.stacked.markGroup) + out.stacked.markGroup.length);
const letters = afterMark.slice(0, afterMark.indexOf('<g fill='));
out.stacked.wordmark = [...letters.matchAll(/<path [^>]*\/>/g)].map((m) => attrs(m[0]));
out.stacked.tagline = afterMark.match(/<g fill="[^"]+">[\s\S]*?<\/g>/)[0];
fs.writeFileSync('src/data/logo.json', JSON.stringify(out, null, 1));
console.log('mark elements:', out.mark.map((m) => m.name).join(', '));
console.log('wordmark letters:', out.stacked.wordmark.length, 'fills:', out.stacked.wordmark.map((w) => w.fill).join(' '));
console.log('transform:', out.markTransform);
