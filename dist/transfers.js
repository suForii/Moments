/** Non-modal transfer popover. Local reads are real; delivery requires a backend. */
let context,
  opened = false,
  mode = 'uploads';
const files = new Map();
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function configureTransfers(config) {
  context = config;
}
const glyph = (name) => context.icon(name);
function entries() {
  const state = context.getState();
  return state.photos
    .filter((p) => p.eventId === context.getActive())
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      upload: 'complete',
      progress: 100,
      delivery:
        p.deliveryState === 'completed'
          ? 'demo-delivered'
          : p.deliveryState === 'awaiting'
            ? 'demo-waiting'
            : 'unavailable',
      ...(state.transfers || []).find((t) => t.id === p.id),
    }))
    .concat(
      (state.transfers || []).filter(
        (t) => t.eventId === context.getActive() && !state.photos.some((p) => p.id === t.id),
      ),
    );
}
function row(item) {
  const uploading = mode === 'uploads';
  const failed = item.upload === 'failed';
  const labels = {
    queued: 'Waiting',
    reading: 'Reading photo…',
    complete: 'Available in this browser',
    failed: item.error || 'Could not read photo',
  };
  const deliveryLabels = {
    'demo-delivered': 'Delivered · sample status',
    'demo-waiting': 'Awaiting matching · sample status',
    unavailable: 'Not delivered · backend unavailable',
  };
  const status = uploading
    ? labels[item.upload]
    : item.upload === 'complete'
      ? deliveryLabels[item.delivery]
      : 'Waiting for upload';
  const done = uploading ? item.upload === 'complete' : item.delivery === 'demo-delivered';
  return `<article class="transfer-row"><div class="transfer-thumbnail">${item.url ? `<img src="${escape(item.url)}" alt="">` : glyph('image')}</div><div class="transfer-details"><strong title="${escape(item.name)}">${escape(item.name)}</strong><div class="transfer-status ${failed && uploading ? 'failed' : done ? 'complete' : ''}">${glyph(failed && uploading ? 'close' : done ? 'check' : 'clock')}<span>${escape(status)}</span>${uploading && item.upload === 'reading' ? `<span class="transfer-percent">${Math.round(item.progress)}%</span>` : ''}${uploading && failed && files.has(item.id) ? `<button class="text-button" data-retry="${item.id}">Retry</button>` : ''}</div>${uploading ? `<div class="transfer-track" role="progressbar" aria-label="${escape(item.name)} local read progress" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100"><span class="${done ? 'complete' : ''}" style="width:${item.progress}%"></span></div>` : ''}</div></article>`;
}
export function mountTransfers() {
  const host = document.querySelector('#transfer-popover');
  const trigger = document.querySelector('#transfer-trigger');
  if (!host || !context) return;
  trigger.setAttribute('aria-expanded', String(opened));
  trigger.classList.toggle('active', opened);
  host.hidden = !opened;
  const items = entries(),
    pending = items.filter((t) => ['queued', 'reading'].includes(t.upload)).length;
  const badge = document.querySelector('#transfer-badge');
  if (badge) {
    badge.hidden = !pending;
    badge.textContent = pending;
  }
  if (!opened) return;
  const event = context.getState().events.find((e) => e.id === context.getActive());
  const groups =
    mode === 'uploads'
      ? [
          ['In progress', items.filter((t) => t.upload === 'reading')],
          ['Waiting', items.filter((t) => t.upload === 'queued')],
          ['Completed', items.filter((t) => t.upload === 'complete')],
          ['Failed', items.filter((t) => t.upload === 'failed')],
        ]
      : [
          [
            'Delivered',
            items.filter((t) => t.upload === 'complete' && t.delivery === 'demo-delivered'),
          ],
          [
            'Waiting for delivery',
            items.filter((t) => t.delivery !== 'demo-delivered' || t.upload !== 'complete'),
          ],
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
  }</div><footer class="transfer-footer">${glyph('lock')}<span>V1 demo · uploads stay in this browser.<br>Delivery needs a backend; sample statuses are labeled.</span></footer>`;
  host.querySelector('#transfer-close').onclick = () => setOpen(false, true);
  host.querySelectorAll('[data-transfer-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.transferTab;
        mountTransfers();
        host.querySelector(`[data-transfer-tab="${mode}"]`).focus();
      }),
  );
  host
    .querySelectorAll('[data-retry]')
    .forEach((b) => (b.onclick = () => readFile(b.dataset.retry)));
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
function persist() {
  try {
    context.persist();
  } catch {
    context.toast('Device storage is full. Transfers remain for this session.');
  }
}
async function readFile(id) {
  const state = context.getState(),
    item = state.transfers.find((t) => t.id === id),
    file = files.get(id);
  if (!file || !item) return;
  item.upload = 'reading';
  item.progress = 0;
  delete item.error;
  mountTransfers();
  try {
    const metadata = await context.prepare({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    });
    if (metadata.mode !== 'local') throw new Error('Unsupported upload mode');
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          item.progress = Math.round((e.loaded / e.total) * 100);
          mountTransfers();
        }
      };
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read photo'));
      reader.onabort = () => reject(new Error('Photo read canceled'));
      reader.readAsDataURL(file);
    });
    state.photos.unshift({
      id,
      eventId: item.eventId,
      url,
      name: file.name,
      person: 'unsolved',
      status: 'pending',
      date: item.date,
      location: item.location,
      type: 'portrait',
      saved: false,
      owner: 'me',
      workflowVersion: 1,
      uploadState: 'completed',
      shareState: 'awaiting',
      deliveryState: 'unavailable',
      containsMe: false,
      deliveredToMe: false,
    });
    item.upload = 'complete';
    item.progress = 100;
    item.delivery = 'unavailable';
    files.delete(id);
    persist();
    context.render();
  } catch (error) {
    item.upload = 'failed';
    item.progress = 0;
    item.error = error.message || 'Could not read photo';
    persist();
    mountTransfers();
  }
}
export async function queueTransfers(selected) {
  const state = context.getState(),
    event = state.events.find((e) => e.id === context.getActive());
  state.transfers ??= [];
  const queued = [];
  for (const file of selected) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      state.transfers.unshift({
        id: crypto.randomUUID(),
        eventId: event.id,
        name: file.name,
        upload: 'failed',
        progress: 0,
        delivery: 'unavailable',
        error: 'Choose an image smaller than 5 MB',
      });
      continue;
    }
    const id = crypto.randomUUID();
    files.set(id, file);
    state.transfers.unshift({
      id,
      eventId: event.id,
      name: file.name,
      upload: 'queued',
      progress: 0,
      delivery: 'unavailable',
      date: event.date,
      location: event.location,
    });
    queued.push(id);
  }
  persist();
  mode = 'uploads';
  setOpen(true);
  for (const id of queued) await readFile(id);
  mountTransfers();
}
export function recoverTransfers(state) {
  for (const item of state.transfers || [])
    if (['queued', 'reading'].includes(item.upload)) {
      item.upload = 'failed';
      item.progress = 0;
      item.error = 'Interrupted · select the photo again';
    }
}
