// Full run in Chrome: node tests/e2e.mjs <folder with f12.jpg and f47.jpg, one clear face each>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const dir = process.argv[2],
  base = 'http://localhost:8941/';
const server = spawn('node', ['tools/dev-server.mjs'], {
  env: { ...process.env, PORT: '8941' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => server.stdout.once('data', r));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
  protocolTimeout: 300000,
});
const errors = [];
let step = '';
const log = (s) => console.log('-', (step = s));
async function user(name) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  return page;
}
const click = async (p, s) => {
  await p.waitForSelector(s, { timeout: 15000 });
  await p.$eval(s, (el) => el.click());
};
const type = async (p, s, v) => {
  await p.waitForSelector(s, { timeout: 15000 });
  await p.type(s, v);
};
const text = (p, s = 'body') => p.$eval(s, (el) => el.innerText);
const until = (p, fn, ...args) => p.waitForFunction(fn, { timeout: 90000, polling: 300 }, ...args);
async function signup(p, name) {
  await click(p, '#get-started');
  await type(p, '[name=name]', name);
  await type(p, '[name=email]', `${name.toLowerCase()}@example.test`);
  await type(p, '[name=password]', 'local-test-only');
  await click(p, '#auth-form .primary');
}
// Makes different pictures of the same face, so enrollment and upload are not identical.
async function variant(p, file, out, filter, rotate = 0) {
  const src = 'data:image/jpeg;base64,' + readFileSync(`${dir}/${file}`).toString('base64');
  const url = await p.evaluate(
    async (src, filter, rotate) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 900;
      const x = c.getContext('2d');
      x.fillStyle = '#777';
      x.fillRect(0, 0, 900, 900);
      x.translate(450, 450);
      x.rotate(rotate);
      x.filter = filter;
      x.drawImage(img, -280, -280, 560, 560);
      return c.toDataURL('image/jpeg', 0.9);
    },
    src,
    filter,
    rotate,
  );
  writeFileSync(`${dir}/${out}`, Buffer.from(url.split(',')[1], 'base64'));
  return `${dir}/${out}`;
}
try {
  const ann = await user('Ann'),
    bob = await user('Bob');
  log('Ann signs up, allows matching of uploads, creates an album');
  await ann.goto(base);
  await signup(ann, 'Ann');
  await click(ann, '#match-uploads');
  await click(ann, '#privacy-save');
  await until(ann, () => !document.querySelector('.overlay'));
  await click(ann, '[data-action=create]');
  await type(ann, '#create-form [name=name]', 'Test <b>Party</b>');
  await type(ann, '#create-form [name=location]', 'NYC');
  await click(ann, '#create-form .primary');
  await until(ann, () => document.querySelector('h1')?.innerText === 'Test <b>Party</b>');
  await click(ann, '[data-action=invite]');
  await ann.waitForSelector('.invite-code');
  const code = (await text(ann, '.invite-code')).trim();
  await ann.keyboard.press('Escape');

  log('Ann uploads Bob-face and other-face before Bob joins');
  const files = [
    await variant(ann, 'f12.jpg', 'up12.jpg', 'brightness(0.85)', 0.1),
    await variant(ann, 'f47.jpg', 'up47.jpg', 'contrast(1.1)'),
  ];
  await (await ann.$('#upload')).uploadFile(...files);
  await until(ann, () => document.querySelectorAll('.photo[data-photo] img').length === 2);
  await until(
    ann,
    () =>
      [...document.querySelectorAll('.photo .status')].filter((s) => s.title === 'No matches')
        .length === 2,
  );

  log('Bob opens the invite link, signs up, consents, uses the phone page');
  await bob.goto(`${base}?join=${code}`);
  await signup(bob, 'Bob');
  await click(bob, '#use-face');
  await click(bob, '#privacy-save');
  await bob.waitForSelector('.enrollment-preview');
  const phoneUrl = await bob.$eval('.enrollment-preview', (a) => a.href);
  const phone = await user('Phone');
  await phone.setViewport({ width: 390, height: 844 });
  await phone.goto(phoneUrl);
  const selfies = [
    await variant(phone, 'f12.jpg', 's1.jpg', 'none'),
    await variant(phone, 'f12.jpg', 's2.jpg', 'brightness(1.15)', -0.12),
    await variant(phone, 'f12.jpg', 's3.jpg', 'contrast(0.9)', 0.15),
  ];
  await (await phone.$('#upload')).uploadFile(...selfies);
  await until(phone, () => !document.querySelector('#complete').disabled);
  await click(phone, '#complete');
  await until(
    phone,
    () => !document.querySelector('#done').hidden || document.querySelector('#message').innerText,
  );
  assert.equal(await text(phone, '#message'), '');
  await until(bob, () => !document.querySelector('#selfie-next').disabled);
  await click(bob, '#selfie-next');
  await click(bob, '#accept-invite');
  await until(bob, () => document.querySelector('h1')?.innerText === 'Test <b>Party</b>');
  await until(bob, () => !document.querySelector('.overlay'));

  log('Ann comes back: her photos are rescanned and only the right one is delivered');
  await ann.reload();
  await until(ann, () =>
    [...document.querySelectorAll('.photo .status')].some((s) => s.title.startsWith('Matched')),
  );
  await bob.reload();
  await until(bob, () => document.querySelector('.tabs'));
  assert.equal((await bob.$$('.photo')).length, 0, 'Bob has no uploads');
  await click(bob, '[data-tab=ofme]');
  await until(bob, () => document.querySelector('.photo img')?.naturalWidth > 0);
  assert.equal((await bob.$$('.photo')).length, 1, 'only the matching photo');
  assert.match(await text(bob, '#photos'), /up12/);
  await bob.screenshot({ path: `${dir}/bob.png` });
  assert.ok(!(await bob.$('[data-photo-action=delete]')), 'Bob cannot delete it');
  await click(bob, '.photo');
  await until(bob, () => document.querySelector('.preview-image')?.naturalWidth > 0);
  await bob.keyboard.press('Escape');
  await click(bob, '[data-photo-action=share]');
  await bob.waitForSelector('.share-dialog');
  await bob.keyboard.press('Escape');

  log('Filters, activity panel, delete');
  const opts = await ann.$$eval('[data-filter=person] option', (o) => o.map((x) => x.innerText));
  assert.deepEqual(opts, ['People', 'Bob', 'Unsolved']);
  await ann.select('[data-filter=status]', 'no_match');
  assert.equal((await ann.$$('.photo')).length, 1);
  await click(ann, '[data-action=clear]');
  await click(ann, '#transfer-trigger');
  await click(ann, '[data-transfer-tab=delivery]');
  assert.match(await text(ann, '#transfer-popover'), /Delivered to Bob/);
  await ann.screenshot({ path: `${dir}/ann.png` });
  await ann.keyboard.press('Escape');
  for (let left = 1; left >= 0; left--) {
    await click(ann, '[data-photo-action=delete]');
    await click(ann, '#confirm-delete');
    await until(
      ann,
      (n) =>
        document.querySelectorAll('.photo').length === n && !document.querySelector('.overlay'),
      left,
    );
  }
  await bob.reload();
  await until(bob, () => document.querySelector('.tabs'));
  await click(bob, '[data-tab=ofme]');
  assert.equal((await bob.$$('.photo')).length, 0, 'deleted for Bob too');

  log('Log out and back in');
  await click(ann, '[data-action=logout]');
  await click(ann, '#login');
  await type(ann, '[name=email]', 'ann@example.test');
  await type(ann, '[name=password]', 'wrong-password');
  await click(ann, '#auth-form .primary');
  await until(ann, () => /Invalid login/.test(document.querySelector('#form-error').innerText));
  await ann.$eval('[name=password]', (el) => (el.value = ''));
  await type(ann, '[name=password]', 'local-test-only');
  await click(ann, '#auth-form .primary');
  await until(ann, () => document.querySelector('h1') && !document.querySelector('.overlay'));
  console.log('PASS');
} catch (e) {
  console.log('FAILED at:', step, '\n', e.stack);
  let i = 0;
  for (const c of browser.browserContexts())
    for (const p of await c.pages())
      await p.screenshot({ path: `${dir}/fail${i++}.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  console.log('browser errors:', [...new Set(errors)]);
  await browser.close();
  server.kill();
}
