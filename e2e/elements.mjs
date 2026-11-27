// E2E: element mode. 1 human + 3 SMART NPCs; the human picks an element in each intro and casts it
// (button + ground click, and the F key) while playing. Run against a running client + server.
// Env: BASE_URL (default http://localhost:5173/), CHROME_PATH; first CLI arg: screenshot folder.
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
await page.getByRole('button', { name: 'Thấp' }).click();
await page.getByPlaceholder('Nhập tên').fill('Khoa');
await page.getByRole('button', { name: 'Tạo phòng' }).click();
await page.locator('.code-value').waitFor();
// First visit: the how-to-play guide opens by itself in the lobby. Check every tab, then close it.
await page.locator('.howto').waitFor({ timeout: 5000 });
for (const [i, tab] of ['Điều khiển', 'Nguyên tố', 'Thẻ kỹ năng', 'Minigame & chế độ'].entries()) {
  await page.locator('.howto-tabs').getByRole('tab', { name: tab }).click();
  await page.screenshot({ path: `${out}/e-guide-${i}.png` });
}
await page.getByRole('button', { name: 'Đóng' }).click();
await page.locator('.howto').waitFor({ state: 'detached' });
for (let i = 0; i < 3; i++) await page.locator('.npc-row').nth(i).getByRole('button', { name: 'Thông minh' }).click();
await page.locator('.elements-toggle').waitFor();
if (process.env.NO_ELIM) {
  await page.locator('.no-elim-toggle').getByRole('button', { name: 'Bật' }).click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${out}/e-0-lobby.png` });
await page.getByRole('button', { name: 'Sẵn sàng!' }).click();
await page.getByRole('button', { name: 'Bắt đầu' }).click();

const PICKS = process.env.PICKS ? process.env.PICKS.split(',') : ['Hoán đổi', 'Phân thân', 'Không gian', 'Bóng tối', 'Lôi'];
let round = 0;
let lastKey = '';
let casts = 0;
let accepted = 0;
let shots = 0;
let wHeld = false;
let seenStun = false;
let seenDark = false;
const draftedIn = new Set();
const pickedIn = new Set();
const deadline = Date.now() + 9 * 60 * 1000;
while (Date.now() < deadline) {
  const info = await page.evaluate(() => ({
    title: document.querySelector('.round-header strong')?.textContent ?? '',
    phase: document.querySelector('.rules-card') ? 'intro'
      : document.querySelector('.countdown') ? 'countdown'
      : document.querySelector('.results-card') ? 'result'
      : document.querySelector('.winner-card') ? 'end'
      : document.querySelector('.code-value') ? 'lobby'
      : document.querySelector('.game-hud') ? 'playing' : 'other',
    options: [...document.querySelectorAll('.element-option .element-name')].map((e) => e.textContent),
    picked: document.querySelector('.element-option.is-picked .element-name')?.textContent ?? '',
    cast: document.querySelector('.element-cast .element-name')?.textContent ?? '',
    cd: document.querySelector('.element-cd')?.textContent ?? '',
    spectating: !!document.querySelector('.status-banner.is-spectating'),
    stunned: getComputedStyle(document.querySelector('.stun-banner') ?? document.body).display !== 'none' && !!document.querySelector('.stun-banner'),
    dark: Number(document.querySelector('.dark-overlay')?.style.opacity ?? 0) > 0,
    green: !!document.querySelector('.light-pill.is-green'),
    winner: document.querySelector('.winner-name')?.textContent ?? '',
  }));
  const key = `${info.phase}:${info.title}`;
  if (key !== lastKey) {
    log('phase', key, info.cast ? `[element ${info.cast}]` : '');
    lastKey = key;
  }
  if (info.phase === 'intro' && info.options.length > 0 && !pickedIn.has(info.title)) {
    const pool = info.options.filter((o) => PICKS.includes(o));
    const want = process.env.RANDOM_PICK ? info.options[Math.floor(Math.random() * info.options.length)] : pool[0] ?? info.options[0];
    await page.locator('.element-option', { hasText: want }).first().click();
    await page.waitForTimeout(500);
    const picked = await page.locator('.element-option.is-picked .element-name').textContent();
    log('  options:', info.options.join(', '), '→ picked', picked);
    if (picked !== want) errors.push(`pick failed: wanted ${want}, got ${picked}`);
    await page.screenshot({ path: `${out}/e-${++shots}-pick.png` });
    pickedIn.add(info.title);
    round++;
  }
  if (info.phase === 'result' && !draftedIn.has(lastKey)) {
    const cards = page.locator('.skill-card');
    if (await cards.count()) {
      draftedIn.add(lastKey);
      const names = await page.locator('.skill-card strong').allInnerTexts();
      await page.screenshot({ path: `${out}/e-draft-${draftedIn.size}.png` });
      await cards.first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(400);
      const gone = (await page.locator('.skill-card').count()) === 0;
      const bar = await page.locator('.card-chip').count();
      log(`  draft: ${names.join(', ')} → picked ${names[0]} (offer closed: ${gone}, cards owned: ${bar})`);
      if (!gone) errors.push('card pick did not close the offer');
    }
  }
  if (info.phase === 'lobby' && round > 0) {
    errors.push('back in the lobby without seeing the winner screen');
    break;
  }
  if (info.phase === 'end') {
    log('WINNER:', info.winner);
    await page.screenshot({ path: `${out}/e-${++shots}-end.png` });
    break;
  }
  if (info.stunned && !seenStun) { seenStun = true; log('  >> got stunned by lightning'); await page.screenshot({ path: `${out}/e-stunned.png` }); }
  if (info.dark && !seenDark) { seenDark = true; log('  >> screen darkened'); await page.screenshot({ path: `${out}/e-dark.png` }); }
  if (info.phase === 'playing' && !info.spectating) {
    const t = info.title;
    const movement = t.includes('Đèn') || t.includes('Chướng') || t.includes('Sàn');
    if (movement) {
      if ((t.includes('Chướng') || t.includes('Sàn') || info.green) && !wHeld) { await page.keyboard.down('KeyW'); wHeld = true; }
      if (t.includes('Sàn')) {
        // Keep moving on the collapsing floor: steer left/right now and then, hop a lot.
        if (Math.random() < 0.3) await page.keyboard.press('Space');
        if (Math.random() < 0.15) { const k = Math.random() < 0.5 ? 'KeyA' : 'KeyD'; await page.keyboard.down(k); await page.waitForTimeout(250); await page.keyboard.up(k); }
      }
      if (t.includes('Đèn') && !info.green && wHeld) { await page.keyboard.up('KeyW'); wHeld = false; }
    } else if (t.includes('Kéo')) {
      await page.keyboard.press('Space');
    } else if (t.includes('Phản')) {
      if (await page.locator('.reaction-big.stage-go').count()) { await page.waitForTimeout(200); await page.keyboard.press('Space'); }
    } else if (t.includes('Cầu') && Math.random() < 0.1) {
      await page.keyboard.press(Math.random() < 0.5 ? 'KeyA' : 'KeyD');
    }
    if (info.cd === 'Sẵn sàng' && info.cast) {
      casts++;
      const how = movement ? ['click', 'button', 'F'][casts % 3] : 'button';
      if (how === 'click') {
        // Primary: walking is keyboard-only, a left click on the ground uses the element there.
        await page.mouse.click(550, 260);
      } else if (how === 'button') {
        // Short timeout: the round may end (and the button vanish) between the check and the click.
        await page.locator('.element-cast').click({ timeout: 1500 }).catch(() => {});
        if (movement && await page.locator('.element-cast.is-aiming').count()) await page.mouse.click(550, 260);
      } else {
        await page.mouse.move(560, 280);
        await page.keyboard.press('KeyF');
      }
      await page.waitForTimeout(250);
      const cd = await page.locator('.element-cd').textContent({ timeout: 500 }).catch(() => '');
      if (cd && cd !== 'Sẵn sàng') accepted++;
      log(`  cast ${info.cast} (${how}) → ${cd}`);
      if (shots < 25) await page.screenshot({ path: `${out}/e-${++shots}-cast.png` });
    }
  } else if (wHeld) { await page.keyboard.up('KeyW'); wHeld = false; }
  await page.waitForTimeout(80);
}
log(`rounds ${round}, casts tried ${casts}, accepted ${accepted}`);
console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
