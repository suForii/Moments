/** Non-modal popover showing uploads and deliveries for the open album. */
import { preparePhoto } from './images.js';

const MAX_SIZE = 30 * 1024 * 1024;
let context,
  opened = false,
  mode = 'uploads',
  transfers = [];
export function configureTransfers(config) {
  context = config;
}
export function clearTransfers() {
  transfers = [];
  opened = false;
}
/** Uploads still on their way into an album. */
export const activeTransfers = (eventId) =>
  transfers.filter((t) => t.event.id === eventId && ['queued', 'uploading'].includes(t.upload));
const glyph = (name) => context.icon(name);
const escape = (value) => context.esc(value);
function entries() {
  const id = context.getEvent()?.id;
  const waiting = transfers.filter((t) => t.event.id === id);
  const stored = context
    .getState()
    .photos.filter((p) => p.mine)
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.thumb,
      upload: 'complete',
      progress: 100,
      photo: p,
    }));
  return [...waiting.filter((t) => !stored.some((p) => p.id === t.id)), ...stored];
}
const delivered = (item) => item.photo?.status === 'delivered';
function row(item) {
  const uploading = mode === 'uploads';
  const failed = item.upload === 'failed';
  const labels = {
    queued: 'Waiting',
    uploading: 'Uploading…',
    complete: 'Upload completed',
    failed: item.error || 'Upload failed',
  };
  const people = item.photo?.people.map((p) => p.name).join(', ');
  const status = uploading
    ? labels[item.upload]
    : item.photo
      ? people
        ? `Delivered to ${people}`
        : context.statusLabel(item.photo)
      : 'Waiting for upload';
  const done = uploading ? item.upload === 'complete' : delivered(item);
  return `<article class="transfer-row"><div class="transfer-thumbnail">${item.url ? `<img src="${escape(item.url)}" alt="">` : glyph('image')}</div><div class="transfer-details"><strong title="${escape(item.name)}">${escape(item.name)}</strong><div class="transfer-status ${failed && uploading ? 'failed' : done ? 'complete' : ''}">${glyph(failed && uploading ? 'close' : done ? 'check' : 'clock')}<span>${escape(status)}</span>${uploading && item.upload === 'uploading' ? `<span class="transfer-percent">${Math.round(item.progress)}%</span>` : ''}${uploading && failed && item.file ? `<button class="text-button" data-retry="${item.id}">Retry</button>` : ''}</div>${uploading ? `<div class="transfer-track" role="progressbar" aria-label="${escape(item.name)} upload progress" aria-valuenow="${Math.round(item.progress)}" aria-valuemin="0" aria-valuemax="100"><span class="${done ? 'complete' : ''}" style="width:${item.progress}%"></span></div>` : ''}</div></article>`;
}
export function mountTransfers() {
  const host = document.querySelector('#transfer-popover');
  const trigger = document.querySelector('#transfer-trigger');
  if (!host || !context) return;
  trigger.setAttribute('aria-expanded', String(opened));
  trigger.classList.toggle('active', opened);
  host.hidden = !opened;
  const items = entries(),
    pending = items.filter((t) => ['queued', 'uploading'].includes(t.upload)).length;
  const badge = document.querySelector('#transfer-badge');
  if (badge) {
    badge.hidden = !pending;
    badge.textContent = pending;
  }
  if (!opened) return;
  const event = context.getEvent();
  if (!event) return;
  const groups =
    mode === 'uploads'
      ? [
          ['In progress', items.filter((t) => t.upload === 'uploading')],
          ['Waiting', items.filter((t) => t.upload === 'queued')],
          ['Completed', items.filter((t) => t.upload === 'complete')],
          ['Failed', items.filter((t) => t.upload === 'failed')],
        ]
      : [
          ['Delivered', items.filter(delivered)],
          ['Not delivered', items.filter((t) => !delivered(t))],
        ];
  host.innerHTML = `<header class="transfer-heading"><div><h2>Transfer activity</h2></div><button id="transfer-close" aria-label="Close transfer activity">${glyph('close')}</button></header><div class="transfer-event">${glyph('image')}<div><strong>${escape(event.name)}</strong><span>${items.length} photos · current album</span></div></div><div class="transfer-tabs" role="group" aria-label="Transfer stage"><button data-transfer-tab="uploads" class="${mode === 'uploads' ? 'active' : ''}" aria-pressed="${mode === 'uploads'}">Uploads <span>${items.length}</span></button><button data-transfer-tab="delivery" class="${mode === 'delivery' ? 'active' : ''}" aria-pressed="${mode === 'delivery'}">Delivery</button></div><div class="transfer-list">${
    items.length
      ? groups
          .filter(([, rows]) => rows.length)
          .map(
            ([title, rows]) =>
              `<section><h3>${title}<span>${rows.length}</span></h3>${rows.map(row).join('')}</section>`,
          )
          .join('')
      : `<div class="transfer-empty">${glyph('upload')}<strong>No transfers yet</strong><p>Add photos to this album to see their progress here.</p></div>`
  }</div><footer class="transfer-footer">${glyph('lock')}<span>Photos go only to the people found in them.</span></footer>`;
  host.querySelector('#transfer-close').onclick = () => setOpen(false, true);
  host.querySelectorAll('[data-transfer-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.transferTab;
        mountTransfers();
        host.querySelector(`[data-transfer-tab="${mode}"]`).focus();
      }),
  );
  host.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = () => retry(b.dataset.retry)));
}
function setOpen(value, focus = false) {
  opened = value;
  mountTransfers();
  if (focus) document.querySelector('#transfer-trigger')?.focus();
}
export function toggleTransfers() {
  setOpen(!opened);
  if (opened) document.querySelector('#transfer-close')?.focus();
}
document.addEventListener('pointerdown', (event) => {
  if (opened && !event.target.closest('.transfer-anchor')) setOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && opened) {
    event.stopPropagation();
    setOpen(false, true);
  }
});
async function send(item) {
  item.upload = 'uploading';
  item.progress = 0;
  delete item.error;
  context.render();
  try {
    const photo = await preparePhoto(item.file, item.event);
    await context.upload(
      { ...photo, id: item.id, eventId: item.event.id, name: item.name },
      (progress) => {
        item.progress = progress;
        mountTransfers();
      },
    );
    item.upload = 'complete';
    item.progress = 100;
    delete item.file;
    await context.refresh().catch(() => {});
    transfers = transfers.filter((t) => t !== item);
    context.render();
  } catch (error) {
    item.upload = 'failed';
    item.progress = 0;
    item.error = error.message || 'Upload failed';
    if (error.permanent) delete item.file;
    context.render();
  }
}
async function retry(id) {
  const item = transfers.find((t) => t.id === id && t.upload === 'failed');
  if (item?.file) await send(item);
}
export async function queueTransfers(selected, event) {
  const queued = [];
  for (const file of selected) {
    const ok = file.type.startsWith('image/') && file.size <= MAX_SIZE;
    const item = {
      id: crypto.randomUUID(),
      event,
      name: file.name,
      upload: ok ? 'queued' : 'failed',
      progress: 0,
      ...(ok ? { file } : { error: 'Choose an image smaller than 30 MB' }),
    };
    transfers.unshift(item);
    if (ok) queued.push(item);
  }
  mode = 'uploads';
  setOpen(true);
  for (const item of queued) if (transfers.includes(item)) await send(item);
}
// Leaving the page would cancel uploads in progress.
window.addEventListener('beforeunload', (e) => {
  if (transfers.some((t) => ['queued', 'uploading'].includes(t.upload))) e.preventDefault();
});
