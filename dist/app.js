import qrcode from './vendor/qrcode.js';
import {
  configureTransfers,
  mountTransfers,
  toggleTransfers,
  queueTransfers,
  recoverTransfers,
} from './transfers.js';
import { api, readState, writeState } from './services.js';
const paths = {
  transfer: 'M8 19V5m-4 4 4-4 4 4M16 5v14m-4-4 4 4 4-4',
  plus: 'M12 5v14M5 12h14',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  panel: 'M3 4h18v16H3zM9 4v16',
  search: 'm21 21-5-5M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  qr: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M8 8h2v2H8zM14 8h2v2h-2zM8 14h2v2H8zM14 14h2v2h-2z',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
  bell: 'M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 21h4',
  chevron: 'm9 5 7 7-7 7',
  people:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-3a4 4 0 0 0-3-3.87M16 2a4 4 0 0 1 0 8',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  pin: 'M20 9c0 6-8 13-8 13S4 15 4 9a8 8 0 1 1 16 0M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  share: 'M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  save: 'M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5',
  close: 'm6 6 12 12M18 6 6 18',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  image: 'M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M16 7h.01',
  logout: 'M9 3H3v18h6M9 12h12m-4-4 4 4-4 4',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.image}"/></svg>`;
const img = (id, w = 900) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
const images = [
  'photo-1511632765486-a01980e01a18',
  'photo-1529156069898-49953e39b3ac',
  'photo-1511988617509-a57c8a288659',
  'photo-1511795409834-ef04bbd61622',
  'photo-1528605248644-14dd04022da1',
  'photo-1517457373958-b7bdd4587205',
  'photo-1519671482749-fd09be7ccebf',
  'photo-1515169067868-5387ec356754',
  'photo-1530103862676-de8c9debad1d',
];
const face = (n) => `https://i.pravatar.cc/80?img=${n}`;
const initial = {
  session: null,
  privacy: { useFace: false, matchUploads: false },
  events: [
    {
      id: 'e1',
      name: 'A little golden hour',
      location: 'Ithaca, NY',
      date: '2026-10-18',
      members: 12,
      code: 'GOLDEN',
      cover: img(images[0], 200),
      joined: true,
    },
    {
      id: 'e2',
      name: 'The weekend escape',
      location: 'Catskills, NY',
      date: '2026-10-11',
      members: 8,
      code: 'WEEKEND',
      cover: img('photo-1470770841072-f978cf4d019e', 200),
      joined: true,
    },
    {
      id: 'e3',
      name: 'Studio, after hours',
      location: 'Cornell, NY',
      date: '2026-10-08',
      members: 16,
      code: 'STUDIO',
      cover: img(images[5], 200),
      joined: true,
    },
    {
      id: 'e4',
      name: 'Friendsgiving',
      location: 'Brooklyn, NY',
      date: '2026-11-26',
      members: 6,
      code: 'THANKS',
      cover: img(images[4], 200),
      joined: false,
    },
  ],
  photos: images
    .map((p, i) => ({
      id: 'p' + i,
      eventId: 'e1',
      url: img(p),
      name: [
        'The whole crew',
        'One for the memories',
        'A moment between moments',
        'Setting the table',
        'Better together',
        'Last light',
        'Evening stories',
        'A toast to us',
        'Little celebrations',
      ][i],
      person: i % 3 === 0 ? 'unsolved' : i % 2 ? 'Emma' : 'Alex',
      status: i % 3 === 0 ? 'pending' : 'matched',
      date: '2026-10-18',
      location: 'Ithaca, NY',
      type: i % 3 === 0 ? 'portrait' : 'group',
      saved: false,
      owner: i % 2 === 0 ? 'me' : 'Emma',
    }))
    .concat(
      [0, 1, 2].map((_, i) => ({
        id: 'w' + i,
        eventId: 'e2',
        url: img(
          [
            'photo-1470770841072-f978cf4d019e',
            'photo-1464822759023-fed622ff2c3b',
            'photo-1441974231531-c6227db76b6e',
          ][i],
        ),
        name: 'Weekend memory',
        person: 'unsolved',
        status: 'pending',
        date: '2026-10-11',
        location: 'Catskills, NY',
        type: 'landscape',
        owner: 'me',
      })),
    ),
};
let state = readState() || initial;
let active = 'e1',
  tab = 'mine',
  sidebar = true,
  query = '',
  filters = { person: '', time: '', location: '', status: '' };
let selfie = null;
const statusOptions = [
  ['uploading', 'Uploading'],
  ['sharing', 'Sharing'],
  ['awaiting-share', 'Awaiting to share'],
  ['awaiting-deliver', 'Awaiting to deliver'],
  ['upload-completed', 'Upload completed'],
  ['delivery-completed', 'Delivery completed'],
];
// Explicit membership/recipient fields: matching another person does not imply a delivery to me.
for (const p of state.photos) {
  if (p.workflowVersion === 1) continue;
  const sample = /^p[0-8]$/.test(p.id),
    i = sample ? Number(p.id.slice(1)) : -1;
  const demo = sample
    ? [
        'uploading',
        'sharing',
        'awaiting-share',
        'awaiting-deliver',
        'upload-completed',
        'delivery-completed',
        'upload-completed',
        'delivery-completed',
        'awaiting-share',
      ][i]
    : 'upload-completed';
  p.uploadState = demo === 'uploading' ? 'uploading' : 'completed';
  p.shareState =
    demo === 'sharing' ? 'sharing' : demo === 'awaiting-share' ? 'awaiting' : 'completed';
  p.deliveryState =
    demo === 'delivery-completed'
      ? 'completed'
      : demo === 'awaiting-deliver'
        ? 'awaiting'
        : 'unavailable';
  p.containsMe = sample && [5, 7].includes(i);
  p.deliveredToMe = p.containsMe && p.deliveryState === 'completed';
  p.workflowVersion = 1;
}
function albumPhotos() {
  const photos = state.photos.filter((p) => p.eventId === active);
  const pending = (state.transfers || [])
    .filter(
      (t) =>
        t.eventId === active &&
        ['queued', 'reading'].includes(t.upload) &&
        !photos.some((p) => p.id === t.id),
    )
    .map((t) => ({
      ...t,
      isTransfer: true,
      uploadState: 'uploading',
      person: 'unsolved',
      status: 'pending',
      owner: 'me',
      containsMe: false,
      deliveredToMe: false,
    }));
  return [...pending, ...photos];
}
function photoStatuses(p) {
  const transfer = (state.transfers || []).find((t) => t.id === p.id);
  const upload = transfer
    ? ['queued', 'reading'].includes(transfer.upload)
      ? 'uploading'
      : transfer.upload === 'complete'
        ? 'completed'
        : 'failed'
    : p.uploadState;
  return [
    ...(upload === 'uploading'
      ? ['uploading']
      : upload === 'completed'
        ? ['upload-completed']
        : []),
    ...(p.shareState === 'sharing'
      ? ['sharing']
      : p.shareState === 'awaiting'
        ? ['awaiting-share']
        : []),
    ...(p.deliveryState === 'awaiting'
      ? ['awaiting-deliver']
      : p.deliveryState === 'completed'
        ? ['delivery-completed']
        : []),
  ];
}
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
function persist() {
  writeState(state);
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
}
function photoSet() {
  return albumPhotos().filter(
    (p) =>
      p.eventId === active &&
      (tab !== 'ofme' ||
        (p.containsMe === true && p.deliveredToMe === true && p.deliveryState === 'completed')) &&
      (tab !== 'mine' || p.owner === 'me') &&
      (!filters.person || p.person === filters.person) &&
      (!filters.time || p.date === filters.time) &&
      (!filters.location || p.location === filters.location) &&
      (!filters.status || photoStatuses(p).includes(filters.status)) &&
      (!query || p.name.toLowerCase().includes(query.toLowerCase())),
  );
}
function render() {
  const e = state.events.find((e) => e.id === active) || state.events[0],
    all = albumPhotos(),
    photos = photoSet();
  $('#app').innerHTML =
    `<div class="workspace"><nav class="rail" aria-label="Main navigation"><button class="logo" data-action="home" aria-label="Moments home">m<span style="color:#eab89b">.</span></button><button class="icon ${sidebar ? 'active' : ''}" data-action="sidebar" title="Show or hide event panels" aria-label="Show or hide event panels" aria-expanded="${sidebar}" aria-controls="event-sidebar">${icon('panel')}</button><div class="spacer"></div><button class="icon" data-action="privacy" title="Privacy settings">${icon('lock')}</button><button class="icon" data-action="logout" title="${state.session ? 'Log out' : 'Log in'}">${icon('logout')}</button><img class="avatar" src="${face(47)}" alt="Your profile"></nav><aside id="event-sidebar" class="sidebar ${sidebar ? '' : 'hidden'}"><h2 class="brand">moments<span style="color:var(--accent)">.</span></h2><div id="event-tools"><div class="small">Make room for memories</div><button class="primary" data-action="create">${icon('plus')} Create an event</button><div class="searchbox">${icon('search')}<input id="join-search" placeholder="Join with a name or code" aria-label="Find an event"><button class="qr-button" data-action="qr" title="Upload QR code" aria-label="Upload QR code">${icon('qr')}</button></div><div id="join-results"></div><div class="divider"></div></div><div class="small" style="display:flex;justify-content:space-between;margin:0 8px 15px">Your albums <span>${state.events.filter((e) => e.joined).length}</span></div>${state.events
      .filter((e) => e.joined)
      .map(
        (e) =>
          `<button class="album ${active === e.id ? 'selected' : ''}" data-event="${e.id}"><img src="${e.cover}" alt=""><div><strong>${esc(e.name)}</strong><span>${state.photos.filter((p) => p.eventId === e.id).length} photos · ${e.members} people</span></div></button>`,
      )
      .join(
        '',
      )}<div class="sidebar-foot">${icon('lock')}<strong>Shared moments. Your choice.</strong>Your face, your photos, your privacy.<br><button class="text-button" data-action="privacy" style="padding:5px 0;font-size:12px">Manage privacy</button></div></aside><main class="main"><header class="topbar"><div class="crumb">Your albums ${icon('chevron')} <strong>${esc(e.name)}</strong></div><div class="top-actions"><div class="searchbox">${icon('search')}<input id="photo-search" placeholder="Search your moments" value="${esc(query)}" aria-label="Search photos"></div><div class="transfer-anchor"><button id="transfer-trigger" class="transfer-trigger" data-action="transfers" aria-label="Transfer activity" title="Upload & delivery activity" aria-expanded="false" aria-controls="transfer-popover">${icon('transfer')}<span id="transfer-badge" class="transfer-badge" hidden></span></button><section id="transfer-popover" class="transfer-popover" role="region" aria-label="Transfer activity" hidden></section></div><img class="avatar" src="${face(47)}" alt="Profile"></div></header><div class="content"><div class="album-heading"><div><div class="eyebrow">A SHARED ALBUM · ${e.date.slice(0, 4)}</div><h1>${esc(e.name)}</h1></div><div class="heading-actions"><button class="outline" data-action="invite">${icon('share')} Invite people</button><button class="primary" data-action="upload">${icon('plus')} Add photos</button></div></div><div class="meta"><div class="members"><div class="faces">${[47, 12, 49, 13].map((n) => `<img src="${face(n)}" alt="Album member">`).join('')}</div><span>You + ${e.members - 1} lovely people</span></div><div class="meta-info"><span>${icon('pin')}${esc(e.location)}</span><span>${icon('image')}${all.length} photos</span><span>${icon('lock')}Invite only</span></div></div><div class="tabs"><button data-tab="all" class="${tab === 'all' ? 'active' : ''}">All photos <span class="count">${all.length}</span></button><button data-tab="mine" class="${tab === 'mine' ? 'active' : ''}">My uploads</button><button data-tab="ofme" class="${tab === 'ofme' ? 'active' : ''}">Photos of me</button></div><div class="filters"><div class="filter-group">${
      tab === 'ofme'
        ? ''
        : select('person', 'People', [
            ['Emma', 'Emma'],
            ['Alex', 'Alex'],
            ['unsolved', 'Unsolved'],
          ])
    }${select(
      'time',
      'Time',
      [...new Set(all.map((p) => p.date))].map((x) => [x, x]),
    )}${select(
      'location',
      'Location',
      [...new Set(all.map((p) => p.location))].map((x) => [x, x]),
    )}${tab === 'ofme' ? '' : select('status', 'Status', statusOptions)}${Object.values(filters).some(Boolean) ? '<button data-action="clear" class="text-button" style="font-size:12px">Reset</button>' : ''}</div><div class="view-switch"><button class="active" data-action="grid" title="Compact grid">${icon('grid')}</button><button data-action="list" title="Large grid">${icon('list')}</button></div></div><div class="day">${new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}<span>${photos.length} moments</span></div><div class="grid" id="photos">${
      photos.length
        ? photos
            .map(
              (p) =>
                `<article class="photo" tabindex="0" data-photo="${p.id}" aria-label="Open ${esc(p.name)}">${p.isTransfer ? `<div class="photo-upload-placeholder">${icon('upload')}<span>${esc(p.name)}</span><small>Uploading… ${Math.round(p.progress || 0)}%</small></div>` : `<img src="${p.url}" alt="${esc(p.name)}" loading="lazy">`}<span class="status ${p.status === 'pending' ? 'pending' : ''}" title="${esc(
                  photoStatuses(p)
                    .map((value) => statusOptions.find(([key]) => key === value)?.[1])
                    .filter(Boolean)
                    .join(' · '),
                )}${/^p[0-8]$/.test(p.id) ? ' · sample status' : ''}">${icon(p.status === 'pending' ? 'clock' : 'check')}</span><div class="photo-bottom"><span>${esc(p.name)}</span><div class="photo-actions"><button data-photo-action="share" data-id="${p.id}" title="Share photo">${icon('share')}</button><button data-photo-action="save" data-id="${p.id}" title="${p.saved ? 'Unsave' : 'Save'} photo" style="${p.saved ? 'color:#ffd6a7' : ''}">${icon('save')}</button><button data-photo-action="delete" data-id="${p.id}" title="Delete photo">${icon('trash')}</button></div></div></article>`,
            )
            .join('')
        : '<div class="empty">No moments here yet.<br>Add photos or adjust your filters.</div>'
    }</div><div class="footer-note">${icon('lock')}A little space for the moments that matter.</div></div></main></div>`;
  bind();
  mountTransfers();
}
function select(key, label, options) {
  return `<select data-filter="${key}" aria-label="Filter by ${label}"><option value="">${label}</option>${options.map(([value, text]) => `<option value="${esc(value)}" ${filters[key] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
}
function modal(html, cls = '') {
  $('#modal-root').innerHTML =
    `<div class="overlay"><section class="dialog ${cls}" role="dialog" aria-modal="true" aria-label="Moments dialog"><button class="close" data-close aria-label="Close">${icon('close')}</button>${html}</section></div>`;
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  const first = $('.dialog input, .dialog .primary');
  first?.focus();
  $('.overlay').onclick = (e) => {
    if (e.target.classList.contains('overlay')) close();
  };
  $('.dialog').onclick = (e) => e.stopPropagation();
  $('.dialog').onkeydown = (e) => {
    if (e.key !== 'Tab') return;
    const elements = [
      ...document.querySelectorAll('.dialog button,.dialog input,.dialog select,.dialog a'),
    ].filter((el) => !el.disabled);
    const first = elements[0],
      last = elements.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
function close() {
  $('#modal-root').innerHTML = '';
}
function welcome() {
  modal(
    `<div class="logo">m.</div><div class="welcome-art"><img src="${img(images[1], 250)}" alt="Friends together"><img src="${img(images[4], 250)}" alt="A shared dinner"></div><div class="eyebrow">THE GOOD TIMES, TOGETHER</div><h2>Every perspective.<br>One shared memory.</h2><p>Bring your people and their photos together.<br>We'll keep the moments close, and your privacy closer.</p><button class="primary" id="get-started">Get started</button><div class="alternate">Already here? <button class="text-button" id="login">Log in</button></div><div class="alternate" style="font-size:12px">Interactive v1 demo · no account required</div>`,
  );
  $('#get-started').onclick = () => auth('signup');
  $('#login').onclick = () => auth('login');
}
function auth(mode) {
  modal(
    `<div class="logo">m.</div><h2>${mode === 'login' ? 'Welcome back.' : 'A place for your people.'}</h2><p>${mode === 'login' ? 'Your shared memories are waiting.' : 'Start collecting the moments that matter.'}</p><form id="auth-form">${mode === 'signup' ? '<label class="field">Your name<input name="name" required autocomplete="name" placeholder="Alex Chen"></label>' : ''}<label class="field">Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label><label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="At least 8 characters"></label><p class="error" id="form-error"></p><button class="primary">${mode === 'login' ? 'Log in' : 'Create account'}</button></form><div class="alternate">${mode === 'login' ? 'New to Moments?' : 'Already have an account?'} <button class="text-button" id="switch-auth">${mode === 'login' ? 'Sign up' : 'Log in'}</button></div><p style="font-size:12px;text-align:center">Demo session only. Never use a real password.</p>`,
  );
  $('#switch-auth').onclick = () => auth(mode === 'login' ? 'signup' : 'login');
  $('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      state.session = await api.auth[mode]({ email: data.email, name: data.name });
      persist();
      selfieStep();
    } catch (err) {
      $('#form-error').textContent = err.message;
    }
  };
}
function selfieStep() {
  const session = `demo-${Date.now()}`,
    mobileUrl = new URL(`enroll.html?session=${session}`, location.href).href,
    qr = qrcode(0, 'M');
  qr.addData(mobileUrl);
  qr.make();
  const qrImage = qrPng(qr),
    storageKey = `moments-enrollment-${session}`;
  modal(
    `<div class="steps">GETTING TO KNOW YOU · 1 OF 2</div><h2>Use your phone<br>to find yourself.</h2><p>Scan the QR code and add three clear angles: <strong>front, turn left, and turn right</strong>.</p><div class="enrollment-layout"><div class="enrollment-qr"><img src="${qrImage}" alt="QR code to open the mobile selfie capture page"></div><div class="enrollment-copy"><strong>Scan with your phone</strong><span>Keep this window open while you complete the guided capture.</span><div id="enrollment-status" class="enrollment-status">${icon('clock')}Waiting for your phone</div></div></div><a class="outline enrollment-preview" href="${mobileUrl}" target="_blank" rel="noopener">${icon('image')}Preview mobile capture</a><button class="text-button enrollment-simulate" id="enrollment-simulate">Simulate 3 selfies added</button><p class="enrollment-note">V1 demo: cross-device completion needs the future backend. Previewing in another tab on this device can sync through local storage.</p><button class="primary" id="selfie-next" disabled>Continue</button><div class="alternate"><button class="text-button" id="selfie-skip">Skip for now</button></div>`,
  );
  const complete = () => {
    selfie = ['front', 'left', 'right'];
    $('#enrollment-status').classList.add('complete');
    $('#enrollment-status').innerHTML = `${icon('check')}3 selfies added`;
    $('#selfie-next').disabled = false;
  };
  $('#enrollment-simulate').onclick = () => {
    localStorage.setItem(storageKey, JSON.stringify({ status: 'completed', count: 3 }));
    complete();
  };
  $('#selfie-next').onclick = privacyStep;
  $('#selfie-skip').onclick = () => {
    selfie = null;
    privacyStep();
  };
  clearInterval(window.enrollmentPoll);
  window.enrollmentPoll = setInterval(() => {
    const status = $('#enrollment-status');
    if (!status) {
      clearInterval(window.enrollmentPoll);
      return;
    }
    try {
      if (JSON.parse(localStorage.getItem(storageKey) || 'null')?.status === 'completed')
        complete();
    } catch {}
  }, 800);
}
function selfieSettings() {
  const session = `settings-${Date.now()}`,
    mobileUrl = new URL(`enroll.html?session=${session}`, location.href).href,
    qr = qrcode(0, 'M');
  qr.addData(mobileUrl);
  qr.make();
  const qrImage = qrPng(qr),
    storageKey = `moments-enrollment-${session}`;
  modal(
    `<div class="steps">FACE SETTINGS</div><h2>Update your selfies.</h2><p>Replace your current face references with three new angles: <strong>front, turn left, and turn right</strong>.</p><div class="selfie-current">${icon('check')}<span><strong>Current enrollment</strong><small>3 reference selfies registered in this demo</small></span></div><div class="enrollment-layout"><div class="enrollment-qr"><img src="${qrImage}" alt="QR code to open the mobile selfie capture page"></div><div class="enrollment-copy"><strong>Scan with your phone</strong><span>Complete the guided capture to replace your current selfies.</span><div id="enrollment-status" class="enrollment-status">${icon('clock')}Waiting for your phone</div></div></div><a class="outline enrollment-preview" href="${mobileUrl}" target="_blank" rel="noopener">${icon('image')}Preview mobile capture</a><button class="text-button enrollment-simulate" id="enrollment-simulate">Simulate 3 replacement selfies</button><p class="enrollment-note">V1 demo: cross-device completion needs the future backend. No face signature is created.</p><button class="primary" id="selfie-save" disabled>Save new selfies</button><div class="alternate"><button class="text-button" id="selfie-cancel">Back to account settings</button></div>`,
  );
  const complete = () => {
    $('#enrollment-status').classList.add('complete');
    $('#enrollment-status').innerHTML = `${icon('check')}3 replacement selfies added`;
    $('#selfie-save').disabled = false;
  };
  $('#enrollment-simulate').onclick = () => {
    localStorage.setItem(storageKey, JSON.stringify({ status: 'completed', count: 3 }));
    complete();
  };
  $('#selfie-save').onclick = () => {
    selfie = ['front', 'left', 'right'];
    toast('Your selfie references are updated');
    accountSettings();
  };
  $('#selfie-cancel').onclick = accountSettings;
  clearInterval(window.enrollmentPoll);
  window.enrollmentPoll = setInterval(() => {
    const status = $('#enrollment-status');
    if (!status) {
      clearInterval(window.enrollmentPoll);
      return;
    }
    try {
      if (JSON.parse(localStorage.getItem(storageKey) || 'null')?.status === 'completed')
        complete();
    } catch {}
  }, 800);
}
function privacyStep() {
  modal(
    `<div class="steps">YOUR PRIVACY, YOUR WAY · 2 OF 2</div><h2>A little choice.<br>A lot of peace of mind.</h2><p>Both settings are optional. Change them anytime.</p><label class="checkrow"><input id="use-face" type="checkbox" ${state.privacy.useFace ? 'checked' : ''}><div><strong>Use my face for matching</strong><span>Allow Moments to make a face signature from my selfies and compare it with photos in the app.</span></div></label><label class="checkrow"><input id="match-uploads" type="checkbox" ${state.privacy.matchUploads ? 'checked' : ''}><div><strong>Match people in my uploads</strong><span>Allow my event photos to be checked for members who opted in, so they can privately receive their photos.</span></div></label><p style="font-size:12px">V1 stores your choices on this device. No face signature is created and no photos are sent for matching.</p><button class="primary" id="privacy-save">Save & enter Moments</button><div class="alternate"><button class="text-button" id="privacy-skip">Skip for now</button></div>`,
  );
  $('#privacy-save').onclick = async () => {
    state.privacy = await api.privacy.update({
      useFace: $('#use-face').checked,
      matchUploads: $('#match-uploads').checked,
    });
    state.onboarded = true;
    persist();
    selfie = null;
    close();
    render();
    toast('Your privacy choices are saved');
  };
  $('#privacy-skip').onclick = () => {
    state.onboarded = true;
    persist();
    selfie = null;
    close();
    render();
  };
}
function accountSettings() {
  const name = state.session?.name || 'Maya Chen',
    email = state.session?.email || 'maya.chen@email.com';
  const row = (glyph, title, detail, action) =>
    `<button class="account-row" data-settings-action="${action}"><span class="account-row-icon">${icon(glyph)}</span><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron')}</button>`;
  modal(
    `<div class="account-profile"><img src="${face(47)}" alt="Your profile"><div><h2>${esc(name)}</h2><p>${esc(email)}</p><button class="text-button" data-settings-action="profile">Edit profile</button></div></div><div class="account-card">${row('image', 'My selfies', 'View or replace your face references', 'selfies')}${row('people', 'My friends', 'People connected to your moments', 'friends')}</div><h3 class="account-section-title">Privacy & permissions</h3><div class="account-card"><label class="account-toggle"><span><strong>Use my face for matching</strong><small>Find me in events I join</small></span><input id="account-use-face" type="checkbox" ${state.privacy.useFace ? 'checked' : ''}><i></i></label><label class="account-toggle"><span><strong>Match people in my uploads</strong><small>Check for members who opted in</small></span><input id="account-match-uploads" type="checkbox" ${state.privacy.matchUploads ? 'checked' : ''}><i></i></label>${row('settings', 'App permissions & data', 'Camera, photos and your saved data', 'permissions')}</div><h3 class="account-section-title">Settings & account</h3><div class="account-card">${row('bell', 'Notifications', 'Event updates and photo suggestions', 'notifications')}${row('people', 'Account & security', 'Sign-in details and account deletion', 'security')}${row('settings', 'Subscription', 'Manage your plan and billing', 'subscription')}${row('heart', 'Help & support', 'Get help with Moments', 'support')}</div><p class="account-note">V1 stores these choices on this device. No face signature is created and no photos are sent for matching.</p>`,
    'account-dialog',
  );
  const savePrivacy = async () => {
    state.privacy = await api.privacy.update({
      useFace: $('#account-use-face').checked,
      matchUploads: $('#account-match-uploads').checked,
    });
    persist();
    toast('Privacy setting updated');
  };
  $('#account-use-face').onchange = savePrivacy;
  $('#account-match-uploads').onchange = savePrivacy;
  document.querySelectorAll('[data-settings-action]').forEach(
    (button) =>
      (button.onclick = () => {
        const action = button.dataset.settingsAction;
        if (action === 'selfies') {
          selfieSettings();
          return;
        }
        toast(
          action === 'profile'
            ? 'Profile editing is coming next.'
            : 'This setting is planned for a future version.',
        );
      }),
  );
}
function createEvent() {
  modal(
    `<div class="eyebrow">MORE PEOPLE. MORE PERSPECTIVES.</div><h2>Make it a moment.</h2><p>A birthday, a weekend, or just a really good Tuesday.</p><form id="create-form"><label class="field">Event name<input name="name" maxlength="60" required placeholder="Give this memory a name"></label><label class="field">Date<input name="date" type="date" required value="2026-11-22"></label><label class="field">Location<input name="location" required placeholder="Where are we making memories?"></label><button class="primary">Create shared album</button></form>`,
  );
  $('#create-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const event = await api.events.create(d);
    state.events.push({ ...event, cover: img(images[8], 200), joined: true, members: 1 });
    active = event.id;
    tab = 'all';
    filters = { person: '', time: '', location: '', status: '' };
    persist();
    close();
    render();
    toast('Your album is ready. Invite your people!');
  };
}
function joinSearch(value) {
  const matches = state.events.filter(
    (e) =>
      !e.joined &&
      (e.name.toLowerCase().includes(value.toLowerCase()) ||
        e.code.toLowerCase() === value.toLowerCase()),
  );
  $('#join-results').innerHTML = value
    ? matches.length
      ? matches
          .map(
            (e) =>
              `<button class="album" data-join="${e.id}"><div><strong>${esc(e.name)}</strong><span>Join album · ${e.code}</span></div>${icon('plus')}</button>`,
          )
          .join('')
      : '<p class="join">No event found. Try the demo code THANKS.</p>'
    : '';
  document.querySelectorAll('[data-join]').forEach(
    (b) =>
      (b.onclick = async () => {
        await api.events.join({ eventId: b.dataset.join });
        const e = state.events.find((e) => e.id === b.dataset.join);
        e.joined = true;
        active = e.id;
        filters = { person: '', time: '', location: '', status: '' };
        persist();
        render();
        toast('You joined ' + e.name);
      }),
  );
}
function qrPng(qr) {
  const cell = 16,
    quiet = 4,
    count = qr.getModuleCount(),
    canvas = document.createElement('canvas');
  canvas.width = canvas.height = (count + quiet * 2) * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++)
      if (qr.isDark(row, col)) ctx.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
  return canvas.toDataURL('image/png');
}
async function invite() {
  const e = state.events.find((e) => e.id === active);
  const qr = qrcode(0, 'M');
  qr.addData(e.code);
  qr.make();
  const qrImage = qrPng(qr);
  modal(
    `<div class="eyebrow">INVITE TO YOUR ALBUM</div><h2>Bring your people.</h2><p>Scan this QR code or enter the invite code to join <strong>${esc(e.name)}</strong>.</p><div class="invite-qr" role="img" aria-label="Scan to join ${esc(e.name)}"><img src="${qrImage}" alt="QR invitation code for ${esc(e.name)}"></div><div class="invite-code">${esc(e.code)}</div><button class="primary" id="copy-code">Copy invite code</button><a class="outline invite-link" id="save-qr" href="${qrImage}" download="moments-invite-${esc(e.code)}.png">${icon('save')}Save QR code</a><p style="font-size:12px">V1 demo: the album must exist in the joining browser's local data.</p>`,
  );
  $('#copy-code').onclick = () => copy(e.code);
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Clipboard unavailable. Select and copy the displayed code.');
  }
}
async function downloadPhoto(id) {
  const photo = state.photos.find((item) => item.id === id);
  if (!photo) return;
  const filename =
    (photo.name || 'moment')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() + '.jpg';
  try {
    const response = await fetch(photo.url);
    if (!response.ok) throw new Error('download failed');
    const blob = await response.blob(),
      url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Photo downloaded');
  } catch {
    const link = document.createElement('a');
    link.href = photo.url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
    toast('Opened the image for download');
  }
}
async function sharePhoto(platform, id) {
  const photo = state.photos.find((item) => item.id === id);
  if (!photo) return;
  const url = photo.url,
    text = `${photo.name} · Moments`;
  if (platform === 'copy') {
    await copy(url);
    return;
  }
  if (platform === 'friends') {
    toast('Sharing with Moments friends will be available with the backend.');
    return;
  }
  if (platform === 'facebook') {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    );
    return;
  }
  if (platform === 'x') {
    window.open(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
    return;
  }
  await copy(url);
  window.open(
    platform === 'instagram' ? 'https://www.instagram.com/' : 'https://www.tiktok.com/',
    '_blank',
    'noopener,noreferrer',
  );
  toast(`Link copied for ${platform === 'instagram' ? 'Instagram' : 'TikTok'}`);
}
function openShareCard(id) {
  const photo = state.photos.find((item) => item.id === id);
  if (!photo) return;
  modal(
    `<div class="eyebrow">SHARE THIS MOMENT</div><h2>Where should it go?</h2><p>${esc(photo.name)}</p><button class="share-friends-card" data-share-platform="friends">${icon('people')}<span><strong>Friends</strong><small>Share with people inside Moments</small></span>${icon('chevron')}</button><div class="share-destinations"><button data-share-platform="instagram"><b>◎</b><span>Instagram</span></button><button data-share-platform="tiktok"><b>♪</b><span>TikTok</span></button><button data-share-platform="facebook"><b>f</b><span>Facebook</span></button><button data-share-platform="x"><b>𝕏</b><span>X</span></button></div><button class="outline share-copy-card" data-share-platform="copy">${icon('share')}Copy link</button>`,
    'share-dialog',
  );
  document
    .querySelectorAll('[data-share-platform]')
    .forEach((button) => (button.onclick = () => sharePhoto(button.dataset.sharePlatform, id)));
}
function enhancePhotoActions() {
  document.querySelectorAll('[data-photo-action="share"]').forEach((button) => {
    button.title = 'Share photo';
    button.onclick = (event) => {
      event.stopPropagation();
      openShareCard(button.dataset.id);
    };
  });
  document.querySelectorAll('[data-photo-action="save"]').forEach((button) => {
    button.dataset.photoAction = 'download';
    button.title = 'Download photo';
    button.style.color = '';
    button.onclick = (event) => {
      event.stopPropagation();
      downloadPhoto(button.dataset.id);
    };
  });
}
function bind() {
  document
    .querySelectorAll('[data-action]')
    .forEach((b) => (b.onclick = () => actions[b.dataset.action]?.()));
  document.querySelectorAll('[data-event]').forEach(
    (b) =>
      (b.onclick = () => {
        active = b.dataset.event;
        filters = { person: '', time: '', location: '', status: '' };
        query = '';
        tab = 'all';
        render();
      }),
  );
  document.querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        render();
      }),
  );
  document.querySelectorAll('[data-filter]').forEach(
    (s) =>
      (s.onchange = () => {
        filters[s.dataset.filter] = s.value;
        render();
      }),
  );
  $('#join-search')?.addEventListener('input', (e) => joinSearch(e.target.value));
  $('#photo-search').oninput = (e) => {
    query = e.target.value;
    const position = e.target.selectionStart;
    render();
    $('#photo-search').focus();
    $('#photo-search').setSelectionRange(position, position);
  };
  document.querySelectorAll('[data-photo]').forEach((el) => {
    el.onclick = () => openPhoto(el.dataset.photo);
    el.onkeydown = (e) => {
      if (e.key === 'Enter') openPhoto(el.dataset.photo);
    };
  });
  document.querySelectorAll('[data-photo-action]').forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        photoAction(b.dataset.photoAction, b.dataset.id);
      }),
  );
}
function openPhoto(id) {
  const p = state.photos.find((p) => p.id === id);
  if (!p) {
    toast('This photo is still uploading.');
    return;
  }
  modal(
    `<img class="preview-image" src="${p.url}" alt="${esc(p.name)}"><h2 style="font-size:24px">${esc(p.name)}</h2><p>${esc(p.location)} · ${p.date} · ${p.status === 'pending' ? 'Unsolved' : `Matched: ${esc(p.person)}`}</p><button class="outline" id="light-save">${icon('save')}${p.saved ? 'Unsave moment' : 'Save moment'}</button>`,
    'lightbox',
  );
  $('#light-save').onclick = () => {
    photoAction('save', id);
    openPhoto(id);
  };
}
function photoAction(action, id) {
  const p = state.photos.find((p) => p.id === id);
  if (!p) {
    toast('This photo is still uploading.');
    return;
  }
  if (action === 'save') {
    p.saved = !p.saved;
    persist();
    render();
    toast(p.saved ? 'Photo saved' : 'Removed from saved photos');
  }
  if (action === 'share') {
    modal(
      `<h2>Share this moment.</h2><p>${esc(p.name)}</p><input id="share-url" readonly aria-label="Photo link"><button class="primary" id="copy-photo">Copy photo link</button>`,
    );
    $('#share-url').value = p.url;
    $('#copy-photo').onclick = () => copy(p.url);
  }
  if (action === 'delete') {
    modal(
      `<h2>Delete this photo?</h2><p>This removes it from this demo album on your device.</p><button class="primary" id="confirm-delete">Delete photo</button><div class="alternate"><button class="text-button" data-close>Keep this moment</button></div>`,
    );
    $('[data-close]:last-child')?.addEventListener('click', close);
    $('#confirm-delete').onclick = async () => {
      await api.photos.remove(id);
      state.photos = state.photos.filter((p) => p.id !== id);
      state.transfers = (state.transfers || []).filter((t) => t.id !== id);
      persist();
      close();
      render();
      toast('Photo deleted');
    };
  }
}
const actions = {
  home: () => {
    active = 'e1';
    tab = 'all';
    filters = { person: '', time: '', location: '', status: '' };
    render();
  },
  sidebar: () => {
    sidebar = !sidebar;
    render();
  },
  upload: () => $('#upload').click(),
  privacy: privacyStep,
  logout: () => {
    if (state.session) {
      state.session = null;
      persist();
      render();
    }
    welcome();
  },
  create: createEvent,
  invite,
  qr: () => $('#qr').click(),
  transfers: toggleTransfers,
  clear: () => {
    filters = { person: '', time: '', location: '', status: '' };
    render();
  },
  grid: () => {
    $('#photos').classList.remove('list-view');
    document
      .querySelectorAll('.view-switch button')
      .forEach((b, i) => b.classList.toggle('active', i === 0));
  },
  list: () => {
    $('#photos').classList.add('list-view');
    document
      .querySelectorAll('.view-switch button')
      .forEach((b, i) => b.classList.toggle('active', i === 1));
  },
};
$('#upload').onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await queueTransfers(files);
};
$('#qr').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if ('BarcodeDetector' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const results = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
      bitmap.close();
      if (results.length) {
        const raw = results[0].rawValue;
        const code = raw.includes('code=') ? new URL(raw).searchParams.get('code') : raw;
        $('#join-search').value = code;
        joinSearch(code);
        toast('QR code read. Select the event to join.');
      } else toast('No QR code found. Enter the invite code instead.');
    } catch {
      toast('Could not read the QR image. Enter the invite code instead.');
    }
  } else {
    toast('QR decoding is unavailable in this browser. Enter the invite code instead.');
  }
  e.target.value = '';
};
const renderView = render;
render = function () {
  if (tab === 'all') tab = 'mine';
  renderView();
  document.querySelector('[data-tab="all"]')?.remove();
  document
    .querySelectorAll('[data-action="privacy"],.sidebar-foot')
    .forEach((element) => element.remove());
  document.querySelectorAll('.avatar').forEach((avatar) => {
    avatar.tabIndex = 0;
    avatar.role = 'button';
    avatar.setAttribute('aria-label', 'Open account settings');
    avatar.onclick = accountSettings;
    avatar.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        accountSettings();
      }
    };
  });
  enhancePhotoActions();
};
configureTransfers({
  getState: () => state,
  getActive: () => active,
  icon,
  persist,
  render,
  toast,
  prepare: api.photos.createUpload,
});
recoverTransfers(state);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});
render();
if (!state.session) welcome();
else if (!state.onboarded) selfieStep();

const incomingCode = new URL(location.href).searchParams.get('code');
if (incomingCode) {
  const target = state.events.find((e) => e.code.toLowerCase() === incomingCode.toLowerCase());
  if (target?.joined) {
    active = target.id;
    render();
  } else {
    sidebar = true;
    render();
    $('#join-search').value = incomingCode;
    joinSearch(incomingCode);
  }
}
