// E2E: run against a running client + server (./scripts/dev.sh, or preview + server).
// Env: BASE_URL (default http://localhost:5173/), CHROME_PATH (default /usr/bin/google-chrome),
// first CLI arg: screenshot folder (default ./e2e-shots).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/';
const CHROME_PATH = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const log = (...a) => console.log('•', ...a);
const fail = (m) => { console.log('✘ FAIL:', m); process.exitCode = 1; };
const check = (cond, m) => (cond ? log('✔', m) : fail(m));
const browser = await chromium.launch({
  executablePath: CHROME_PATH, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errors = [];
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  await ctx.addInitScript(() => localStorage.setItem('sp.howToSeen', '1')); // skip the first-visit guide
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Thấp' }).click();
  await page.getByPlaceholder('Nhập tên').fill(name);
  return page;
}
const A = await player('Anh');
await A.getByRole('button', { name: 'Tạo phòng' }).click();
const code = (await A.locator('.code-value').innerText()).trim();
const B = await player('Bảo');
await B.getByLabel('Mã phòng').fill(code);
await B.getByRole('button', { name: 'Vào phòng' }).click();
await B.locator('.code-value').waitFor();
await A.waitForFunction(() => document.querySelectorAll('.slot-bot').length === 2);
check(true, 'host sees 2 planned NPCs for 2 empty slots');
check((await B.locator('.npc-settings .stepper button').first().isDisabled()), 'guest cannot edit NPC settings');
for (const p of [A, B]) await p.getByRole('button', { name: 'Sẵn sàng!' }).click();
await A.getByRole('button', { name: 'Bắt đầu' }).click();

const title = (p) => p.locator('.round-header strong').innerText({ timeout: 15000 });
const [ta, tb] = await Promise.all([title(A), title(B)]);
check(ta === tb && ta.length > 0, `both players are in the same minigame: "${ta}"`);
check((await A.locator('.hud-players li').count()) === 4 && (await B.locator('.hud-players li').count()) === 4, 'both see 4 participants');
check((await A.locator('.hud-players .tag-bot').count()) === 2, 'two of them are bots');

// Wait for gameplay, then reload B mid-round.
await A.locator('.game-hud').waitFor({ timeout: 20000 });
await B.screenshot({ path: `${out}/mp2-B-before-reload.png` });
await B.reload();
await B.locator('.round-header').waitFor({ timeout: 15000 });
check(true, 'B reloaded mid-match and is back in the match screen');
check((await B.locator('.hud-players li').count()) === 4, 'B still sees all 4 participants after reconnect');
await B.waitForTimeout(1500);
await B.screenshot({ path: `${out}/mp2-B-after-reload.png` });

// Host leaves mid-match → B becomes host, A is marked eliminated (forfeit).
await A.getByRole('button', { name: 'Rời phòng' }).click();
await B.getByRole('button', { name: 'Về phòng chờ' }).first().waitFor({ timeout: 10000 });
check(true, 'host left mid-match: B received host controls');
await B.waitForFunction(() => [...document.querySelectorAll('.hud-players li')].some((li) => li.className.includes('is-eliminated') && li.textContent.includes('Anh')), null, { timeout: 10000 });
check(true, 'A shown as eliminated (forfeit) in B\'s player list');

await B.getByRole('button', { name: 'Về phòng chờ' }).first().click();
await B.locator('.code-value').waitFor({ timeout: 10000 });
check((await B.locator('.slot-card:not(.slot-empty):not(.slot-bot)').count()) === 1, 'back in lobby: bots and departed players removed');
check(await B.getByRole('button', { name: /Chờ mọi người|Bắt đầu/ }).isVisible(), 'B now has the host start button');
console.log('BROWSER ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
await browser.close();
