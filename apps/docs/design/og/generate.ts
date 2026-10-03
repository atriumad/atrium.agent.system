/**
 * Builds the HTML sources for the social preview images (1200×630) and the touch icon.
 * Avatars come from the same Blobatar seeds, palettes and expressions as the home page.
 *
 *   bun design/og/generate.ts
 *
 * Then capture each page at its size to static/img/ (see design/og/README.md).
 */
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {blobatar} from 'blobatar';
import {agents} from '../../src/data/agents';

const locales = {
  en: {before: 'A system that turns strangers into', em: 'regulars', roles: false},
  es: {before: 'Un sistema que convierte extraños en', em: 'regulares', roles: false},
} as const;

const font =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500&display=swap";

const card = (a: (typeof agents)[number]) => `
  <div class="card" style="background:${a.card.bg};color:${a.card.fg}">
    <div class="av">${blobatar(a.seed, {expression: a.expression, palette: a.palette})}</div>
    <div class="nm">${a.name}</div>
    <div class="rl">${a.role}</div>
  </div>`;

const og = (l: (typeof locales)[keyof typeof locales]) => `<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="${font}">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#ffffff;color:#16232b;font-family:'Inter Tight',system-ui,sans-serif;position:relative}
.glow{position:absolute;inset:-40% -12% auto 40%;height:140%;pointer-events:none;
  background:radial-gradient(50% 50% at 60% 26%,rgba(184,232,154,.42) 0%,rgba(184,232,154,.14) 40%,transparent 70%)}
h1{position:absolute;left:64px;top:70px;width:1060px;font-weight:400;font-size:96px;line-height:1.02;letter-spacing:-.04em;color:#16232b}
h1 em{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:1.1em;letter-spacing:-.01em;color:#0e6e64;
  background:linear-gradient(transparent 70%,rgba(255,201,51,.5) 70%);padding:0 .04em}
.row{position:absolute;left:64px;right:64px;bottom:60px;display:grid;grid-template-columns:repeat(6,1fr);gap:14px}
.card{position:relative;height:228px;border-radius:24px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(4,47,52,.08)}
.av{position:absolute;left:2%;top:-4px;width:96%}
.av svg{display:block;width:100%;height:auto}
.nm{position:absolute;left:18px;bottom:38px;font-size:25px;letter-spacing:-.02em}
.rl{position:absolute;left:18px;bottom:16px;font-size:13px;opacity:.72}
</style></head><body>
<div class="glow"></div>
<h1>${l.before} <em>${l.em}</em>.</h1>
<div class="row">${agents.map(card).join('')}</div>
</body></html>`;

const touch = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0}html,body{width:180px;height:180px}
body{background:#042f34;display:grid;place-items:center}
</style></head><body><svg width="124" height="124" viewBox="0 0 32 32"><path d="M9 23 16 8l7 15M11.6 18h8.8" fill="none" stroke="#b8e89a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></body></html>`;

for (const [code, l] of Object.entries(locales)) {
  writeFileSync(fileURLToPath(new URL(`./og-${code}.html`, import.meta.url)), og(l));
}
writeFileSync(fileURLToPath(new URL('./apple-touch-icon.html', import.meta.url)), touch);
console.log('written: og-en.html, og-es.html, apple-touch-icon.html');
