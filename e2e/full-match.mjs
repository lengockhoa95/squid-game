// E2E: run against a running client + server (./scripts/dev.sh, or preview + server).
// Env: BASE_URL (default http://localhost:5173/), CHROME_PATH (default /usr/bin/google-chrome),
// first CLI arg: screenshot folder (default ./e2e-shots).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
const CHROME_PATH = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const log = (...a) => console.log(new Date().toISOString().slice(14, 19), ...a);
const browser = await chromium.launch({
  executablePath: CHROME_PATH, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(BASE_URL);
// Low quality keeps software rendering fast enough.
await page.getByRole('button', { name: 'Thấp' }).click();
await page.getByPlaceholder('Nhập tên').fill('Khoa');
await page.getByRole('button', { name: 'Tạo phòng' }).click();
await page.locator('.code-value').waitFor();
const bots = await page.locator('.slot-bot').count();
log('lobby ready, planned NPC cards:', bots);
await page.locator('.npc-row').nth(0).getByRole('button', { name: 'Thông minh' }).click();
await page.locator('.npc-row').nth(1).getByRole('button', { name: 'Dễ' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/m-0-lobby.png` });
await page.getByRole('button', { name: 'Sẵn sàng!' }).click();
await page.getByRole('button', { name: 'Bắt đầu' }).click();

const shots = new Set();
const geometries = [];
let lastPhaseKey = '';
let wHeld = false;
let debugOn = false;
const deadline = Date.now() + 9 * 60 * 1000;
while (Date.now() < deadline) {
  const info = await page.evaluate(() => {
    const title = document.querySelector('.round-header strong')?.textContent ?? '';
    const phase = document.querySelector('.rules-card') ? 'intro'
      : document.querySelector('.countdown') ? 'countdown'
      : document.querySelector('.results-card') ? 'result'
      : document.querySelector('.winner-card') ? 'end'
      : document.querySelector('.code-value') ? 'lobby'
      : document.querySelector('.game-hud') ? 'playing' : 'other';
    const geo = document.querySelector('.debug')?.textContent?.match(/Geometries (\d+)/)?.[1];
    return {
      title, phase, geo,
      green: !!document.querySelector('.light-pill.is-green'),
      go: !!document.querySelector('.reaction-big.stage-go'),
      spectating: !!document.querySelector('.status-banner.is-spectating'),
      winner: document.querySelector('.winner-name')?.textContent ?? '',
      results: [...document.querySelectorAll('.results li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim()),
    };
  });
  if (!debugOn && info.phase === 'intro') { await page.keyboard.press('F3'); debugOn = true; }
  const key = `${info.phase}:${info.title}`;
  if (key !== lastPhaseKey) {
    log('phase', key, info.geo ? `(geometries ${info.geo})` : '', info.spectating ? '[spectating]' : '');
    if (info.phase === 'intro' && info.geo) geometries.push(`${info.title}:${info.geo}`);
    if (info.phase === 'result') info.results.forEach((r) => log('   ', r));
    lastPhaseKey = key;
  }
  const shotKey = `${info.phase}-${info.title}`;
  if (['intro', 'result', 'end'].includes(info.phase) && !shots.has(info.phase === 'end' ? 'end' : shotKey) && shots.size < 30) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/m-${shots.size + 1}-${info.phase}.png` });
    shots.add(info.phase === 'end' ? 'end' : shotKey);
  }
  if (info.phase === 'playing' && !shots.has('play-' + info.title)) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/m-${shots.size + 1}-play.png` });
    shots.add('play-' + info.title);
  }
  if (info.phase === 'end') {
    log('WINNER:', info.winner);
    await page.locator('.code-value').waitFor({ timeout: 20000 });
    log('back in lobby after match');
    break;
  }
  // Play like a (simple) human.
  if (info.phase === 'playing' && !info.spectating) {
    const t = info.title;
    if (t.includes('Đèn')) {
      if (info.green && !wHeld) { await page.keyboard.down('KeyW'); wHeld = true; }
      if (!info.green && wHeld) { await page.keyboard.up('KeyW'); wHeld = false; }
    } else if (t.includes('Chướng')) {
      if (!wHeld) { await page.keyboard.down('KeyW'); wHeld = true; }
      if (Math.random() < 0.25) await page.keyboard.press('Space');
    } else if (t.includes('Kéo')) {
      await page.keyboard.press('Space');
    } else if (t.includes('Phản')) {
      if (info.go) { await page.waitForTimeout(220); await page.keyboard.press('Space'); }
    } else if (t.includes('Cầu')) {
      if (Math.random() < 0.15) await page.keyboard.press(Math.random() < 0.5 ? 'KeyA' : 'KeyD');
    }
  } else if (wHeld) { await page.keyboard.up('KeyW'); wHeld = false; }
  await page.waitForTimeout(60);
}
log('intro geometries per round:', geometries.join(' | '));
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
