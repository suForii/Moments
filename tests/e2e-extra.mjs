// More checks: node tests/e2e-extra.mjs <folder with f12.jpg, f47.jpg, group.jpg>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const dir = process.argv[2],
  base = 'http://localhost:8943/';
const server = spawn('node', ['tools/dev-server.mjs'], {
  env: { ...process.env, PORT: '8943' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
process.on('exit', () => server.kill());
await new Promise((r) => server.stdout.once('data', r));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-unsafe-swiftshader'],
  protocolTimeout: 300000,
});
const errors = [],
  failures = [];
async function newPage() {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
const until = (p, fn, ...args) => p.waitForFunction(fn, { timeout: 60000, polling: 200 }, ...args);
const noOverlay = (p) => until(p, () => !document.querySelector('.overlay'));
async function signup(p, name, ...boxes) {
  await p.goto(base);
  await click(p, '#get-started');
  await type(p, '[name=name]', name);
  await type(p, '[name=email]', `${name.toLowerCase()}@example.test`);
  await type(p, '[name=password]', 'local-test-only');
  await click(p, '#auth-form .primary');
  for (const b of boxes) await click(p, b);
  await click(p, '#privacy-save');
}
async function album(p, name) {
  await click(p, '[data-action=create]');
  await type(p, '#create-form [name=name]', name);
  await type(p, '#create-form [name=location]', 'NYC');
  await click(p, '#create-form .primary');
  await until(p, (n) => document.querySelector('h1')?.innerText === n, name);
}
async function join(p, code) {
  await type(p, '#join-search', code);
  await click(p, '#join-button');
  await until(p, () => document.querySelector('.tabs'));
}
const code = async (p) => {
  await click(p, '[data-action=invite]');
  await p.waitForSelector('.invite-code');
  const c = (await text(p, '.invite-code')).trim();
  await p.keyboard.press('Escape');
  return c;
};
const photos = (p, n) =>
  until(p, (n) => document.querySelectorAll('.photo[data-photo] > img').length === n, n);
async function check(name, fn) {
  try {
    await fn();
    console.log('ok   ', name);
  } catch (e) {
    failures.push(name);
    console.log('FAIL ', name, '\n     ', e.message);
  }
}
// Adds a capture date and GPS position (42.4440 N, 76.5010 W) to a JPEG.
function withExif(jpeg) {
  const t = Buffer.alloc(400);
  let data = 200;
  t.write('MM\0*', 0, 'latin1');
  t.writeUInt32BE(8, 4);
  const entry = (at, tag, kind, n, value) => {
    t.writeUInt16BE(tag, at);
    t.writeUInt16BE(kind, at + 2);
    t.writeUInt32BE(n, at + 4);
    if (typeof value === 'string') t.write(value, at + 8, 'latin1');
    else t.writeUInt32BE(value, at + 8);
  };
  const rationals = (list) => {
    const at = data;
    for (const [a, b] of list) {
      t.writeUInt32BE(a, data);
      t.writeUInt32BE(b, data + 4);
      data += 8;
    }
    return at;
  };
  t.writeUInt16BE(2, 8);
  entry(10, 0x8769, 4, 1, 50);
  entry(22, 0x8825, 4, 1, 80);
  t.writeUInt16BE(1, 50);
  t.write('2025:07:04 23:30:00\0', 170, 'latin1');
  entry(52, 0x9003, 2, 20, 170);
  t.writeUInt16BE(4, 80);
  entry(82, 1, 2, 2, 'N\0');
  entry(
    94,
    2,
    5,
    3,
    rationals([
      [42, 1],
      [26, 1],
      [3840, 100],
    ]),
  );
  entry(106, 3, 2, 2, 'W\0');
  entry(
    118,
    4,
    5,
    3,
    rationals([
      [76, 1],
      [30, 1],
      [360, 100],
    ]),
  );
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t.subarray(0, data)]);
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 4);
  return Buffer.concat([head, body, jpeg.subarray(2)]);
}
writeFileSync(`${dir}/exif.jpg`, withExif(readFileSync(`${dir}/f47.jpg`)));
writeFileSync(`${dir}/broken.jpg`, 'not really an image');
writeFileSync(`${dir}/note.txt`, 'hello');
const upload = async (p, ...files) =>
  (await p.$('#upload')).uploadFile(...files.map((f) => `${dir}/${f}`));

const ann = await newPage();
try {
  await signup(ann, 'Ann');
  await noOverlay(ann);
  await album(ann, 'Party');

  await check('date and rounded location come from the photo', async () => {
    await upload(ann, 'exif.jpg');
    await photos(ann, 1);
    const times = await ann.$$eval('[data-filter=time] option', (o) => o.map((x) => x.value));
    const places = await ann.$$eval('[data-filter=location] option', (o) => o.map((x) => x.value));
    assert.ok(times.includes('2025-07-04'), String(times));
    assert.ok(places.includes('Near 42.44, -76.50'), String(places));
  });
  await check('download gives a JPEG with metadata stripped', async () => {
    const out = `${dir}/dl`;
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out);
    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: out,
      browserContextId: ann.browserContext().id,
    });
    await click(ann, '[data-photo-action=download]');
    for (let i = 0; i < 50 && !existsSync(`${out}/exif.jpg`); i++)
      await new Promise((r) => setTimeout(r, 100));
    const bytes = readFileSync(`${out}/exif.jpg`);
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.ok(!bytes.includes('Exif') && !bytes.includes('2025:07:04'));
  });
  await check('share link opens without logging in; unsigned file does not', async () => {
    await ann.evaluate(() => {
      window.copied = null;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (t) => (window.copied = t) },
      });
    });
    await click(ann, '[data-photo-action=share]');
    await click(ann, '[data-share-platform=copy]');
    await until(ann, () => window.copied);
    const url = await ann.evaluate(() => window.copied);
    await ann.keyboard.press('Escape');
    assert.equal((await fetch(url)).status, 200);
    assert.notEqual((await fetch(url.split('?')[0].replace('/sign/', '/'))).status, 200);
  });
  await check('non-images and broken images are refused with a message', async () => {
    await upload(ann, 'note.txt', 'broken.jpg');
    await until(ann, () => /cannot open that image/.test(document.body.innerText));
    assert.match(await text(ann, '#transfer-popover'), /smaller than 30 MB/);
    assert.equal((await ann.$$('.photo')).length, 1);
  });
  await check('failed upload can be retried, leaving no duplicates', async () => {
    await ann.setRequestInterception(true);
    let broken = true;
    ann.on('request', (r) =>
      broken && r.url().includes('/rpc/add_photo') ? r.abort() : r.continue(),
    );
    await upload(ann, 'f12.jpg');
    await until(ann, () =>
      [...document.querySelectorAll('.transfer-row')].some(
        (r) => /f12/.test(r.innerText) && r.querySelector('[data-retry]'),
      ),
    );
    assert.equal((await ann.$$('[data-retry]')).length, 1, 'unreadable images offer no retry');
    broken = false;
    await click(ann, '[data-retry]');
    await photos(ann, 2);
  });

  const bob = await newPage();
  await signup(bob, 'Bob', '#use-face');
  await bob.waitForSelector('.enrollment-preview');
  const link = await bob.$eval('.enrollment-preview', (a) => a.href);
  const phone = await newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await check('phone page refuses a bad link', async () => {
    await phone.goto(link.split('#')[0] + '#wrong');
    await until(phone, () => /expired/.test(document.querySelector('#message').innerText));
  });
  await check('phone page rejects selfies without head turns', async () => {
    await phone.goto('about:blank');
    await phone.goto(link);
    await (await phone.$('#upload')).uploadFile(...Array(3).fill(`${dir}/f12.jpg`));
    await until(phone, () => !document.querySelector('#complete').disabled);
    await click(phone, '#complete');
    await until(phone, () => /Turn your head/.test(document.querySelector('#message').innerText));
    assert.ok(await phone.$eval('#complete', (b) => b.disabled));
    await phone.screenshot({ path: `${dir}/phone.png` });
  });
  await check('closing setup halfway does not break the app', async () => {
    await click(bob, '#selfie-skip');
    await noOverlay(bob);
  });
  await join(bob, await code(ann));
  await check('turning consent off works from settings and kills the selfie link', async () => {
    await click(bob, '.rail .avatar');
    await click(bob, '#account-use-face');
    await until(bob, () => document.querySelector('#toast').innerText.includes('updated'));
    assert.equal(await bob.$eval('#account-use-face', (b) => b.checked), false);
    await bob.keyboard.press('Escape');
    const old = await newPage();
    await old.goto(link);
    await until(old, () => /expired/.test(document.querySelector('#message').innerText));
  });

  await check('finds many faces in group photos', async () => {
    const scan = (file) =>
      ann.evaluate(
        async (src) => {
          const { findFaces } = await import('/faces.js');
          const blob = await (await fetch(src)).blob();
          const t = performance.now();
          const found = await findFaces(blob);
          return [found.length, Math.round(performance.now() - t)];
        },
        'data:image/jpeg;base64,' + readFileSync(`${dir}/${file}`).toString('base64'),
      );
    // Faces about 150px wide in a 2000px picture, like people standing back from the camera.
    const grid = await ann.evaluate(
      async (srcs) => {
        const c = document.createElement('canvas');
        c.width = 2000;
        c.height = 1400;
        const x = c.getContext('2d');
        x.fillStyle = '#798';
        x.fillRect(0, 0, 2000, 1400);
        for (const [i, src] of srcs.entries()) {
          const img = new Image();
          img.src = src;
          await img.decode();
          x.drawImage(img, 80 + (i % 4) * 480, 80 + Math.floor(i / 4) * 440, 300, 300);
        }
        return c.toDataURL('image/jpeg', 0.85);
      },
      Array.from(
        { length: 12 },
        (_, i) =>
          'data:image/jpeg;base64,' +
          readFileSync(`${dir}/f${i % 2 ? 12 : 47}.jpg`).toString('base64'),
      ),
    );
    writeFileSync(`${dir}/grid.jpg`, Buffer.from(grid.split(',')[1], 'base64'));
    for (const file of ['grid.jpg', 'group.jpg'])
      console.log('     ', file, 'faces, ms:', (await scan(file)).join(', '));
    assert.equal((await scan('grid.jpg'))[0], 12);
  });

  await check('owner can change the code and remove a member', async () => {
    const before = await code(ann);
    await click(ann, '[data-action=manage]');
    await click(ann, '#reset-code');
    await click(ann, '#confirm-yes');
    await ann.waitForSelector('.invite-code');
    assert.notEqual((await text(ann, '.invite-code')).trim(), before);
    await ann.keyboard.press('Escape');
    await click(ann, '[data-action=manage]');
    await click(ann, '[data-remove]');
    await click(ann, '#confirm-yes');
    await until(ann, () => /member removed/i.test(document.querySelector('#toast').innerText));
    await ann.screenshot({ path: `${dir}/manage.png` });
    await ann.keyboard.press('Escape');
    await bob.reload();
    await until(bob, () => /no albums yet/.test(document.body.innerText));
  });
  await check('member can leave', async () => {
    await join(bob, await code(ann));
    await click(bob, '[data-action=manage]');
    await click(bob, '#confirm-yes');
    await until(bob, () => /no albums yet/.test(document.body.innerText));
  });
  for (const [w, h] of [
    [390, 844],
    [768, 1024],
  ])
    await check(`no sideways scrolling at ${w}px`, async () => {
      await ann.setViewport({ width: w, height: h });
      await ann.reload();
      await photos(ann, 2);
      await ann.screenshot({ path: `${dir}/w${w}.png` });
      const over = await ann.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const hidden = await ann.evaluate(() =>
        [...document.querySelectorAll('.main button, .main select')]
          .filter((b) => b.offsetParent && b.getBoundingClientRect().right > innerWidth + 1)
          .map((b) => b.title || b.innerText),
      );
      assert.equal(await ann.$eval('.sidebar', (b) => b.classList.contains('hidden')), w <= 800);
      assert.ok(over <= 0, `${over}px too wide`);
      assert.deepEqual(hidden, []);
    });
  await ann.setViewport({ width: 1440, height: 900 });
  await check('account deletion logs out and the login stops working', async () => {
    await click(ann, '.rail .avatar');
    await click(ann, '[data-settings-action=remove]');
    await type(ann, '[name=confirm]', 'DELETE');
    await click(ann, '#delete-form .primary');
    await ann.waitForSelector('#get-started', { timeout: 15000 });
    await ann.reload();
    await ann.waitForSelector('#login', { timeout: 15000 });
  });
} catch (e) {
  failures.push('setup');
  console.log('STOPPED', e.stack);
  await ann.screenshot({ path: `${dir}/stopped.png` });
} finally {
  console.log('browser errors:', [...new Set(errors)]);
  console.log(failures.length ? `FAILED: ${failures.join('; ')}` : 'PASS');
  await browser.close();
  server.kill();
  process.exitCode = failures.length ? 1 : 0;
}
