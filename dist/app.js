import qrcode from './vendor/qrcode.js';
import {
  configureTransfers,
  mountTransfers,
  toggleTransfers,
  queueTransfers,
  activeTransfers,
  clearTransfers,
} from './transfers.js';
import { api, configured } from './services.js';
import { findFaces } from './faces.js';
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
// Bump this whenever the wording of the privacy choices changes.
const CONSENT_VERSION = '2026-11-25';
const noFilters = () => ({ person: '', time: '', location: '', status: '' });
const state = { me: null, email: '', events: [], photos: [] };
let active = null,
  tab = 'mine',
  sidebar = innerWidth > 800,
  largeGrid = false,
  query = '',
  filters = noFilters(),
  enrollmentTimer;
const statusOptions = [
  ['uploading', 'Uploading'],
  ['uploaded', 'Uploaded'],
  ['processing', 'Processing'],
  ['delivered', 'Matched & delivered'],
  ['no_match', 'No matches'],
];
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const currentEvent = () => state.events.find((e) => e.id === active);

// Simple generated pictures for people and albums.
function badge(text, size = 80) {
  const hue = [...text].reduce((n, c) => (n * 31 + c.codePointAt(0)) % 360, 7);
  const letter = esc([...text.trim()][0]?.toUpperCase() || 'M');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${size}" height="${size}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 55% 78%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 50% 62%)"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/><text x="40" y="52" font-family="sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
}
/** Runs an action and shows any failure instead of losing it. */
async function attempt(action) {
  try {
    return await action();
  } catch (error) {
    toast(error.message || 'Something went wrong. Please try again.');
  }
}
/** Submits a form with its button disabled; errors appear in #form-error. */
function onSubmit(selector, action) {
  $(selector).onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = form.querySelector('.primary');
    button.disabled = true;
    try {
      await action(Object.fromEntries(new FormData(form)));
    } catch (error) {
      const slot = form.querySelector('#form-error');
      if (slot) slot.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

// ---------- Data ----------
let loadNumber = 0;
async function refresh() {
  if (!state.me) return;
  const number = ++loadNumber;
  const events = await api.events.list();
  if (!events.some((e) => e.id === active)) active = events[0]?.id ?? null;
  const album = active;
  const photos = album ? await api.photos.list(album) : [];
  // A newer refresh, album switch or logout wins over this one.
  if (number !== loadNumber || album !== active || !state.me) return;
  state.events = events;
  state.photos = photos;
  render();
}
async function openAlbum(id) {
  if (innerWidth <= 800) sidebar = false;
  active = id;
  state.photos = [];
  query = '';
  tab = 'mine';
  filters = noFilters();
  if (currentEvent()) render();
  await refresh();
  scanAlbum();
}
let scanning = false;
/** Looks for people in my photos that are new, or whose album changed since the last check. */
async function scanAlbum() {
  if (scanning || !active || !state.me?.matchUploads) return;
  scanning = true;
  const album = active;
  try {
    for (const photo of await api.matching.pending(album)) {
      if (active !== album || !state.me?.matchUploads) break;
      try {
        const faces = await findFaces(await api.photos.blob(photo));
        await api.matching.submit(
          photo.id,
          faces.map((f) => f.embedding),
        );
      } catch (error) {
        console.error('Matching failed', error);
        toast('Some photos could not be checked for people. We will try again later.');
      }
      await refresh();
    }
  } catch (error) {
    console.error('Matching failed', error);
  } finally {
    scanning = false;
  }
  if (active !== album) scanAlbum();
}

// ---------- Main view ----------
function albumPhotos() {
  const pending = activeTransfers(active).map((t) => ({
    ...t,
    isTransfer: true,
    mine: true,
    people: [],
  }));
  return [...pending, ...state.photos];
}
function photoStatus(p) {
  if (p.isTransfer) return 'uploading';
  return p.status === 'processing' && !state.me.matchUploads ? 'uploaded' : p.status;
}
const statusLabel = (p) =>
  p.mine ? statusOptions.find(([key]) => key === photoStatus(p))?.[1] : 'Delivered to you';
const viewPhotos = () => albumPhotos().filter((p) => (tab === 'ofme' ? p.deliveredToMe : p.mine));
const photoSet = () =>
  viewPhotos().filter(
    (p) =>
      (!filters.person ||
        (filters.person === 'unsolved'
          ? p.unsolved
          : p.people.some((x) => x.id === filters.person))) &&
      (!filters.time || p.date === filters.time) &&
      (!filters.location || p.location === filters.location) &&
      (!filters.status || photoStatus(p) === filters.status) &&
      (!query || p.name.toLowerCase().includes(query.toLowerCase())),
  );
const unique = (values) => [...new Set(values.filter(Boolean))].sort().map((x) => [x, x]);
function select(key, label, options) {
  return `<select data-filter="${key}" aria-label="Filter by ${label}"><option value="">${label}</option>${options.map(([value, text]) => `<option value="${esc(value)}" ${filters[key] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
}
const longDate = (date) =>
  new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
const count = (n, word) => `${n} ${n === 1 ? word : word === 'person' ? 'people' : word + 's'}`;

function photoCard(p) {
  const done = ['delivered', 'uploaded', 'no_match'].includes(photoStatus(p)) || !p.mine;
  const picture = p.isTransfer
    ? `<div class="photo-upload-placeholder">${icon('upload')}<span>${esc(p.name)}</span><small>Uploading… ${Math.round(p.progress || 0)}%</small></div>`
    : `<img src="${esc(p.thumb)}" alt="${esc(p.name)}" loading="lazy">`;
  const buttons = p.isTransfer
    ? ''
    : `<button data-photo-action="share" data-id="${p.id}" title="Share photo">${icon('share')}</button><button data-photo-action="download" data-id="${p.id}" title="Download photo">${icon('save')}</button>${p.mine ? `<button data-photo-action="delete" data-id="${p.id}" title="Delete photo">${icon('trash')}</button>` : ''}`;
  return `<article class="photo" tabindex="0" data-photo="${p.id}" aria-label="Open ${esc(p.name)}">${picture}<span class="status ${done ? '' : 'pending'}" title="${esc(statusLabel(p))}">${icon(done ? 'check' : 'clock')}</span><div class="photo-bottom"><span>${esc(p.name)}</span><div class="photo-actions">${buttons}</div></div></article>`;
}
function railView() {
  return `<nav class="rail" aria-label="Main navigation"><button class="logo" data-action="home" aria-label="Moments home">m<span style="color:#eab89b">.</span></button><button class="icon ${sidebar ? 'active' : ''}" data-action="sidebar" title="Show or hide event panels" aria-label="Show or hide event panels" aria-expanded="${sidebar}" aria-controls="event-sidebar">${icon('panel')}</button><div class="spacer"></div><button class="icon" data-action="logout" title="${state.me ? 'Log out' : 'Log in'}" aria-label="${state.me ? 'Log out' : 'Log in'}">${icon('logout')}</button>${avatar()}</nav>`;
}
const avatar = () =>
  `<img class="avatar" data-action="account" tabindex="0" role="button" src="${badge(state.me?.name || 'M')}" alt="Open account settings">`;
function sidebarView() {
  const albums = state.events
    .map(
      (e) =>
        `<button class="album ${active === e.id ? 'selected' : ''}" data-event="${e.id}"><img src="${badge(e.name)}" alt=""><div><strong>${esc(e.name)}</strong><span>${count(e.photos, 'photo')} · ${count(e.members, 'person')}</span></div></button>`,
    )
    .join('');
  return `<aside id="event-sidebar" class="sidebar ${sidebar ? '' : 'hidden'}"><h2 class="brand">moments<span style="color:var(--accent)">.</span></h2><div id="event-tools"><div class="small">Make room for memories</div><button class="primary" data-action="create">${icon('plus')} Create an event</button><div class="searchbox">${icon('search')}<input id="join-search" placeholder="Join with a code" aria-label="Join with an invite code"><button class="qr-button" data-action="qr" title="Upload QR code" aria-label="Upload QR code">${icon('qr')}</button></div><div id="join-results"></div><div class="divider"></div></div><div class="small" style="display:flex;justify-content:space-between;margin:0 8px 15px">Your albums <span>${state.events.length}</span></div>${albums}</aside>`;
}
function mainView(e) {
  if (!e)
    return `<main class="main"><div class="content"><div class="empty">${state.me ? 'You have no albums yet.<br>Open the side panel to create an event or join one with a code.' : 'Log in to see your albums.'}</div></div></main>`;
  const all = viewPhotos(),
    photos = photoSet(),
    people = new Map(
      all
        .flatMap((p) => p.people.map((x) => [x.id, x.name]))
        .sort((a, b) => a[1].localeCompare(b[1])),
    ),
    mine = tab === 'mine';
  return `<main class="main"><header class="topbar"><div class="crumb">Your albums ${icon('chevron')} <strong>${esc(e.name)}</strong></div><div class="top-actions"><div class="searchbox">${icon('search')}<input id="photo-search" placeholder="Search your moments" value="${esc(query)}" aria-label="Search photos"></div><div class="transfer-anchor"><button id="transfer-trigger" class="transfer-trigger" data-action="transfers" aria-label="Transfer activity" title="Upload & delivery activity" aria-expanded="false" aria-controls="transfer-popover">${icon('transfer')}<span id="transfer-badge" class="transfer-badge" hidden></span></button><section id="transfer-popover" class="transfer-popover" role="region" aria-label="Transfer activity" hidden></section></div>${avatar()}</div></header><div class="content"><div class="album-heading"><div><div class="eyebrow">A SHARED ALBUM · ${e.date.slice(0, 4)}</div><h1>${esc(e.name)}</h1></div><div class="heading-actions"><button class="outline" data-action="invite">${icon('share')} Invite people</button><button class="outline" data-action="manage">${icon('settings')} ${e.owner ? 'Manage' : 'Leave'}</button><button class="primary" data-action="upload">${icon('plus')} Add photos</button></div></div><div class="meta"><div class="members"><span>${e.members === 1 ? 'Just you so far' : `You + ${count(e.members - 1, 'person')}`}</span></div><div class="meta-info"><span>${icon('pin')}${esc(e.location)}</span><span>${icon('image')}${count(all.length, 'photo')}</span><span>${icon('lock')}Invite only</span></div></div><div class="tabs"><button data-tab="mine" class="${mine ? 'active' : ''}">My uploads</button><button data-tab="ofme" class="${mine ? '' : 'active'}">Photos of me</button></div><div class="filters"><div class="filter-group">${mine ? select('person', 'People', [...people, ['unsolved', 'Unsolved']]) : ''}${select('time', 'Time', unique(all.map((p) => p.date)))}${select('location', 'Location', unique(all.map((p) => p.location)))}${mine ? select('status', 'Status', statusOptions) : ''}${Object.values(filters).some(Boolean) ? '<button data-action="clear" class="text-button" style="font-size:12px">Reset</button>' : ''}</div><div class="view-switch"><button class="${largeGrid ? '' : 'active'}" data-action="grid" title="Compact grid">${icon('grid')}</button><button class="${largeGrid ? 'active' : ''}" data-action="list" title="Large grid">${icon('list')}</button></div></div><div class="day">${longDate(e.date)}<span>${count(photos.length, 'moment')}</span></div><div class="grid ${largeGrid ? 'list-view' : ''}" id="photos">${photos.length ? photos.map(photoCard).join('') : `<div class="empty">${emptyText(all.length)}</div>`}</div><div class="footer-note">${icon('lock')}A little space for the moments that matter. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></div></div></main>`;
}
function emptyText(total) {
  if (total) return 'Nothing matches.<br>Adjust your filters or search.';
  if (tab === 'mine') return 'No moments here yet.<br>Add photos to get started.';
  return state.me.useFace && state.me.hasSelfies
    ? 'No photos of you yet.<br>They appear here when someone uploads one.'
    : 'To find photos of you, turn on face matching<br>and add your selfies in account settings.';
}
function render() {
  // Keep what the user is typing when the page redraws.
  const focus = ['join-search', 'photo-search'].includes(document.activeElement?.id)
    ? document.activeElement
    : null;
  const kept = focus && [focus.id, focus.selectionStart];
  const code = $('#join-search')?.value || '';
  $('#app').innerHTML =
    `<div class="workspace">${railView()}${sidebarView()}${mainView(currentEvent())}</div>`;
  bind();
  if (code) {
    $('#join-search').value = code;
    joinSearch(code);
  }
  if (kept && $('#' + kept[0])) {
    $('#' + kept[0]).focus();
    $('#' + kept[0]).setSelectionRange(kept[1], kept[1]);
  }
  mountTransfers();
}
function bind() {
  const each = (selector, fn) => document.querySelectorAll(selector).forEach(fn);
  each('[data-action]', (b) => {
    b.onclick = () => actions[b.dataset.action]?.();
    if (b.role === 'button')
      b.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          b.onclick();
        }
      };
  });
  each('[data-event]', (b) => (b.onclick = () => attempt(() => openAlbum(b.dataset.event))));
  each(
    '[data-tab]',
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        filters = noFilters();
        render();
      }),
  );
  each(
    '[data-filter]',
    (s) =>
      (s.onchange = () => {
        filters[s.dataset.filter] = s.value;
        render();
      }),
  );
  $('#join-search').oninput = (e) => joinSearch(e.target.value);
  if ($('#photo-search'))
    $('#photo-search').oninput = (e) => {
      query = e.target.value;
      render();
    };
  each('[data-photo]', (el) => {
    el.onclick = () => openPhoto(el.dataset.photo);
    el.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target === el) openPhoto(el.dataset.photo);
    };
  });
  each(
    '[data-photo-action]',
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const photo = state.photos.find((p) => p.id === b.dataset.id);
        if (photo) photoActions[b.dataset.photoAction](photo);
      }),
  );
}

// ---------- Dialogs ----------
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
// ---------- Account ----------
function welcome() {
  modal(
    `<div class="logo">m.</div><div class="welcome-art"><img src="${badge('moments', 250)}" alt=""><img src="${badge('together', 250)}" alt=""></div><div class="eyebrow">THE GOOD TIMES, TOGETHER</div><h2>Every perspective.<br>One shared memory.</h2><p>Bring your people and their photos together.<br>We'll keep the moments close, and your privacy closer.</p><button class="primary" id="get-started">Get started</button><div class="alternate">Already here? <button class="text-button" id="login">Log in</button></div>${configured ? '' : '<p class="error">Not connected to a server yet. Add the Supabase details to config.js.</p>'}`,
  );
  $('#get-started').onclick = () => auth('signup');
  $('#login').onclick = () => auth('login');
}
const passwordField = (autocomplete) =>
  `<label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="${autocomplete}" placeholder="At least 8 characters"></label>`;
const emailField =
  '<label class="field">Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>';
function auth(mode) {
  const login = mode === 'login';
  modal(
    `<div class="logo">m.</div><h2>${login ? 'Welcome back.' : 'A place for your people.'}</h2><p>${login ? 'Your shared memories are waiting.' : 'Start collecting the moments that matter.'}</p><form id="auth-form">${login ? '' : '<label class="field">Your name<input name="name" required maxlength="80" autocomplete="name" placeholder="Alex Chen"></label>'}${emailField}${passwordField(login ? 'current-password' : 'new-password')}<p class="error" id="form-error" role="alert"></p><button class="primary">${login ? 'Log in' : 'Create account'}</button></form>${login ? '<div class="alternate"><button class="text-button" id="forgot">Forgot your password?</button></div>' : ''}<div class="alternate">${login ? 'New to Moments?' : 'Already have an account?'} <button class="text-button" id="switch-auth">${login ? 'Sign up' : 'Log in'}</button></div>`,
  );
  $('#switch-auth').onclick = () => auth(login ? 'signup' : 'login');
  if (login) $('#forgot').onclick = forgot;
  onSubmit('#auth-form', async (data) => {
    const result = await api.auth[mode]({ ...data, redirect: location.href.split('#')[0] });
    if (!result.session)
      modal(
        `<div class="logo">m.</div><h2>Check your email.</h2><p>Open the link we sent to <strong>${esc(data.email)}</strong> to finish signing up.</p>`,
      );
    else await enter(result.session);
  });
}
function forgot() {
  modal(
    `<h2>Reset your password.</h2><p>We'll email you a link.</p><form id="forgot-form">${emailField}<p class="error" id="form-error" role="alert"></p><button class="primary">Send reset link</button></form>`,
  );
  onSubmit('#forgot-form', async ({ email }) => {
    await api.auth.reset(email);
    modal(
      `<h2>Check your email.</h2><p>If that address has an account, a reset link is on its way.</p>`,
    );
  });
}
function newPassword() {
  modal(
    `<h2>Choose a new password.</h2><form id="password-form">${passwordField('new-password')}<p class="error" id="form-error" role="alert"></p><button class="primary">Save password</button></form>`,
  );
  onSubmit('#password-form', async ({ password }) => {
    await api.auth.setPassword(password);
    close();
    toast('Your password is updated');
  });
}
/** Loads everything for a logged-in user, then continues setup if it is unfinished. */
let recovering = false;
async function enter(session) {
  state.me = await api.me();
  state.email = session.user.email;
  close();
  await refresh();
  scanAlbum();
  if (recovering) newPassword();
  else if (!state.me.onboarded) privacyStep();
  else await openIncomingInvite();
}
function leave() {
  clearInterval(enrollmentTimer);
  Object.assign(state, { me: null, email: '', events: [], photos: [] });
  active = null;
  query = '';
  filters = noFilters();
  clearTransfers();
  render();
  welcome();
}
async function savePrivacy(useFace, matchUploads) {
  await api.setPrivacy({ useFace, matchUploads, version: CONSENT_VERSION });
  state.me = await api.me();
  scanAlbum();
}
// Consent comes before selfies, so no face signature exists without permission.
function privacyStep() {
  modal(
    `<div class="steps">YOUR PRIVACY, YOUR WAY · 1 OF 2</div><h2>A little choice.<br>A lot of peace of mind.</h2><p>Both settings are optional. Change them anytime.</p><label class="checkrow"><input id="use-face" type="checkbox"><div><strong>Use my face for matching</strong><span>Allow Moments to make a face signature from my selfies and compare it with photos in albums I join.</span></div></label><label class="checkrow"><input id="match-uploads" type="checkbox"><div><strong>Match people in my uploads</strong><span>Allow my event photos to be checked for members who opted in, so they can privately receive their photos.</span></div></label><p style="font-size:12px">Turning face matching off deletes your face signature. <a href="privacy.html" target="_blank" rel="noopener">How we handle face data</a></p><button class="primary" id="privacy-save">Save & continue</button><div class="alternate"><button class="text-button" id="privacy-skip">Skip for now</button></div>`,
  );
  const finish = (useFace, matchUploads) =>
    attempt(async () => {
      await savePrivacy(useFace, matchUploads);
      if (useFace) selfieStep(true);
      else await finishSetup();
    });
  $('#privacy-save').onclick = () => finish($('#use-face').checked, $('#match-uploads').checked);
  $('#privacy-skip').onclick = () => finish(false, false);
}
async function finishSetup() {
  close();
  render();
  await openIncomingInvite();
}
/** Phone selfie capture, used in setup and from account settings. */
async function selfieStep(setup) {
  const token = await attempt(() => api.enrollment.create());
  if (!token) return;
  // After "#" so the token is never sent to the web host or its logs.
  const mobileUrl = new URL(`enroll.html#${token}`, location.href).href,
    qr = qrcode(0, 'M');
  qr.addData(mobileUrl);
  qr.make();
  modal(
    `<div class="steps">${setup ? 'GETTING TO KNOW YOU · 2 OF 2' : 'FACE SETTINGS'}</div><h2>${setup ? 'Use your phone<br>to find yourself.' : 'Update your selfies.'}</h2><p>Scan the QR code and add three clear angles: <strong>front, turn left, and turn right</strong>.</p>${state.me.hasSelfies ? `<div class="selfie-current">${icon('check')}<span><strong>Current enrollment</strong><small>3 reference selfies registered</small></span></div>` : ''}<div class="enrollment-layout"><div class="enrollment-qr"><img src="${qrPng(qr)}" alt="QR code to open the mobile selfie capture page"></div><div class="enrollment-copy"><strong>Scan with your phone</strong><span>Keep this window open while you complete the guided capture. The code works once, for 15 minutes.</span><div id="enrollment-status" class="enrollment-status">${icon('clock')}Waiting for your phone</div></div></div><a class="outline enrollment-preview" href="${mobileUrl}" target="_blank" rel="noopener">${icon('image')}Use this computer instead</a><p class="enrollment-note">Your selfies stay on your phone. Only a face signature is saved.</p><button class="primary" id="selfie-next" disabled>${setup ? 'Continue' : 'Done'}</button><div class="alternate"><button class="text-button" id="selfie-skip">${setup ? 'Skip for now' : 'Back to account settings'}</button></div>`,
  );
  const next = () => {
    clearInterval(enrollmentTimer);
    if (setup) attempt(finishSetup);
    else accountSettings();
  };
  $('#selfie-next').onclick = next;
  $('#selfie-skip').onclick = next;
  clearInterval(enrollmentTimer);
  const timer = (enrollmentTimer = setInterval(async () => {
    const box = $('#enrollment-status');
    if (!box) return clearInterval(timer);
    const status = await api.enrollment.status(token).catch(() => 'waiting');
    if (status === 'waiting' || !box.isConnected) return;
    clearInterval(timer);
    if (status === 'expired') {
      box.textContent = 'This code expired. Close this window and start again.';
      return;
    }
    state.me.hasSelfies = true;
    box.classList.add('complete');
    box.innerHTML = `${icon('check')}3 selfies added`;
    $('#selfie-next').disabled = false;
  }, 2000));
}
function accountSettings() {
  if (!state.me) return welcome();
  const row = (glyph, title, detail, action) =>
    `<button class="account-row" data-settings-action="${action}"><span class="account-row-icon">${icon(glyph)}</span><span><strong>${title}</strong><small>${detail}</small></span>${icon('chevron')}</button>`;
  const { name, useFace, matchUploads, hasSelfies } = state.me;
  modal(
    `<div class="account-profile"><img src="${badge(name)}" alt=""><div><h2>${esc(name)}</h2><p>${esc(state.email)}</p><button class="text-button" data-settings-action="profile">Edit profile</button></div></div><div class="account-card">${row('image', 'My selfies', hasSelfies ? 'Replace your face references' : useFace ? 'Not added yet' : 'Turn on face matching first', 'selfies')}</div><h3 class="account-section-title">Privacy & permissions</h3><div class="account-card"><label class="account-toggle"><span><strong>Use my face for matching</strong><small>Find me in events I join</small></span><input id="account-use-face" type="checkbox" ${useFace ? 'checked' : ''}><i></i></label><label class="account-toggle"><span><strong>Match people in my uploads</strong><small>Check for members who opted in</small></span><input id="account-match-uploads" type="checkbox" ${matchUploads ? 'checked' : ''}><i></i></label>${row('lock', 'Privacy policy', 'How your face data is used and deleted', 'privacy')}</div><h3 class="account-section-title">Account</h3><div class="account-card">${row('settings', 'Change password', 'Choose a new password', 'password')}${row('trash', 'Delete account', 'Erase your photos, face data and account', 'remove')}</div><p class="account-note">Turning off face matching deletes your face signature right away. Photos already delivered to you stay.</p>`,
    'account-dialog',
  );
  const save = async () => {
    const ok = await attempt(async () => {
      await savePrivacy($('#account-use-face').checked, $('#account-match-uploads').checked);
      return true;
    });
    if (ok) toast('Privacy setting updated');
    render();
    accountSettings();
  };
  $('#account-use-face').onchange = save;
  $('#account-match-uploads').onchange = save;
  const open = {
    selfies: () =>
      state.me.useFace ? selfieStep(false) : toast('Turn on "Use my face for matching" first.'),
    privacy: () => window.open('privacy.html', '_blank', 'noopener'),
    password: newPassword,
    profile: editProfile,
    remove: deleteAccount,
  };
  document
    .querySelectorAll('[data-settings-action]')
    .forEach((button) => (button.onclick = () => open[button.dataset.settingsAction]()));
}
function deleteAccount() {
  modal(
    `<h2>Delete your account?</h2><p>This erases your photos (including for people they were delivered to), your face signature and your account. It cannot be undone. Albums you own pass to another member.</p><form id="delete-form"><label class="field">Type DELETE to confirm<input name="confirm" required pattern="DELETE" autocomplete="off"></label><p class="error" id="form-error" role="alert"></p><button class="primary">Delete my account</button></form>`,
  );
  onSubmit('#delete-form', async () => {
    await api.deleteAccount();
    if (state.me) leave();
    toast('Your account is deleted');
  });
}
function editProfile() {
  modal(
    `<h2>Edit profile.</h2><form id="profile-form"><label class="field">Your name<input name="name" required maxlength="80" value="${esc(state.me.name)}"></label><p class="error" id="form-error" role="alert"></p><button class="primary">Save</button></form>`,
  );
  onSubmit('#profile-form', async ({ name }) => {
    await api.setName(name);
    state.me = await api.me();
    render();
    accountSettings();
  });
}

// ---------- Albums ----------
function createEvent() {
  const now = new Date(),
    today = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  modal(
    `<div class="eyebrow">MORE PEOPLE. MORE PERSPECTIVES.</div><h2>Make it a moment.</h2><p>A birthday, a weekend, or just a really good Tuesday.</p><form id="create-form"><label class="field">Event name<input name="name" maxlength="60" required placeholder="Give this memory a name"></label><label class="field">Date<input name="date" type="date" required value="${today}"></label><label class="field">Location<input name="location" maxlength="120" required placeholder="Where are we making memories?"></label><p class="error" id="form-error" role="alert"></p><button class="primary">Create shared album</button></form>`,
  );
  onSubmit('#create-form', async (data) => {
    const id = await api.events.create(data);
    close();
    await openAlbum(id);
    toast('Your album is ready. Invite your people!');
  });
}
async function joinSearch(value) {
  const code = value.trim(),
    show = (html) => {
      if ($('#join-search')?.value.trim() === code) $('#join-results').innerHTML = html;
    };
  if (code.length < 10) return show(code ? '<p class="join">Enter the full invite code.</p>' : '');
  const found = await attempt(() => api.events.preview(code));
  if (!found) return show('<p class="join">No album found for that code.</p>');
  show(
    `<button class="album" id="join-button"><div><strong>${esc(found.name)}</strong><span>${found.joined ? 'Open album' : 'Join album'}</span></div>${icon('plus')}</button>`,
  );
  if ($('#join-button')) $('#join-button').onclick = () => attempt(() => joinAlbum(found));
}
async function joinAlbum({ code, name, joined }) {
  const id = await api.events.join(code);
  $('#join-search').value = '';
  $('#join-results').innerHTML = '';
  await openAlbum(id);
  if (!joined) toast('You joined ' + name);
}
/** Invite links look like /?join=CODE. Joining still needs a click. */
async function openIncomingInvite() {
  const url = new URL(location.href),
    code = url.searchParams.get('join');
  if (!code) return;
  url.searchParams.delete('join');
  history.replaceState(null, '', url);
  const found = await attempt(() => api.events.preview(code));
  if (!found) return toast('That invite link is not valid.');
  if (found.joined) return attempt(() => joinAlbum(found));
  modal(
    `<div class="eyebrow">YOU'RE INVITED</div><h2>${esc(found.name)}</h2><p>Join this shared album?</p><button class="primary" id="accept-invite">Join album</button><div class="alternate"><button class="text-button" id="decline-invite">Not now</button></div>`,
  );
  $('#decline-invite').onclick = close;
  $('#accept-invite').onclick = () =>
    attempt(async () => {
      await joinAlbum(found);
      close();
    });
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
async function manageAlbum() {
  const e = currentEvent();
  if (!e.owner) return leaveAlbum(e);
  const members = await api.events.members(e.id);
  modal(
    `<h2>Manage album</h2><p>${esc(e.name)}</p><div class="account-card">${members.map((m) => `<div class="member-row"><span>${esc(m.name)}${m.me ? ' (you, owner)' : ''}</span>${m.me ? '' : `<button class="text-button" data-remove="${m.id}">Remove</button>`}</div>`).join('')}</div><button class="outline manage-action" id="reset-code">Change invite code</button><button class="outline manage-action" id="leave-album">Leave album</button>`,
  );
  document.querySelectorAll('[data-remove]').forEach(
    (b) =>
      (b.onclick = () => {
        const member = members.find((m) => m.id === b.dataset.remove);
        confirmStep(
          `Remove ${esc(member.name)}?`,
          'They lose access to this album and the photos delivered to them here. Their own uploads stay. The invite code changes too.',
          'Remove',
          async () => {
            await api.events.removeMember(e.id, member.id);
            await refresh();
            await manageAlbum();
            toast('Member removed and invite code changed');
          },
        );
      }),
  );
  $('#reset-code').onclick = () =>
    confirmStep(
      'Change the invite code?',
      'The old code and QR image stop working. Current members stay.',
      'Change code',
      async () => {
        await api.events.resetCode(e.id);
        await refresh();
        invite();
      },
    );
  $('#leave-album').onclick = () => leaveAlbum(e);
}
function leaveAlbum(e) {
  const next =
    e.members === 1
      ? 'You are the only member, so the album is deleted.'
      : e.owner
        ? 'The album passes to another member.'
        : '';
  confirmStep(
    'Leave this album?',
    `Your uploads here are deleted for everyone, and you lose the photos delivered to you. ${next}`,
    'Leave album',
    async () => {
      await api.events.leave(e.id);
      active = null;
      close();
      await refresh();
      toast('You left ' + e.name);
    },
  );
}
/** Title and text must already be escaped. */
function confirmStep(title, body, label, action) {
  modal(
    `<h2>${title}</h2><p>${body}</p><button class="primary" id="confirm-yes">${label}</button><div class="alternate"><button class="text-button" id="confirm-no">Cancel</button></div>`,
  );
  $('#confirm-no').onclick = close;
  $('#confirm-yes').onclick = async () => {
    $('#confirm-yes').disabled = true;
    await attempt(action);
    if ($('#confirm-yes')) $('#confirm-yes').disabled = false;
  };
}
function invite() {
  const e = currentEvent(),
    link = new URL('./', location.href);
  link.searchParams.set('join', e.code);
  const qr = qrcode(0, 'M');
  qr.addData(link.href);
  qr.make();
  const qrImage = qrPng(qr);
  modal(
    `<div class="eyebrow">INVITE TO YOUR ALBUM</div><h2>Bring your people.</h2><p>Scan this QR code or enter the invite code to join <strong>${esc(e.name)}</strong>.</p><div class="invite-qr" role="img" aria-label="Scan to join ${esc(e.name)}"><img src="${qrImage}" alt="QR invitation code for ${esc(e.name)}"></div><div class="invite-code">${esc(e.code)}</div><button class="primary" id="copy-code">Copy invite code</button><button class="outline invite-link" id="copy-link">${icon('share')}Copy invite link</button><a class="outline invite-link" href="${qrImage}" download="moments-invite-${esc(e.code)}.png">${icon('save')}Save QR code</a>`,
  );
  $('#copy-code').onclick = () => copy(e.code);
  $('#copy-link').onclick = () => copy(link.href);
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    window.prompt('Copy this:', text);
  }
}

// ---------- Photos ----------
const photoActions = {
  download: (photo) =>
    attempt(async () => {
      const url = URL.createObjectURL(await api.photos.blob(photo)),
        link = document.createElement('a');
      link.href = url;
      link.download =
        (photo.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-') || 'moment') + '.jpg';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Photo downloaded');
    }),
  share: (photo) =>
    attempt(async () => {
      const url = await api.photos.shareUrl(photo);
      modal(
        `<div class="eyebrow">SHARE THIS MOMENT</div><h2>Where should it go?</h2><p>${esc(photo.name)}</p><div class="share-destinations"><button data-share-platform="instagram"><b>◎</b><span>Instagram</span></button><button data-share-platform="tiktok"><b>♪</b><span>TikTok</span></button><button data-share-platform="facebook"><b>f</b><span>Facebook</span></button><button data-share-platform="x"><b>𝕏</b><span>X</span></button></div><button class="outline share-copy-card" data-share-platform="copy">${icon('share')}Copy link</button><p style="font-size:12px">Anyone with the link can see this photo for 7 days.</p>`,
        'share-dialog',
      );
      document
        .querySelectorAll('[data-share-platform]')
        .forEach((b) => (b.onclick = () => shareTo(b.dataset.sharePlatform, url)));
    }),
  delete: (photo) => {
    modal(
      `<h2>Delete this photo?</h2><p>This removes it for you and everyone it was delivered to. It cannot be undone.</p><button class="primary" id="confirm-delete">Delete photo</button><div class="alternate"><button class="text-button" id="keep-photo">Keep this moment</button></div>`,
    );
    $('#keep-photo').onclick = close;
    $('#confirm-delete').onclick = () =>
      attempt(async () => {
        $('#confirm-delete').disabled = true;
        await api.photos.remove(photo);
        close();
        await refresh();
        toast('Photo deleted');
      });
  },
};
async function shareTo(platform, url) {
  const pages = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=Moments`,
    instagram: 'https://www.instagram.com/',
    tiktok: 'https://www.tiktok.com/',
  };
  if (!['facebook', 'x'].includes(platform)) await copy(url);
  if (pages[platform]) window.open(pages[platform], '_blank', 'noopener,noreferrer');
}
async function openPhoto(id) {
  const p = state.photos.find((photo) => photo.id === id);
  if (!p) return toast('This photo is still uploading.');
  const url = await attempt(() => api.photos.fullUrl(p));
  if (!url) return;
  const people = p.people.map((x) => x.name).join(', ');
  modal(
    `<img class="preview-image" src="${esc(url)}" alt="${esc(p.name)}"><h2 style="font-size:24px">${esc(p.name)}</h2><p>${esc(p.location)} · ${longDate(p.date)} · ${esc(people ? `Delivered to ${people}` : statusLabel(p))}</p><button class="outline" id="light-download">${icon('save')}Download</button>`,
    'lightbox',
  );
  $('#light-download').onclick = () => photoActions.download(p);
}

// ---------- Start ----------
const resetFilters = () => {
  filters = noFilters();
  render();
};
const setGrid = (large) => {
  largeGrid = large;
  render();
};
const actions = {
  home: () => state.events[0] && attempt(() => openAlbum(state.events[0].id)),
  sidebar: () => {
    sidebar = !sidebar;
    render();
  },
  account: accountSettings,
  upload: () => $('#upload').click(),
  logout: () =>
    state.me
      ? attempt(async () => {
          await api.auth.logout();
          leave();
        })
      : welcome(),
  create: () => (state.me ? createEvent() : welcome()),
  invite,
  manage: () => attempt(manageAlbum),
  qr: () => (state.me ? $('#qr').click() : welcome()),
  transfers: toggleTransfers,
  clear: resetFilters,
  grid: () => setGrid(false),
  list: () => setGrid(true),
};
$('#upload').onchange = async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await queueTransfers(files, currentEvent());
  scanAlbum();
};
$('#qr').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!('BarcodeDetector' in window))
    return toast('QR decoding is unavailable in this browser. Enter the invite code instead.');
  try {
    const bitmap = await createImageBitmap(file);
    const results = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
    bitmap.close();
    if (!results.length) return toast('No QR code found. Enter the invite code instead.');
    const raw = results[0].rawValue;
    const code = raw.includes('join=') ? new URL(raw).searchParams.get('join') : raw;
    $('#join-search').value = code;
    joinSearch(code);
    toast('QR code read. Select the event to join.');
  } catch {
    toast('Could not read the QR image. Enter the invite code instead.');
  }
};
configureTransfers({
  getState: () => state,
  getEvent: currentEvent,
  icon,
  esc,
  render,
  refresh,
  statusLabel,
  upload: api.photos.upload,
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});
// Pick up deliveries and new members without a reload.
const idle = () => state.me && !document.hidden && !$('.overlay');
setInterval(() => idle() && refresh().catch(() => {}), 30000);
document.addEventListener('visibilitychange', () => {
  if (idle())
    refresh()
      .then(scanAlbum)
      .catch(() => {});
});
// Supabase calls must not run inside this callback, so they are deferred.
api.auth.onChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recovering = true;
    if (state.me) setTimeout(newPassword);
  }
  if (event === 'SIGNED_OUT' && state.me) setTimeout(leave);
});

render();
try {
  const session = await api.auth.session();
  if (session) await enter(session);
  else welcome();
} catch (error) {
  welcome();
  toast(error.message);
}
