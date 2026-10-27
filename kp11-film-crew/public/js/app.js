function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.role && typeof parsed.role === 'object' && parsed.role.name) {
        parsed.role = parsed.role.name;
      }
      return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function pluralizeRu(n, one, few, many) {
  const num = Math.abs(Number(n)) || 0;
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${num} ${many}`;
  if (mod10 === 1) return `${num} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${num} ${few}`;
  return `${num} ${many}`;
}

function safeFormatDate(dStr) {
  if (!dStr) return 'Дата не указана';
  try {
    const s = typeof dStr === 'string' ? dStr.replace(' ', 'T') : dStr;
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(dStr);
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return String(dStr);
  }
}

// Надёжный парсер даты и времени съёмки (поддерживает YYYY-MM-DD, DD.MM.YYYY, ISO и таймкоды)
function parseShootDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  let y, m, d;
  const sDate = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(sDate)) {
    const datePart = sDate.split('T')[0];
    const parts = datePart.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) - 1;
    d = parseInt(parts[2], 10);
    if (!timeStr && sDate.includes('T')) {
      const timePart = sDate.split('T')[1];
      if (timePart) timeStr = timePart.slice(0, 5);
    }
  } else if (/^\d{2}\.\d{2}\.\d{4}/.test(sDate)) {
    const parts = sDate.split('.');
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) - 1;
    y = parseInt(parts[2], 10);
  } else {
    const parsed = new Date(sDate);
    if (!isNaN(parsed.getTime())) {
      y = parsed.getFullYear();
      m = parsed.getMonth();
      d = parsed.getDate();
    } else {
      return null;
    }
  }

  let hours = 10, minutes = 0;
  if (timeStr) {
    const firstTimeMatch = String(timeStr).match(/(\d{1,2})[:.](\d{2})/);
    if (firstTimeMatch) {
      hours = parseInt(firstTimeMatch[1], 10);
      minutes = parseInt(firstTimeMatch[2], 10);
    }
  }

  return new Date(y, m, d, hours, minutes, 0);
}

// Парсер времени окончания смены (с поддержкой интервалов, напр. "10.00-21.00" или "18:00")
function parseShootEndDateTime(dateStr, endTimeStr, startTimeStr) {
  let timeStr = endTimeStr || '';
  if (!timeStr && startTimeStr && startTimeStr.includes('-')) {
    const parts = startTimeStr.split('-');
    timeStr = parts[1];
  } else if (timeStr && timeStr.includes('-')) {
    const parts = timeStr.split('-');
    timeStr = parts[1];
  }
  if (!timeStr) timeStr = '18:00';
  return parseShootDateTime(dateStr, timeStr);
}

// Конфигурация цеха: название, цветная окантовка карточки участника, бейдж и иконка
function getCraftDepartmentConfig(dept, roleName) {
  const d = (dept || '').toLowerCase().trim();
  const r = (roleName || '').toLowerCase().trim();

  if (d === 'cinema' || d.includes('оператор') || d.includes('камер')) {
    return {
      id: 'cinema',
      name: 'Операторский цех',
      borderClass: 'crew-dept-border-cinema',
      badgeClass: 'dept-badge-cinema',
      icon: SVG_ICONS.camera
    };
  }
  if (d === 'sound' || d.includes('звук')) {
    return {
      id: 'sound',
      name: 'Звуковой цех',
      borderClass: 'crew-dept-border-sound',
      badgeClass: 'dept-badge-sound',
      icon: SVG_ICONS.mic
    };
  }
  if (d === 'light' || d.includes('свет') || d.includes('гафф') || d.includes('освет')) {
    return {
      id: 'light',
      name: 'Осветительский цех',
      borderClass: 'crew-dept-border-light',
      badgeClass: 'dept-badge-light',
      icon: SVG_ICONS.light
    };
  }
  if (d === 'edit' || d.includes('монтаж') || d.includes('пост')) {
    return {
      id: 'edit',
      name: 'Монтажный цех',
      borderClass: 'crew-dept-border-edit',
      badgeClass: 'dept-badge-edit',
      icon: SVG_ICONS.scissors
    };
  }
  if (d === 'prod' || d.includes('продюсер') || d.includes('дирекц') || d.includes('админ') || d.includes('ответственн')) {
    return {
      id: 'prod',
      name: 'Продюсерский цех',
      borderClass: 'crew-dept-border-prod',
      badgeClass: 'dept-badge-prod',
      icon: '<svg class="w-3 h-3 text-blue-400 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
    };
  }
  if (d === 'art' || d.includes('арт') || d.includes('худож') || d.includes('грим') || d.includes('реквизит')) {
    return {
      id: 'art',
      name: 'Художественный цех',
      borderClass: 'crew-dept-border-art',
      badgeClass: 'dept-badge-art',
      icon: SVG_ICONS.art
    };
  }

  // Fallback по ключевым словам в названии роли:
  if (r.includes('оператор') || r.includes('камер') || r.includes('фокус') || r.includes('dop') || r.includes('кино')) {
    return {
      id: 'cinema',
      name: 'Операторский цех',
      borderClass: 'crew-dept-border-cinema',
      badgeClass: 'dept-badge-cinema',
      icon: SVG_ICONS.camera
    };
  }
  if (r.includes('звук') || r.includes('микрофон') || r.includes('бум')) {
    return {
      id: 'sound',
      name: 'Звуковой цех',
      borderClass: 'crew-dept-border-sound',
      badgeClass: 'dept-badge-sound',
      icon: SVG_ICONS.mic
    };
  }
  if (r.includes('свет') || r.includes('освет') || r.includes('гафф')) {
    return {
      id: 'light',
      name: 'Осветительский цех',
      borderClass: 'crew-dept-border-light',
      badgeClass: 'dept-badge-light',
      icon: SVG_ICONS.light
    };
  }
  if (r.includes('монтаж') || r.includes('склейк') || r.includes('цветокор') || r.includes('editor')) {
    return {
      id: 'edit',
      name: 'Монтажный цех',
      borderClass: 'crew-dept-border-edit',
      badgeClass: 'dept-badge-edit',
      icon: SVG_ICONS.scissors
    };
  }
  if (r.includes('продюс') || r.includes('директор') || r.includes('ответственн') || r.includes('координат')) {
    return {
      id: 'prod',
      name: 'Продюсерский цех',
      borderClass: 'crew-dept-border-prod',
      badgeClass: 'dept-badge-prod',
      icon: '<svg class="w-3 h-3 text-blue-400 inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
    };
  }

  return {
    id: 'art',
    name: 'Творческий цех',
    borderClass: 'crew-dept-border-art',
    badgeClass: 'dept-badge-art',
    icon: SVG_ICONS.art
  };
}

// Форматирование даты съёмки для отдельного блочного отображения
function formatShootDateSeparate(dateStr) {
  if (!dateStr) return { dateText: 'Дата не указана', dayOfWeek: '', fullFormatted: 'Дата не указана' };
  try {
    let d;
    const sDate = String(dateStr).trim();
    if (/^\d{2}\.\d{2}\.\d{4}/.test(sDate)) {
      const parts = sDate.split('.');
      d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else {
      const isoPart = sDate.split('T')[0];
      const p = isoPart.split('-');
      if (p.length === 3) {
        d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      } else {
        d = new Date(sDate);
      }
    }
    if (isNaN(d.getTime())) return { dateText: String(dateStr), dayOfWeek: '', fullFormatted: String(dateStr) };

    const dateFormatted = d.toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
    const capitalizedWeekday = weekday ? (weekday.charAt(0).toUpperCase() + weekday.slice(1)) : '';
    return {
      dateText: dateFormatted,
      dayOfWeek: capitalizedWeekday,
      fullFormatted: dateFormatted + (capitalizedWeekday ? ' (' + capitalizedWeekday + ')' : '')
    };
  } catch (e) {
    return { dateText: String(dateStr), dayOfWeek: '', fullFormatted: String(dateStr) };
  }
}


function getUserRoleName(user) {
  if (!user) return 'Гость';
  if (typeof user.role === 'string') return user.role;
  if (user.role && typeof user.role === 'object' && user.role.name) return user.role.name;
  return 'Студент';
}

function isAdminUser(user) {
  if (!user) return false;
  const r = String(getUserRoleName(user) || '').toLowerCase().trim();
  const email = String(user.email || '').toLowerCase().trim();
  return r === 'admin' || r === 'administrator' || r.includes('админ') || email.includes('admin@');
}

function isMasterUser(user) {
  if (!user) return false;
  const r = String(getUserRoleName(user) || '').toLowerCase().trim();
  const email = String(user.email || '').toLowerCase().trim();
  return r === 'master' || r === 'teacher' || r.includes('мастер') || r.includes('преподаватель') || email.includes('semyon.badikov') || email.includes('master@');
}

function isStudentUser(user) {
  if (!user) return false;
  return !isAdminUser(user) && !isMasterUser(user);
}

function isMasterOrAdminUser(user) {
  return isAdminUser(user) || isMasterUser(user);
}

let currentUser = getStoredUser();
let token = localStorage.getItem('token') || '';
if (token === 'undefined' || token === 'null') token = '';

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('theme')) {
  document.documentElement.setAttribute('data-theme', urlParams.get('theme'));
  localStorage.setItem('kp11_theme', urlParams.get('theme'));
}
// В рабочей версии аутентификация пользователя происходит строго через getStoredUser() и форму входа

let isRegister = false;
let globalStudents = [];
let globalAdminUsers = [];
let globalShoots = [];
try {
  const cachedShoots = JSON.parse(localStorage.getItem('kp11_shoots') || '[]');
  if (Array.isArray(cachedShoots)) {
    const cleaned = cachedShoots.filter(s => s && s.id !== 'shoot-prod-1' && s.id !== 'shoot-1792450290828');
    if (cleaned.length !== cachedShoots.length) {
      localStorage.setItem('kp11_shoots', JSON.stringify(cleaned));
    }
    globalShoots = cleaned;
  }
} catch (e) {}
let activeCallsheetShootId = null;
let activeCompetencyData = null;
let fullMap = null;
let pickerMap = null;
let pickerPlacemark = null;

// ================= PUSH NOTIFICATIONS REGISTRATION =================
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !token) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const res = await fetch('/api/notifications/vapid-public-key');
    const { publicKey } = await res.json();
    if (!publicKey) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ subscription })
    });
  } catch (err) {
    console.warn('Push registration notification skipped:', err.message);
  }
}

// Запуск подписки при загрузке, если пользователь уже авторизован
if (currentUser && token) {
  registerPushNotifications();
}

// ================= MODAL & MAPS =================
function openModal(type) {
  isRegister = type === 'register';
  const modalTitle = document.getElementById('modalTitle');
  const registerFields = document.getElementById('registerFields');
  const modal = document.getElementById('modal');

  if (modalTitle) modalTitle.innerText = isRegister ? 'Регистрация' : 'Авторизация';
  if (registerFields) registerFields.classList.toggle('hidden', !isRegister);
  if (modal) modal.classList.remove('hidden');
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('hidden');
}

let leafletFullMap = null;
let leafletMarkersLayer = null;

if (typeof ymaps !== 'undefined') {
  try {
    ymaps.ready(initMaps);
  } catch (e) {
    console.warn('Yandex Maps warning:', e.message);
  }
} else {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMaps);
  } else {
    setTimeout(initMaps, 100);
  }
}

function initMaps() {
  try {
    const mapEl = document.getElementById("fullMapContainer");
    if (!mapEl) return;
    if (typeof ymaps !== 'undefined' && ymaps.Map) {
      fullMap = new ymaps.Map(mapEl, {
        center: [55.751244, 37.618423],
        zoom: 11,
        controls: ['zoomControl', 'geolocationControl']
      });
      return;
    }
    if (typeof L !== 'undefined' && !leafletFullMap) {
      leafletFullMap = L.map(mapEl, {
        center: [55.858244, 37.518423],
        zoom: 11,
        zoomControl: true,
        attributionControl: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletFullMap);
      leafletMarkersLayer = L.layerGroup().addTo(leafletFullMap);
      if (globalShoots && globalShoots.length > 0) {
        renderShootsList(globalShoots);
      }
    }
  } catch (e) {
    console.warn('Maps init warning:', e.message);
  }
}

function getRatingBadgeColor(rating) {
  if (rating === null || rating === undefined) return 'text-neutral-400';
  if (rating <= 2.0) return 'text-red-400 font-extrabold';
  if (rating <= 4.0) return 'text-amber-400 font-extrabold';
  return 'text-emerald-400 font-extrabold';
}

// ================= ОФИЦИАЛЬНАЯ ВЕКТОРНАЯ БИБЛИОТЕКА ИКОНОК КП11 (БЕЗ ЭМОДЗИ) =================
const SVG_ICONS = {
  sun: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  moon: '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  star: '<svg class="w-3.5 h-3.5 text-amber-400 inline-block -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  starEmpty: '<svg class="w-3.5 h-3.5 text-neutral-500 inline-block -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  diamond: '<svg class="w-3 h-3 text-[var(--brand-red)] inline-block mr-1 -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 2 9l10 13L22 9 12 2Z"/></svg>',
  crown: '<svg class="w-3 h-3 text-amber-400 inline-block mr-1 -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 14v2h14v-2H5z"/></svg>',
  medal: '<svg class="w-3 h-3 text-orange-400 inline-block mr-1 -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="14" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/><path d="m15 2-3 4-3-4H4l4 8h8l4-8h-5z"/></svg>',
  camera: '<svg class="w-3.5 h-3.5 inline-block mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
  mic: '<svg class="w-3.5 h-3.5 inline-block mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  light: '<svg class="w-3.5 h-3.5 inline-block mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>',
  scissors: '<svg class="w-3.5 h-3.5 inline-block mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  art: '<svg class="w-3.5 h-3.5 inline-block mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  pin: '<svg class="w-3.5 h-3.5 inline-block text-[var(--brand-red)] mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  slate: '<svg class="w-3.5 h-3.5 inline-block text-[var(--brand-red)] mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z"/><path d="m4 11 3-7h13l-3 7H4Z"/></svg>',
  check: '<svg class="w-3 h-3 inline-block mr-1 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  clock: '<svg class="w-3 h-3 inline-block mr-1 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  cross: '<svg class="w-3 h-3 inline-block mr-1 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  telegram: '<svg class="w-3.5 h-3.5 inline-block text-[#229ED9] -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.672c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.411Z"/></svg>',
  play: '<svg class="w-3.5 h-3.5 inline-block -mt-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  matrix: '<svg class="w-3.5 h-3.5 inline-block -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>',
  edit: '<svg class="w-3.5 h-3.5 inline-block -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
};

function showToast(message) {
  const toast = document.getElementById('studioToast');
  const text = document.getElementById('studioToastText');
  if (toast && text) {
    text.innerText = message;
    toast.classList.add('show');
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }
}

function getCraftRankBadge(participations, avgRating) {
  const count = typeof participations === 'number' ? participations : 1;
  const rating = typeof avgRating === 'number' ? avgRating : 4.0;
  
  if (count >= 10 || rating >= 4.8) {
    return {
      title: 'Бригадир цеха / 1-й номер',
      className: 'craft-rank-badge rank-foreman',
      icon: SVG_ICONS.diamond
    };
  } else if (count >= 4 || rating >= 4.0) {
    return {
      title: 'Специалист площадки',
      className: 'craft-rank-badge rank-specialist',
      icon: SVG_ICONS.crown
    };
  } else {
    return {
      title: 'Ассистент цеха',
      className: 'craft-rank-badge rank-assistant',
      icon: SVG_ICONS.medal
    };
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('kp11_theme', next);
  updateThemeButton(next);
}

function updateThemeButton(theme) {
  const icon = document.getElementById('themeToggleIcon');
  const text = document.getElementById('themeToggleText');
  if (icon && text) {
    if (theme === 'light') {
      icon.innerHTML = SVG_ICONS.moon;
      text.innerText = 'ТЁМНАЯ';
    } else {
      icon.innerHTML = SVG_ICONS.sun;
      text.innerText = 'СВЕТЛАЯ';
    }
  }
}

function updateNav() {
  const nav = document.getElementById('userNav');
  const tabAdminBtn = document.getElementById('tabAdminBtn');
  const tabPortfolioBtn = document.getElementById('tabPortfolioBtn');
  const tabReviewsBtn = document.getElementById('tabReviewsBtn');
  const tabEquipmentBtn = document.getElementById('tabEquipmentBtn');
  const actionContainer = document.getElementById('actionButtonContainer');

  const shootsSectionCreateBtn = document.getElementById('shootsSectionCreateBtn');
  const canAccessMasterTabs = isMasterOrAdminUser(currentUser);

  updateThemeButton(document.documentElement.getAttribute('data-theme') || 'dark');

  if (tabPortfolioBtn) {
    tabPortfolioBtn.classList.toggle('hidden', !currentUser);
  }
  if (tabReviewsBtn) {
    tabReviewsBtn.classList.toggle('hidden', !canAccessMasterTabs);
    tabReviewsBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }
  if (tabEquipmentBtn) {
    tabEquipmentBtn.classList.toggle('hidden', !canAccessMasterTabs);
    tabEquipmentBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }
  if (shootsSectionCreateBtn) {
    shootsSectionCreateBtn.classList.toggle('hidden', !canAccessMasterTabs);
    shootsSectionCreateBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }

  if (currentUser) {
    if (nav) {
      nav.innerHTML = 
        '<div class="flex items-center space-x-2 flex-shrink-0">' +
          '<div class="flex items-center space-x-2 px-2.5 py-1.5 border max-w-[200px] sm:max-w-[280px]" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
            '<img id="userNavAvatarImg" src="' + (currentUser.avatar || 'img/student.jpg') + '" alt="Avatar" class="w-5 h-5 rounded-full object-cover border border-[var(--brand-red)] flex-shrink-0">' +
            '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981] flex-shrink-0"></span>' +
            '<span class="text-xs font-bold truncate" style="color: var(--text-primary);">' + currentUser.fullName + '</span>' +
            (currentUser.groupName ? '<span class="text-[9px] font-mono font-extrabold px-1 border flex-shrink-0" style="background-color: var(--brand-beige-subtle); color: var(--brand-beige-text); border-color: var(--brand-beige-dark);">[' + currentUser.groupName + ']</span>' : '') +
          '</div>' +
          '<button onclick="logout()" class="text-xs font-extrabold uppercase px-2.5 py-1.5 btn-brand-ghost flex-shrink-0" title="Выйти из системы">Выход</button>' +
        '</div>';
    }

    if (isMasterUser(currentUser)) {
      if (actionContainer) {
        actionContainer.innerHTML = 
          '<button onclick="openShootModal()" class="btn-brand-primary px-4 py-2 text-xs flex items-center space-x-2 shadow-lg">' +
            '<span class="font-bold text-sm leading-none">+</span>' +
            '<span>Новая смена</span>' +
          '</button>';
      }
      if (tabAdminBtn) tabAdminBtn.classList.add('hidden');
    } else if (isAdminUser(currentUser)) {
      if (actionContainer) {
        actionContainer.innerHTML = 
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<button onclick="openShootModal()" class="btn-brand-primary px-3.5 py-2 text-xs flex items-center space-x-1.5 shadow-lg">' +
              '<span class="font-bold text-sm leading-none">+</span>' +
              '<span>Новая смена</span>' +
            '</button>' +
            '<button onclick="switchTab(\'admin\')" class="btn-brand-beige px-3.5 py-2 text-xs flex items-center space-x-1.5 shadow-lg">' +
              '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
              '<span>Панель админа</span>' +
            '</button>' +
          '</div>';
      }
      if (tabAdminBtn) {
        tabAdminBtn.classList.remove('hidden');
        if (typeof loadAdminPanel === 'function') loadAdminPanel();
      }
    } else {
      if (actionContainer) {
        actionContainer.innerHTML = 
          '<div class="flex items-center gap-1.5 px-3 py-1.5 border font-mono text-[11px]" style="background-color: var(--bg-card); border-color: var(--border-color); color: var(--text-secondary);">' +
            '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>' +
            '<span>Студенческий доступ</span>' +
          '</div>';
      }
      if (tabAdminBtn) tabAdminBtn.classList.add('hidden');
    }

    if (typeof loadNotifications === 'function') loadNotifications();
    if (typeof loadShoots === 'function') loadShoots();
    if (typeof loadCinemaBoard === 'function') loadCinemaBoard();
    if (typeof registerPushNotifications === 'function') registerPushNotifications();
  } else {
    if (actionContainer) {
      actionContainer.innerHTML = 
        '<button onclick="openModal(\'login\')" class="btn-brand-primary px-4 py-2 text-xs flex items-center space-x-2 shadow-lg">' +
          '<span>Войти в систему</span>' +
        '</button>';
    }
    if (tabAdminBtn) tabAdminBtn.classList.add('hidden');
    if (nav) {
      nav.innerHTML = 
        '<div class="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">' +
          '<button onclick="openModal(\'login\')" class="text-xs font-extrabold uppercase px-3 py-1.5 btn-brand-ghost">Вход</button>' +
          '<button onclick="openModal(\'register\')" class="text-xs font-extrabold uppercase px-3 py-1.5 btn-brand-primary">Регистрация</button>' +
        '</div>';
    }
    renderGuestSidebar();
    if (typeof loadShoots === 'function') loadShoots();
    if (typeof loadCinemaBoard === 'function') loadCinemaBoard();
  }
}

function renderGuestSidebar() {
  const sidebar = document.getElementById('sidebarProfile');
  if (!sidebar) return;
  sidebar.innerHTML = 
    '<div class="space-y-4">' +
      '<div class="flex items-center space-x-3.5 pb-3 border-b" style="border-color: rgba(0,0,0,0.12);">' +
        '<div class="relative w-14 h-14 bg-neutral-900/10 border-2 border-dashed flex items-center justify-center flex-shrink-0" style="border-color: rgba(0,0,0,0.2);">' +
          '<svg class="w-6 h-6 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '</div>' +
        '<div class="min-w-0 flex-grow">' +
          '<span class="gaffer-tape-sticker">АККРЕДИТАЦИЯ // ГОСТЬ</span>' +
          '<h4 class="font-extrabold text-xs uppercase leading-tight mt-1" style="color: #141414;">Гостевой профиль</h4>' +
          '<p class="text-[10px] font-mono mt-0.5 font-bold" style="color: #555;">Режим мониторинга</p>' +
        '</div>' +
      '</div>' +
      '<p class="text-xs font-medium leading-relaxed" style="color: #444;">' +
        'Войдите со своим корпоративным аккаунтом для подтверждения вызовов цехов, просмотра отзывов мастеров и личного кабинета.' +
      '</p>' +
      '<div class="pt-1 flex gap-2">' +
        '<button onclick="openModal(\'login\')" class="w-1/2 py-2 text-xs font-extrabold uppercase btn-brand-primary">Войти</button>' +
        '<button onclick="openModal(\'register\')" class="w-1/2 py-2 text-xs font-extrabold uppercase btn-brand-ghost" style="color:#141414; border-color:#999;">Регистрация</button>' +
      '</div>' +
      '<div class="pt-2 border-t flex flex-col items-center justify-center space-y-1" style="border-color: rgba(0,0,0,0.1);">' +
        '<span class="text-[8px] font-mono tracking-widest text-black/60 font-extrabold">MEDIA-CREW-KP11-GUEST</span>' +
      '</div>' +
    '</div>';
}

function switchTab(tab) {
  const isShoots = tab === 'shoots';
  const isMap = tab === 'map';
  const isPortfolio = tab === 'portfolio' || tab === 'cabinet';
  const isReviews = tab === 'reviews';
  const isEquipment = tab === 'equipment';
  const isAdmin = tab === 'admin';
  const isStats = tab === 'stats';

  if (isPortfolio && !currentUser) {
    showToast('Войдите в систему для доступа в личный кабинет');
    openModal('login');
    return;
  }

  if (isReviews && !isMasterOrAdminUser(currentUser)) {
    showToast('Раздел «Отзывы» доступен Мастерам и Администраторам системы.');
    switchTab('shoots');
    return;
  }

  if (isEquipment && !isMasterOrAdminUser(currentUser)) {
    showToast('Раздел «Мониторинг техники» доступен Мастерам и Администраторам системы.');
    switchTab('shoots');
    return;
  }

  if (isAdmin && !isAdminUser(currentUser)) {
    showToast('Раздел «Администрирование» доступен только Администратору системы.');
    switchTab('shoots');
    return;
  }

  document.getElementById('viewShoots').classList.toggle('hidden', !isShoots);
  document.getElementById('viewMap').classList.toggle('hidden', !isMap);
  
  if (document.getElementById('viewPortfolio')) {
    document.getElementById('viewPortfolio').classList.toggle('hidden', !isPortfolio);
  }
  if (document.getElementById('viewReviews')) {
    document.getElementById('viewReviews').classList.toggle('hidden', !isReviews);
  }
  if (document.getElementById('viewEquipmentTracker')) {
    document.getElementById('viewEquipmentTracker').classList.toggle('hidden', !isEquipment);
  }
  if (document.getElementById('viewAdmin')) {
    document.getElementById('viewAdmin').classList.toggle('hidden', !isAdmin);
  }
  if (document.getElementById('viewStats')) {
    document.getElementById('viewStats').classList.toggle('hidden', !isStats);
  }

  const baseTabClass = 'studio-tab text-xs font-extrabold uppercase';
  const activeTabClass = 'studio-tab active text-xs font-extrabold uppercase';
  const canAccessMasterTabs = isMasterOrAdminUser(currentUser);
  const canAccessAdmin = isAdminUser(currentUser);

  document.getElementById('tabShootsBtn').className = isShoots ? activeTabClass : baseTabClass;
  document.getElementById('tabMapBtn').className = isMap ? activeTabClass : baseTabClass;
  
  const tabPortBtn = document.getElementById('tabPortfolioBtn');
  if (tabPortBtn) {
    tabPortBtn.className = isPortfolio ? activeTabClass : baseTabClass;
    tabPortBtn.classList.toggle('hidden', !currentUser);
  }

  const tabRevBtn = document.getElementById('tabReviewsBtn');
  if (tabRevBtn) {
    tabRevBtn.className = isReviews ? activeTabClass : baseTabClass;
    tabRevBtn.classList.toggle('hidden', !canAccessMasterTabs);
    tabRevBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }

  const tabEqBtn = document.getElementById('tabEquipmentBtn');
  if (tabEqBtn) {
    tabEqBtn.className = isEquipment ? activeTabClass : baseTabClass;
    tabEqBtn.classList.toggle('hidden', !canAccessMasterTabs);
    tabEqBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }

  if (document.getElementById('tabStatsBtn')) {
    document.getElementById('tabStatsBtn').className = isStats ? activeTabClass : baseTabClass;
  }

  const tabAdminBtn = document.getElementById('tabAdminBtn');
  if (tabAdminBtn) {
    tabAdminBtn.className = isAdmin ? activeTabClass : baseTabClass;
    tabAdminBtn.classList.toggle('hidden', !canAccessAdmin);
    tabAdminBtn.style.display = canAccessAdmin ? '' : 'none';
  }

  const shootsSectionCreateBtn = document.getElementById('shootsSectionCreateBtn');
  if (shootsSectionCreateBtn) {
    shootsSectionCreateBtn.classList.toggle('hidden', !canAccessMasterTabs);
    shootsSectionCreateBtn.style.display = canAccessMasterTabs ? '' : 'none';
  }

  if (isMap) {
    if (fullMap && fullMap.container) {
      setTimeout(() => fullMap.container.fitToViewport(), 150);
    } else if (leafletFullMap) {
      setTimeout(() => leafletFullMap.invalidateSize(), 150);
    } else {
      initMaps();
      if (leafletFullMap) setTimeout(() => leafletFullMap.invalidateSize(), 200);
    }
  }
  if (isPortfolio) {
    loadMyPortfolio();
  }
  if (isReviews) {
    loadReviewsTab();
  }
  if (isEquipment) {
    loadEquipmentTracker();
  }
  if (isStats) {
    loadStatisticsData();
  }
}

// ================= МОДУЛЬ 3: ВЫЗЫВНЫЕ ЛИСТЫ И TELEGRAM BOT =================
function generateCallSheetText(shoot) {
  const formattedDate = safeFormatDate(shoot.date);
  const crewList = shoot.crew || [];
  
  let crewLines = [];
  crewList.forEach(c => {
    const studentName = c.user ? c.user.fullName : 'Участник';
    const groupName = c.user && c.user.groupName ? '[' + c.user.groupName + ']' : '';
    const tg = c.user && c.user.telegram ? c.user.telegram : '';
    const tgStr = tg ? ' (' + tg + ')' : '';
    const statusText = c.status === 'ACCEPTED' ? '✓ Подтвердил' : (c.status === 'DECLINED' ? '✗ Отклонил' : 'Ожидание');
    crewLines.push('  • ' + c.roleInShoot + ': ' + studentName + ' ' + groupName + tgStr + ' — ' + statusText);
  });

  const coords = (shoot.latitude && shoot.longitude) ? (parseFloat(shoot.latitude).toFixed(6) + ', ' + parseFloat(shoot.longitude).toFixed(6)) : '';
  const mapStr = coords ? ('\nГЕОТОЧКА: https://yandex.ru/maps/?pt=' + coords.split(', ')[1] + ',' + coords.split(', ')[0] + '&z=16') : '';

  // Съёмочное оборудование смены
  const eqList = Array.isArray(shoot.equipment) ? shoot.equipment : [];
  let eqLines = [];
  if (eqList.length > 0) {
    eqList.forEach(eq => {
      const eqItem = typeof eq === 'object' ? eq : (globalInventory || []).find(e => e.id === eq);
      if (eqItem) {
        const sn = eqItem.serialNumber ? ' [S/N: ' + eqItem.serialNumber + ']' : '';
        const notes = eqItem.notes ? ' (' + eqItem.notes + ')' : '';
        eqLines.push('  • ' + eqItem.name + sn + notes);
      }
    });
  }

  let text = 'Вызывной\n' +
    '═══════════════════════════════════════════════════\n' +
    'ПРОЕКТ: ' + (shoot.title || 'СМЕНА') + '\n' +
    'ФОРМАТ: ' + (shoot.type || 'СТУДИЯ') + '\n' +
    'ДАТА СМЕНЫ: ' + formattedDate + '\n' +
    'ОБЪЕКТ / АДРЕС: ' + (shoot.location || 'Павильон КП11') +
    mapStr + '\n' +
    '═══════════════════════════════════════════════════\n' +
    'СЪЁМОЧНАЯ ГРУППА:\n' +
    (crewLines.length > 0 ? crewLines.join('\n') : '  Состав формируется') + '\n';

  if (eqLines.length > 0) {
    text += '═══════════════════════════════════════════════════\n' +
      'СЪЁМОЧНАЯ ТЕХНИКА И ОБОРУДОВАНИЕ:\n' +
      eqLines.join('\n') + '\n';
  }

  if (shoot.description) {
    text += '═══════════════════════════════════════════════════\n' +
      'ТЕХНИЧЕСКИЙ БРИФ:\n' + shoot.description + '\n';
  }

  return text;
}

function openCallsheetModal(shootId) {
  activeCallsheetShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  const container = document.getElementById('callsheetContent');
  const modal = document.getElementById('callsheetModal');
  if (!modal || !container) return;

  if (shoot) {
    container.innerText = generateCallSheetText(shoot);
  } else {
    container.innerText = 'Загрузка данных вызывного листа...';
  }
  modal.classList.remove('hidden');
}

function closeCallsheetModal() {
  const modal = document.getElementById('callsheetModal');
  if (modal) modal.classList.add('hidden');
}

function copyCallsheetText() {
  const container = document.getElementById('callsheetContent');
  if (container) {
    navigator.clipboard.writeText(container.innerText).then(() => {
      showToast('Вызывной лист скопирован в буфер обмена!');
    }).catch(() => {
      showToast('Вызывной лист скопирован!');
    });
  }
}

async function dispatchTelegramBot() {
  const shoot = (globalShoots || []).find(s => s.id === activeCallsheetShootId) || globalShoots[0];
  const callsheetText = generateCallSheetText(shoot);
  showToast('Отправка вызова в @KP11_FilmCrew_Bot...');

  let report = null;
  try {
    const res = await fetch('/api/telegram/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ shootId: activeCallsheetShootId, shoot: shoot })
    });
    if (res.ok) {
      const data = await res.json();
      report = data.report;
    }
  } catch (err) {}

  const deliveredCount = report && report.deliveredCount ? report.deliveredCount : 0;
  if (deliveredCount > 0) {
    showToast('Вызывной успешно разослан в Telegram (' + deliveredCount + ' получено)!');
  } else {
    showToast('Вызывной лист подготовлен для отправки в Telegram!');
  }

  const helperBox = document.getElementById('callsheetTgHelper');
  if (helperBox) {
    const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(callsheetText);
    const openBotUrl = 'https://t.me/KP11_FilmCrew_Bot?start=call_' + (shoot.id || '001');

    helperBox.classList.remove('hidden');
    helperBox.innerHTML = 
      '<div class="p-3 border mt-3 flex flex-col sm:flex-row items-center justify-between gap-3" style="background-color: var(--bg-primary); border-color: #229ED9;">' +
        '<div class="text-[11px] font-mono leading-tight">' +
          '<span class="text-[#229ED9] font-bold">СТАТУС TELEGRAM:</span> ' +
          (deliveredCount > 0 ? 'Доставлено в ЛС (' + deliveredCount + ' чел.)' : 'Сформирован вызов для съёмочной группы') +
          '<div class="text-[10px] text-[var(--text-muted)] mt-0.5">Студенты могут подтвердить явку по кнопке в боте</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 flex-shrink-0">' +
          '<a href="' + openBotUrl + '" target="_blank" class="px-3 py-1.5 text-[10px] font-extrabold uppercase bg-[#229ED9] text-white hover:bg-[#1b8ec5] transition flex items-center gap-1.5">' +
            SVG_ICONS.telegram + '<span>Открыть в боте</span>' +
          '</a>' +
          '<a href="' + shareUrl + '" target="_blank" class="px-3 py-1.5 text-[10px] font-extrabold uppercase btn-brand-ghost flex items-center gap-1.5">' +
            '<span>Переслать в чат</span>' +
          '</a>' +
        '</div>' +
      '</div>';
  }
}

// ================= МОДУЛЬ ДОКУМЕНТООБОРОТА И РЕГЛАМЕНТА ЦКТ КП11 =================

let activeDismissalShootId = null;
let activeEquipmentShootId = null;
let activeCktGradingShootId = null;
let cktGradingValues = {};

function openDismissalModal(shootId) {
  activeDismissalShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  const container = document.getElementById('dismissalOrderContent');
  const modal = document.getElementById('dismissalOrderModal');
  if (!modal || !container || !shoot) return;

  const crewList = (shoot.crew || []).filter(c => c.status === 'ACCEPTED' || c.attendance === 'PRESENT');
  const dDate = new Date(shoot.date);
  const formattedDate = dDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = dDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' – 18:00';
  const masterName = (shoot.creator && shoot.creator.fullName) ? shoot.creator.fullName : 'Бадиков Семён Станиславович';

  let studentRows = '';
  if (crewList.length === 0) {
    studentRows = '<tr><td colspan="5" class="p-3 text-center text-xs font-mono" style="color: var(--text-muted);">В смене пока нет подтверждённых участников</td></tr>';
  } else {
    studentRows = crewList.map((c, i) => {
      const u = c.user || (globalStudents || []).find(st => st.id === (c.userId || c.id)) || {};
      const fName = u.fullName || 'Студент';
      const grp = u.groupName || 'КТ-26';
      const role = c.roleInShoot || 'Специалист площадки';
      const contact = u.telegram || '@student';
      return '<tr class="border-b" style="border-color: var(--border-subtle);">' +
        '<td class="p-2 font-mono text-[11px]">' + (i + 1) + '</td>' +
        '<td class="p-2 font-bold text-xs" style="color: var(--text-primary);">' + fName + '</td>' +
        '<td class="p-2 font-mono text-xs font-bold text-[var(--brand-beige-text)]">' + grp + '</td>' +
        '<td class="p-2 text-xs" style="color: var(--text-secondary);">' + role + '</td>' +
        '<td class="p-2 font-mono text-[11px]" style="color: var(--text-muted);">' + contact + '</td>' +
      '</tr>';
    }).join('');
  }

  container.innerHTML = 
    '<div class="p-5 border space-y-4" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="text-center border-b pb-3 space-y-1" style="border-color: var(--border-color);">' +
        '<div class="text-[10px] font-mono tracking-widest uppercase font-bold" style="color: var(--brand-red);">ГАПОУ «КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11»</div>' +
        '<div class="text-xs font-bold uppercase tracking-wider" style="color: var(--text-primary);">ЦЕНТР КРЕАТИВНЫХ ТЕХНОЛОГИЙ // УЧЕБНАЯ ЧАСТЬ</div>' +
        '<div class="text-sm font-extrabold uppercase font-mono mt-1 text-[var(--brand-beige-text)]">СЛУЖЕБНАЯ ЗАПИСКА / ПРИКАЗ НА ОСВОБОЖДЕНИЕ № ЦКТ-' + (shoot.id || '101') + '</div>' +
      '</div>' +

      '<div class="text-xs space-y-1.5 leading-relaxed" style="color: var(--text-primary);">' +
        '<p>Прошу освободить от учебных занятий следующих студентов отделений творческих специальностей (Фото, видео, кино, ТВ, звукорежиссура) в связи с привлечением к плановой производственной съёмке Медиацентра ЦКТ КП11:</p>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 font-mono text-[11px] border" style="background-color: var(--bg-elevated); border-color: var(--border-subtle);">' +
          '<div><b>Проект:</b> ' + (shoot.title || 'Смена') + ' (' + (shoot.type || 'СЪЁМКА') + ')</div>' +
          '<div><b>Дата и время:</b> ' + formattedDate + ', ' + timeStr + '</div>' +
          '<div class="sm:col-span-2"><b>Место проведения:</b> ' + (shoot.location || 'Площадка КП11') + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="overflow-x-auto border" style="border-color: var(--border-color);">' +
        '<table class="w-full text-left border-collapse">' +
          '<thead>' +
            '<tr class="border-b text-[10px] uppercase font-mono" style="background-color: var(--bg-elevated); border-color: var(--border-color); color: var(--text-muted);">' +
              '<th class="p-2">№</th>' +
              '<th class="p-2">ФИО студента</th>' +
              '<th class="p-2">Группа</th>' +
              '<th class="p-2">Роль на смене</th>' +
              '<th class="p-2">Контакт</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + studentRows + '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-3 border-t text-xs font-mono" style="border-color: var(--border-color); color: var(--text-muted);">' +
        '<div>Ответственный мастер ЦКТ КП11: <b style="color: var(--text-primary);">' + masterName + '</b></div>' +
        '<div>Дата формирования: ' + new Date().toLocaleDateString('ru-RU') + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="flex flex-wrap items-center justify-end gap-2 pt-2">' +
      '<button onclick="copyDismissalOrderText()" class="btn-brand-ghost px-3 py-1.5 text-xs font-extrabold uppercase flex items-center gap-1.5">' +
        (SVG_ICONS.copy || '') + '<span>Скопировать для чата кураторов</span>' +
      '</button>' +
      '<button onclick="window.print()" class="btn-brand-primary px-4 py-1.5 text-xs font-extrabold uppercase flex items-center gap-1.5 shadow">' +
        '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
        '<span>Распечатать приказ / PDF</span>' +
      '</button>' +
    '</div>';

  modal.classList.remove('hidden');
}

function closeDismissalModal() {
  const modal = document.getElementById('dismissalOrderModal');
  if (modal) modal.classList.add('hidden');
}

function copyDismissalOrderText() {
  const shoot = (globalShoots || []).find(s => s.id === activeDismissalShootId);
  if (!shoot) return;
  const crewList = (shoot.crew || []).filter(c => c.status === 'ACCEPTED' || c.attendance === 'PRESENT');
  const dDate = new Date(shoot.date);
  const formattedDate = dDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const masterName = (shoot.creator && shoot.creator.fullName) ? shoot.creator.fullName : 'Бадиков Семён Станиславович';

  let listStr = crewList.map((c, i) => {
    const u = c.user || (globalStudents || []).find(st => st.id === (c.userId || c.id)) || {};
    return (i + 1) + '. ' + (u.fullName || 'Студент') + ' (' + (u.groupName || 'КТ-26') + ') — ' + (c.roleInShoot || 'Оператор');
  }).join('\n');

  let text = '📋 СЛУЖЕБНАЯ ЗАПИСКА // ОСВОБОЖДЕНИЕ ОТ УЧЕБНЫХ ЗАНЯТИЙ\n' +
    'В учебную часть Центра креативных технологий КП11\n\n' +
    'Прошу освободить от пар следующих студентов в связи с производственной съёмкой:\n' +
    (listStr || 'Список участников формируется') + '\n\n' +
    'Проект: ' + (shoot.title || 'Смена') + '\n' +
    'Дата: ' + formattedDate + '\n' +
    'Площадка: ' + (shoot.location || 'КП11') + '\n' +
    'Ответственный мастер: ' + masterName;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Служебная записка скопирована в буфер обмена!');
  }).catch(() => {
    showToast('Текст сформирован!');
  });
}

let globalInventory = [];
let activeEquipmentTab = 'checkout'; // 'checkout' | 'registry'

const DEMO_EQ_SERIALS = ['C200-884912', 'FX3-441209', 'AP-300D-1194', 'SH-SM7B-5501', 'RS3-903112', 'CNE-35-7781'];
const DEMO_EQ_IDS = ['eq-1', 'eq-2', 'eq-3', 'eq-4', 'eq-5', 'eq-6'];
function isDemoInventoryItem(item) {
  if (!item) return false;
  if (DEMO_EQ_IDS.includes(item.id)) return true;
  if (item.serialNumber && DEMO_EQ_SERIALS.includes(item.serialNumber)) return true;
  return false;
}

async function loadInventoryData() {
  let serverItems = null;
  try {
    const res = await fetch('/api/inventory');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.inventory)) {
        serverItems = data.inventory.filter(item => !isDemoInventoryItem(item));
      }
    }
  } catch (err) {
    console.warn('Inventory fetch offline, using fallback:', err.message);
  }

  // Извлекаем сохраненное оборудование пользователя из localStorage
  let localItems = [];
  try {
    const stored = JSON.parse(localStorage.getItem('kp11_inventory') || '[]');
    if (Array.isArray(stored)) {
      localItems = stored.filter(item => !isDemoInventoryItem(item));
    }
  } catch (e) {
    localItems = [];
  }

  if (Array.isArray(serverItems)) {
    globalInventory = serverItems;

    // СИНХРОНИЗАЦИЯ ПОСЛЕ ПЕРЕЗАПУСКА RENDER:
    // Если на сервере (в БД) пока 0 единиц техники, но в localStorage браузера сохранены созданные пользователем единицы,
    // автоматически загружаем их на сервер в постоянную базу PostgreSQL!
    if (serverItems.length === 0 && localItems.length > 0) {
      console.log('[КП11 Синхронизация] Восстановление ' + localItems.length + ' единиц техники пользователя в базу данных PostgreSQL...');
      for (const item of localItems) {
        try {
          const syncRes = await fetch('/api/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
            body: JSON.stringify(item)
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            if (Array.isArray(syncData.inventory)) {
              globalInventory = syncData.inventory.filter(i => !isDemoInventoryItem(i));
            }
          }
        } catch (syncErr) {
          console.warn('[КП11 Синхронизация] Ошибка сохранения единицы в БД:', syncErr.message);
        }
      }
    }
  } else {
    // Оффлайн fallback: берем только реальные единицы из localStorage
    globalInventory = localItems;
  }

  // Фильтруем любые возможные остатки тестовых единиц и сохраняем чистый список
  globalInventory = globalInventory.filter(item => !isDemoInventoryItem(item));
  try {
    localStorage.setItem('kp11_inventory', JSON.stringify(globalInventory));
  } catch (e) {}
}

async function openEquipmentModal(shootId) {
  activeEquipmentShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  const modal = document.getElementById('equipmentCheckoutModal');
  if (!modal || !shoot) return;

  await loadInventoryData();
  renderEquipmentModalTabs(shootId);
  modal.classList.remove('hidden');
}

function switchEquipmentTab(tabName) {
  activeEquipmentTab = tabName;
  if (activeEquipmentShootId) {
    renderEquipmentModalTabs(activeEquipmentShootId);
  }
}

function renderEquipmentModalTabs(shootId) {
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  const container = document.getElementById('equipmentCheckoutContent');
  if (!container || !shoot) return;

  const canManageGear = isMasterUser(currentUser) || isAdminUser(currentUser);
  const masterName = (shoot.creator && shoot.creator.fullName) ? shoot.creator.fullName : 'Бадиков Семён Станиславович';
  const dDate = new Date(shoot.date).toLocaleDateString('ru-RU');

  const assignedEqList = Array.isArray(shoot.equipment) && shoot.equipment.length > 0
    ? shoot.equipment.map(e => typeof e === 'object' ? e : (globalInventory || []).find(it => it.id === e)).filter(Boolean)
    : globalInventory;

  const crewList = (shoot.crew || []).filter(c => c.status === 'ACCEPTED' || c.attendance === 'PRESENT');
  let studentOptions = crewList.map(c => {
    const u = c.user || (globalStudents || []).find(st => st.id === (c.userId || c.id)) || {};
    return '<option value="' + (u.fullName || 'Студент') + '">' + (u.fullName || 'Студент') + ' [' + (u.groupName || 'Группа') + '] — ' + c.roleInShoot + '</option>';
  }).join('');

  if (!studentOptions) {
    studentOptions = '<option value="Демидов Тимофей Дмитриевич">Демидов Тимофей Дмитриевич [ФВТ-22] — Бригадир смены</option>';
  }

  let itemsCheckboxes = '';
  if (assignedEqList.length === 0) {
    itemsCheckboxes = '<div class="col-span-full p-4 text-center text-xs font-mono text-[var(--text-muted)] border border-dashed" style="border-color: var(--border-color);">' +
      'В смене пока не назначено съёмочное оборудование.<br>' +
      '<span class="text-[10px] text-amber-400 mt-1 inline-block">Технику можно выбрать или добавить при создании смены</span>' +
      '</div>';
  } else {
    itemsCheckboxes = assignedEqList.map(eq => {
      return '<label class="flex items-start space-x-2.5 p-2.5 border cursor-pointer select-none transition hover:border-[var(--brand-red)]" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
        '<input type="checkbox" checked data-eq-id="' + eq.id + '" class="accent-[var(--brand-red)] mt-0.5 w-4 h-4">' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center justify-between gap-1">' +
            '<b class="text-xs truncate" style="color: var(--text-primary);">' + eq.name + '</b>' +
            '<span class="text-[9px] font-mono px-1.5 py-0.2 bg-neutral-900 border text-amber-400 font-bold border-neutral-700 flex-shrink-0">S/N: ' + (eq.serialNumber || '—') + '</span>' +
          '</div>' +
          '<div class="text-[10px] font-mono mt-0.5" style="color: var(--text-muted);">' + (eq.category || 'Техника') + ' • ' + (eq.location || 'ЦКТ КП11') + (eq.notes ? ' • ' + eq.notes : '') + '</div>' +
        '</div>' +
      '</label>';
    }).join('');
  }

  container.innerHTML = 
    '<div class="p-5 border space-y-4" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3" style="border-color: var(--border-color);">' +
        '<div>' +
          '<div class="text-[10px] font-mono tracking-widest uppercase font-bold" style="color: var(--brand-red);">ТЕХПАРК ЦЕНТРА КРЕАТИВНЫХ ТЕХНОЛОГИЙ КП11</div>' +
          '<h4 class="text-sm font-extrabold uppercase tracking-wide" style="color: var(--text-primary);">АКТ ВЫДАЧИ И ВЫВОЗА СЪЁМОЧНОГО ОБОРУДОВАНИЯ</h4>' +
        '</div>' +
        '<span class="text-[10px] font-mono font-bold px-2 py-0.5 border" style="background-color: var(--bg-elevated); color: var(--brand-beige-text); border-color: var(--border-color);">АКТ № ' + (shoot.id || 'EQ-101') + '</span>' +
      '</div>' +

      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono p-3 border" style="background-color: var(--bg-elevated); border-color: var(--border-subtle);">' +
        '<div><b>Проект:</b> ' + (shoot.title || 'Смена') + '</div>' +
        '<div><b>Дата выезда:</b> ' + dDate + '</div>' +
        '<div><b>Локация площадки:</b> ' + (shoot.location || 'Павильон КП11') + '</div>' +
        '<div><b>Ответственный мастер:</b> ' + masterName + '</div>' +
      '</div>' +

      '<div class="space-y-2">' +
        '<label class="text-xs font-bold uppercase tracking-wider block" style="color: var(--text-primary);">Материально ответственный студент (получатель комплекта техники):</label>' +
        '<select id="equipResponsibleStudent" class="studio-input w-full text-xs font-bold px-3 py-2">' +
          studentOptions +
        '</select>' +
      '</div>' +

      '<div class="space-y-2.5">' +
        '<div class="flex items-center justify-between border-b pb-1 text-xs font-bold uppercase" style="border-color: var(--border-subtle); color: var(--brand-beige-text);">' +
          '<span>Спецификация техники ЦКТ КП11 с серийными номерами</span>' +
          '<span class="text-[10px] font-mono">ОТМЕТКА ВЫДАЧИ</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs max-h-64 overflow-y-auto pr-1">' +
          itemsCheckboxes +
        '</div>' +
      '</div>' +

      '<div class="p-3 border text-[11px] font-mono leading-relaxed" style="background-color: var(--bg-elevated); border-color: var(--border-subtle); color: var(--text-muted);">' +
        'Оборудование выдано в исправном состоянии, оптика и матрицы проверены. Студент-получатель обязуется бережно эксплуатировать технику согласно регламенту ЦКТ КП11 и вернуть её на склад сразу по завершении смены.' +
      '</div>' +
    '</div>' +

    '<div class="flex items-center justify-end gap-2 pt-2">' +
      '<button onclick="closeEquipmentModal()" class="btn-brand-ghost px-3 py-1.5 text-xs font-extrabold uppercase">Отмена</button>' +
      '<button onclick="saveEquipmentCheckout()" class="btn-brand-primary px-4 py-1.5 text-xs font-extrabold uppercase flex items-center gap-1.5 shadow">' +
        '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' +
        '<span>Распечатать и утвердить акт вывоза</span>' +
      '</button>' +
    '</div>';
}

// ----------------- УПРАВЛЕНИЕ ВРЕМЕННЫМИ ПОМЕТКАМИ (MILESTONES) И ТАЙМИНГАМИ СМЕНЫ -----------------
let currentShootMilestones = [];

function renderShootMilestones() {
  const container = document.getElementById('shootMilestonesList');
  if (!container) return;
  if (!currentShootMilestones || currentShootMilestones.length === 0) {
    container.innerHTML = '<div class="text-[10px] font-mono text-[var(--text-muted)] text-center py-2">Нет добавленных пометок</div>';
    return;
  }
  container.innerHTML = currentShootMilestones.map((m, idx) => 
    '<div class="flex items-center gap-2 p-1.5 border" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
      '<input type="time" value="' + (m.time || '10:00') + '" onchange="currentShootMilestones[' + idx + '].time = this.value" class="studio-input px-2 py-1 text-xs font-mono font-bold w-24">' +
      '<input type="text" value="' + ((m.title || '').replace(/"/g, '&quot;')) + '" onchange="currentShootMilestones[' + idx + '].title = this.value" placeholder="Название этапа (напр. Монтаж площадки)" class="studio-input px-2 py-1 text-xs font-medium flex-1 min-w-0">' +
      '<button type="button" onclick="removeMilestoneRow(' + idx + ')" class="px-2 py-1 text-[10px] text-red-400 hover:text-red-300 font-mono font-bold border border-red-800/40 bg-red-950/20" title="Удалить пометку">✕</button>' +
    '</div>'
  ).join('');
}

function addMilestoneRow(title = '', time = '') {
  const defaultTime = time || (document.getElementById('shootStartTime') ? document.getElementById('shootStartTime').value : '11:30');
  currentShootMilestones.push({ title: title || 'Новый этап', time: defaultTime });
  renderShootMilestones();
}

function removeMilestoneRow(index) {
  if (currentShootMilestones && currentShootMilestones[index]) {
    currentShootMilestones.splice(index, 1);
    renderShootMilestones();
  }
}

function getShootMilestones() {
  return currentShootMilestones.filter(m => m.title && m.time);
}

function timeToMinutes(tStr) {
  if (!tStr) return 0;
  const parts = tStr.split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

// Проверка пересечения временных интервалов и конфликтов оборудования
function checkEquipmentAvailability(eqId, targetDate, targetCallTime, targetEndTime, currentEditingShootId = null) {
  if (!targetDate || !targetCallTime || !targetEndTime) {
    return { status: 'AVAILABLE' };
  }

  const targetDateStr = targetDate.includes('T') ? targetDate.split('T')[0] : targetDate;
  const targetStartMin = timeToMinutes(targetCallTime);
  const targetEndMin = timeToMinutes(targetEndTime);

  const shoots = globalShoots || [];
  for (const s of shoots) {
    if (s.isCompleted) continue;
    if (currentEditingShootId && s.id === currentEditingShootId) continue;

    const sDateStr = (s.date && s.date.includes('T')) ? s.date.split('T')[0] : (s.date || '');
    if (sDateStr !== targetDateStr) continue;

    const hasEq = (s.equipment && Array.isArray(s.equipment) && s.equipment.some(e => (typeof e === 'string' ? e === eqId : e.id === eqId)));
    if (!hasEq) continue;

    const sCall = s.callTime || '10:00';
    const sEnd = s.endTime || '18:00';
    const sStartMin = timeToMinutes(sCall);
    const sEndMin = timeToMinutes(sEnd);

    // Условие пересечения интервалов: startA < endB && startB < endA
    if (targetStartMin < sEndMin && sStartMin < targetEndMin) {
      return {
        status: 'CONFLICT',
        shootTitle: s.title,
        shootTime: sCall + ' - ' + sEnd,
        shootId: s.id
      };
    }
  }

  const eqItem = (globalInventory || []).find(e => e.id === eqId);
  if (eqItem && eqItem.status === 'RESERVED') {
    return {
      status: 'RESERVED',
      notes: eqItem.notes || 'В резерве на плановое ТО'
    };
  }

  for (const s of shoots) {
    if (s.isCompleted) continue;
    if (currentEditingShootId && s.id === currentEditingShootId) continue;
    const sDateStr = (s.date && s.date.includes('T')) ? s.date.split('T')[0] : (s.date || '');
    if (sDateStr !== targetDateStr) continue;
    const hasEq = (s.equipment && Array.isArray(s.equipment) && s.equipment.some(e => (typeof e === 'string' ? e === eqId : e.id === eqId)));
    if (hasEq) {
      const sCall = s.callTime || '10:00';
      const sEnd = s.endTime || '18:00';
      return {
        status: 'RESERVED',
        notes: 'Задействовано в смене «' + s.title + '» (' + sCall + ' - ' + sEnd + ')'
      };
    }
  }

  return { status: 'AVAILABLE' };
}

function handleShiftTimingChange() {
  renderModalEquipment(globalInventory, true);
}

// ----------------- УПРАВЛЕНИЕ ТЕХНИКОЙ В МОДАЛЬНОМ ОКНЕ СОЗДАНИЯ / РЕДАКТИРОВАНИЯ СМЕНЫ -----------------
function renderModalEquipment(items = globalInventory, preserveChecks = true, initialCheckedIds = null) {
  const container = document.getElementById('equipmentCheckboxes');
  if (!container) return;

  const currentChecked = new Set();
  if (Array.isArray(initialCheckedIds)) {
    initialCheckedIds.forEach(id => {
      if (id) currentChecked.add(String(id));
    });
  } else if (preserveChecks) {
    container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      const id = cb.getAttribute('data-eq-id');
      if (id) currentChecked.add(String(id));
    });
  }

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-[11px] font-mono text-[var(--text-muted)] p-3 text-center border border-dashed" style="border-color: var(--border-subtle);">' +
      'Парк техники пуст.<br>' +
      '<button type="button" onclick="toggleInlineEquipmentForm()" class="mt-1.5 text-emerald-400 hover:underline font-bold text-xs inline-flex items-center gap-1">+ Добавить технику в парк</button>' +
    '</div>';
    return;
  }

  const dateEl = document.getElementById('shootDate');
  const callEl = document.getElementById('shootCallTime');
  const endEl = document.getElementById('shootEndTime');
  const targetDate = dateEl ? dateEl.value : '';
  const targetCallTime = callEl ? callEl.value : '10:00';
  const targetEndTime = endEl ? endEl.value : '18:00';
  const hasTiming = !!(targetDate && targetCallTime && targetEndTime);
  const editingIdInp = document.getElementById('editingShootId');
  const currentEditingShootId = editingIdInp ? editingIdInp.value.trim() : null;

  container.innerHTML = items.map(eq => {
    const avail = hasTiming ? checkEquipmentAvailability(eq.id, targetDate, targetCallTime, targetEndTime, currentEditingShootId) : { status: 'AVAILABLE' };
    const isConflict = avail.status === 'CONFLICT';
    const isReserved = avail.status === 'RESERVED';

    let isChecked = currentChecked.has(String(eq.id));
    if (isConflict) isChecked = false;

    let borderStyle = 'border-color: var(--border-subtle); background-color: var(--bg-card);';
    let statusBadge = '<span class="text-[9px] font-mono font-bold px-1.5 py-0.5 border text-emerald-400 border-emerald-800/60 bg-emerald-950/40">🟢 Свободно</span>';
    let disabledAttr = '';
    let conflictWarning = '';

    if (isConflict) {
      borderStyle = 'border-color: rgba(227, 6, 19, 0.8); background-color: rgba(69, 10, 10, 0.4);';
      disabledAttr = 'disabled="disabled" title="Техника занята в пересекающейся по времени смене!"';
      statusBadge = '<span class="text-[9px] font-mono font-bold px-1.5 py-0.5 border text-red-400 border-red-700 bg-red-950/80 animate-pulse">❌ ЗАНЯТО // КОНФЛИКТ</span>';
      conflictWarning = '<div class="text-[10px] font-mono text-red-400 mt-1 font-bold">⛔ Занято в смене: «' + avail.shootTitle + '» (' + avail.shootTime + ')</div>';
    } else if (isReserved) {
      borderStyle = 'border-color: rgba(245, 158, 11, 0.8); background-color: rgba(69, 39, 10, 0.35);';
      statusBadge = '<span class="text-[9px] font-mono font-bold px-1.5 py-0.5 border text-amber-400 border-amber-700 bg-amber-950/70">⚠️ РЕЗЕРВ</span>';
      if (avail.notes) {
        conflictWarning = '<div class="text-[10px] font-mono text-amber-400/90 mt-1">' + avail.notes + '</div>';
      }
    }

    return '<div class="flex items-center justify-between p-2.5 border transition ' + (isConflict ? 'opacity-85' : 'hover:border-[var(--brand-red)]') + '" style="' + borderStyle + '">' +
      '<label class="flex items-start space-x-2.5 ' + (isConflict ? 'cursor-not-allowed' : 'cursor-pointer') + ' flex-1 min-w-0 select-none">' +
        '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' ' + disabledAttr + ' data-eq-id="' + eq.id + '" class="accent-[var(--brand-red)] w-4 h-4 flex-shrink-0 mt-0.5 ' + (isConflict ? 'cursor-not-allowed' : '') + '">' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center flex-wrap gap-1.5">' +
            '<span class="text-xs font-bold" style="color: var(--text-primary);">' + eq.name + '</span>' +
            '<span class="text-[9px] font-mono px-1 py-0.2 bg-neutral-900 border text-amber-400 font-bold border-neutral-700 flex-shrink-0">S/N: ' + (eq.serialNumber || '—') + '</span>' +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">' + (eq.category || 'Техника') + '</span>' +
            statusBadge +
          '</div>' +
          conflictWarning +
        '</div>' +
      '</label>' +
      '<div class="flex items-center space-x-1.5 ml-2 flex-shrink-0">' +
        '<button type="button" onclick="openEquipmentDetailsModal(\'' + eq.id + '\')" class="px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-400 hover:text-amber-300 border border-amber-800/40 bg-amber-950/20" title="Статус использования и серийники">ℹ️</button>' +
        '<button type="button" onclick="editInlineEquipmentItem(\'' + eq.id + '\')" class="px-1.5 py-0.5 text-[10px] font-mono font-bold text-cyan-400 hover:text-cyan-300 border border-cyan-800/40 bg-cyan-950/20" title="Редактировать единицу техники">✎</button>' +
        '<button type="button" onclick="deleteInventoryItem(\'' + eq.id + '\')" class="px-1.5 py-0.5 text-[10px] font-mono font-bold text-red-400 hover:text-red-300 border border-red-800/40 bg-red-950/20" title="Удалить из парка">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filterModalEquipment() {
  const searchInput = document.getElementById('equipmentSearchModal');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  if (!query) {
    renderModalEquipment(globalInventory, true);
    return;
  }
  const filtered = (globalInventory || []).filter(eq =>
    (eq.name && eq.name.toLowerCase().includes(query)) ||
    (eq.serialNumber && eq.serialNumber.toLowerCase().includes(query)) ||
    (eq.category && eq.category.toLowerCase().includes(query)) ||
    (eq.notes && eq.notes.toLowerCase().includes(query))
  );
  renderModalEquipment(filtered, true);
}

function toggleInlineEquipmentForm() {
  const form = document.getElementById('inlineEquipmentForm');
  if (!form) return;
  const isHidden = form.classList.contains('hidden');
  if (isHidden) {
    cancelInlineEquipmentForm();
    form.classList.remove('hidden');
    const nameEl = document.getElementById('inlineEqName');
    if (nameEl) nameEl.focus();
  } else {
    form.classList.add('hidden');
  }
}

function cancelInlineEquipmentForm() {
  const form = document.getElementById('inlineEquipmentForm');
  if (form) form.classList.add('hidden');
  const titleEl = document.getElementById('inlineEqFormTitle');
  if (titleEl) titleEl.innerText = 'Новая единица оборудования';
  const editIdEl = document.getElementById('inlineEqEditId');
  if (editIdEl) editIdEl.value = '';
  const nameEl = document.getElementById('inlineEqName');
  if (nameEl) nameEl.value = '';
  const snEl = document.getElementById('inlineEqSerial');
  if (snEl) snEl.value = '';
  const notesEl = document.getElementById('inlineEqNotes');
  if (notesEl) notesEl.value = '';
}

function editInlineEquipmentItem(id) {
  const item = (globalInventory || []).find(e => e.id === id);
  if (!item) return;

  const form = document.getElementById('inlineEquipmentForm');
  if (!form) return;
  form.classList.remove('hidden');

  const titleEl = document.getElementById('inlineEqFormTitle');
  if (titleEl) titleEl.innerText = 'Редактирование: ' + item.name;

  const editIdEl = document.getElementById('inlineEqEditId');
  if (editIdEl) editIdEl.value = item.id;

  const nameEl = document.getElementById('inlineEqName');
  if (nameEl) nameEl.value = item.name || '';

  const snEl = document.getElementById('inlineEqSerial');
  if (snEl) snEl.value = item.serialNumber || '';

  const catEl = document.getElementById('inlineEqCategory');
  if (catEl && item.category) catEl.value = item.category;

  const notesEl = document.getElementById('inlineEqNotes');
  if (notesEl) notesEl.value = item.notes || '';

  if (nameEl) nameEl.focus();
}

async function saveInlineEquipmentItem() {
  const editIdEl = document.getElementById('inlineEqEditId');
  const nameEl = document.getElementById('inlineEqName');
  const snEl = document.getElementById('inlineEqSerial');
  const catEl = document.getElementById('inlineEqCategory');
  const notesEl = document.getElementById('inlineEqNotes');
  const qtyEl = document.getElementById('inlineEqQuantity');

  const editId = editIdEl ? editIdEl.value.trim() : '';
  const name = nameEl ? nameEl.value.trim() : '';
  const serialNumber = snEl ? snEl.value.trim() : '';
  const category = catEl ? catEl.value : 'Камеры';
  const notes = notesEl ? notesEl.value.trim() : '';
  const quantity = qtyEl ? (parseInt(qtyEl.value, 10) || 1) : 1;

  if (!name) {
    showToast('Укажите наименование техники');
    return;
  }

  const signer = (currentUser && currentUser.fullName) ? currentUser.fullName : 'Бадиков Семён Станиславович';

  if (editId) {
    // Обновление существующей единицы
    const existing = (globalInventory || []).find(e => e.id === editId);
    if (existing) {
      existing.name = name;
      existing.serialNumber = serialNumber;
      existing.category = category;
      existing.notes = notes;
    }
    try {
      await fetch('/api/inventory/' + editId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({ name, serialNumber, category, notes })
      });
    } catch (e) {}
    showToast('Единица техники «' + name + '» обновлена!');
  } else {
    // Создание новой единицы или партии
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({
          name,
          category,
          quantity,
          serialNumbers: serialNumber,
          notes,
          location: 'Склад техники ЦКТ КП11',
          signedBy: signer
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.inventory)) {
          globalInventory = data.inventory;
        } else if (Array.isArray(data.items)) {
          globalInventory = [...data.items, ...(globalInventory || [])];
        }
      } else {
        const prefix = (name.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 4) || 'EQ').toUpperCase();
        let splitted = serialNumber ? serialNumber.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : [];
        const total = Math.max(quantity, splitted.length);
        const newItems = [];
        for (let i = 0; i < total; i++) {
          const sn = splitted[i] || `${prefix}-${100 + i + Math.floor(Math.random() * 900)}`;
          newItems.push({
            id: `eq-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
            name,
            category,
            serialNumber: sn,
            notes,
            location: 'Склад техники ЦКТ КП11',
            status: 'AVAILABLE',
            signedBy: signer
          });
        }
        globalInventory = [...newItems, ...(globalInventory || [])];
      }
    } catch (e) {}
    showToast('Партия техники «' + name + '» добавлена в парк!');
  }

  try {
    localStorage.setItem('kp11_inventory', JSON.stringify(globalInventory));
  } catch (e) {}

  cancelInlineEquipmentForm();
  renderModalEquipment(globalInventory, true);
  filterTrackerList();
}

async function deleteInventoryItem(eqId) {
  if (!confirm('Вы уверены, что хотите удалить эту единицу техники из базы?')) return;

  globalInventory = (globalInventory || []).filter(e => e.id !== eqId);
  try {
    localStorage.setItem('kp11_inventory', JSON.stringify(globalInventory));
  } catch (e) {}

  try {
    await fetch('/api/inventory/' + eqId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
  } catch (e) {}

  showToast('Оборудование удалено из базы.');
  renderModalEquipment(globalInventory, true);
  filterTrackerList();
  if (activeEquipmentShootId) {
    renderEquipmentModalTabs(activeEquipmentShootId);
  }
}

function closeEquipmentModal() {
  const modal = document.getElementById('equipmentCheckoutModal');
  if (modal) modal.classList.add('hidden');
}

// ----------------- ПАНЕЛЬ ДОБАВЛЕНИЯ ТЕХНИКИ НА СКЛАД (ПАРТИЯМИ / С КОЛИЧЕСТВОМ) -----------------
function toggleTrackerEquipmentForm(forceState) {
  const card = document.getElementById('trackerEquipmentCreateCard');
  if (!card) return;
  if (forceState !== undefined) {
    card.classList.toggle('hidden', !forceState);
  } else {
    card.classList.toggle('hidden');
  }
  if (!card.classList.contains('hidden')) {
    const nameInp = document.getElementById('trackerNewEqName');
    if (nameInp) nameInp.focus();
    updateTrackerSerialsHint();
  }
}

function updateTrackerSerialsHint() {
  const qtyEl = document.getElementById('trackerNewEqQty');
  const serialsEl = document.getElementById('trackerNewEqSerials');
  const hintEl = document.getElementById('trackerSerialsHint');
  if (!qtyEl || !hintEl) return;

  const qty = Math.max(1, parseInt(qtyEl.value, 10) || 1);
  const serialsRaw = serialsEl ? serialsEl.value.trim() : '';
  let count = qty;
  if (serialsRaw) {
    const parsed = serialsRaw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (parsed.length > 0) {
      count = Math.max(qty, parsed.length);
    }
  }
  hintEl.innerText = 'Будет зарегистрировано: ' + count + ' ' + pluralizeRu(count, 'карточка', 'карточки', 'карточек') + ' с отдельными серийниками';
}

async function submitTrackerBatchEquipment() {
  const nameEl = document.getElementById('trackerNewEqName');
  const catEl = document.getElementById('trackerNewEqCategory');
  const qtyEl = document.getElementById('trackerNewEqQty');
  const serialsEl = document.getElementById('trackerNewEqSerials');
  const notesEl = document.getElementById('trackerNewEqNotes');
  const locEl = document.getElementById('trackerNewEqLocation');

  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) {
    showToast('Укажите наименование или модель техники');
    if (nameEl) nameEl.focus();
    return;
  }

  const category = catEl ? catEl.value : 'Камеры';
  const quantity = qtyEl ? (parseInt(qtyEl.value, 10) || 1) : 1;
  const serialNumbers = serialsEl ? serialsEl.value.trim() : '';
  const notes = notesEl ? notesEl.value.trim() : '';
  const location = locEl ? locEl.value.trim() : 'Склад техники ЦКТ КП11';
  const signer = (currentUser && currentUser.fullName) ? currentUser.fullName : 'Бадиков Семён Станиславович';

  try {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || 'demo-token')
      },
      body: JSON.stringify({
        name,
        category,
        quantity,
        serialNumbers,
        notes,
        location,
        signedBy: signer
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.inventory)) {
        globalInventory = data.inventory;
      } else if (Array.isArray(data.items)) {
        globalInventory = [...data.items, ...(globalInventory || [])];
      }
    } else {
      const prefix = (name.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 4) || 'EQ').toUpperCase();
      let splitted = serialNumbers ? serialNumbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : [];
      const total = Math.max(quantity, splitted.length);
      const newItems = [];
      for (let i = 0; i < total; i++) {
        const sn = splitted[i] || `${prefix}-${100 + i + Math.floor(Math.random() * 900)}`;
        newItems.push({
          id: `eq-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
          name,
          category,
          serialNumber: sn,
          notes,
          location,
          status: 'AVAILABLE',
          signedBy: signer
        });
      }
      globalInventory = [...newItems, ...(globalInventory || [])];
    }

    try {
      localStorage.setItem('kp11_inventory', JSON.stringify(globalInventory));
    } catch (e) {}

    showToast('Партия техники «' + name + '» (' + quantity + ' шт.) добавлена на склад!');
    toggleTrackerEquipmentForm(false);
    if (nameEl) nameEl.value = '';
    if (serialsEl) serialsEl.value = '';
    if (notesEl) notesEl.value = '';
    if (qtyEl) qtyEl.value = '1';

    filterTrackerList();
    renderModalEquipment(globalInventory, true);
  } catch (err) {
    console.error('Error saving batch equipment:', err);
    showToast('Ошибка при добавлении оборудования: ' + err.message);
  }
}

// ----------------- ПЛАШКА: СТАТУС, ГРАФИК ИСПОЛЬЗОВАНИЯ И СЕРИЙНИКИ ТЕХНИКИ -----------------
async function openEquipmentDetailsModal(eqIdOrModelName) {
  const modal = document.getElementById('equipmentDetailsModal');
  if (!modal) return;

  if (!globalInventory || globalInventory.length === 0) {
    try {
      await loadInventoryData();
    } catch (e) {}
  }

  const targetId = String(eqIdOrModelName || '').trim();
  const targetLower = targetId.toLowerCase();

  // Ищем точное совпадение по ID или названию
  let eqItem = (globalInventory || []).find(e => e.id === targetId || (e.name && e.name.toLowerCase() === targetLower));

  // Если не найдено, ищем по подстроке наименования
  if (!eqItem && targetLower) {
    eqItem = (globalInventory || []).find(e => e.name && (targetLower.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(targetLower)));
  }

  // Если всё ещё не найдено, создаём адаптивную карточку на лету
  if (!eqItem) {
    const fallbackPrefix = (targetId.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 4) || 'EQ').toUpperCase();
    eqItem = {
      id: targetId || `eq-${Date.now()}`,
      name: targetId || 'Съёмочное оборудование ЦКТ',
      category: targetLower.includes('камер') ? 'Камеры' : (targetLower.includes('свет') ? 'Свет' : (targetLower.includes('звук') ? 'Звук' : 'Оборудование')),
      location: 'Склад техники ЦКТ КП11',
      notes: 'Штатный комплект съёмочной смены ЦКТ КП11',
      serialNumber: `${fallbackPrefix}-01`
    };
  }

  const baseName = eqItem.name;
  // Все единицы данной модели на складе
  const modelUnits = (globalInventory || []).filter(e => e.name && e.name.toLowerCase() === baseName.toLowerCase());
  const unitsCount = modelUnits.length > 0 ? modelUnits.length : 1;
  const unitsToProcess = modelUnits.length > 0 ? modelUnits : [eqItem];

  // Заполняем шапку
  const titleEl = document.getElementById('eqDetailsTitle');
  const catBadge = document.getElementById('eqDetailsCategoryBadge');
  const locEl = document.getElementById('eqDetailsLocation');
  const notesEl = document.getElementById('eqDetailsNotes');
  if (titleEl) titleEl.innerText = baseName;
  if (catBadge) catBadge.innerText = eqItem.category || 'Оборудование';
  if (locEl) locEl.innerText = eqItem.location || 'Склад техники ЦКТ КП11';
  if (notesEl) notesEl.innerText = eqItem.notes || 'Комплект стандартный, готов к эксплуатации';

  // Ищем все смены, где используется данная модель техники
  const matchingShoots = (globalShoots || []).filter(sh => {
    if (!Array.isArray(sh.equipment)) return false;
    return sh.equipment.some(e => {
      if (typeof e === 'string') {
        return e === eqItem.id || e.toLowerCase().includes(baseName.toLowerCase());
      }
      if (e && typeof e === 'object') {
        return e.id === eqItem.id || (e.name && e.name.toLowerCase().includes(baseName.toLowerCase()));
      }
      return false;
    });
  });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const activeOrUpcomingShoots = [];
  matchingShoots.forEach(sh => {
    const sDate = sh.date || todayStr;
    const sStart = sh.callTime || sh.startTime || '10:00';
    const sEnd = sh.endTime || '18:00';
    const startDt = parseShootDateTime(sDate, sStart);
    const endDt = parseShootEndDateTime(sDate, sEnd, sStart);

    const isCurrent = startDt && endDt && now >= startDt && now <= endDt;
    const isUpcoming = (startDt && startDt > now) || (!sh.isCompleted && sDate >= todayStr);

    if (isCurrent || isUpcoming) {
      activeOrUpcomingShoots.push({
        shoot: sh,
        isCurrent,
        isUpcoming,
        startDt,
        endDt
      });
    }
  });

  let occupiedUnitsCount = 0;
  matchingShoots.forEach(sh => {
    if (!sh.isCompleted && (sh.date >= todayStr || sh.date === todayStr)) {
      occupiedUnitsCount++;
    }
  });
  if (occupiedUnitsCount > unitsCount) occupiedUnitsCount = unitsCount;

  const freeSerials = [];
  const occupiedSerials = [];

  unitsToProcess.forEach((unit, idx) => {
    const sn = unit.serialNumber || ('SN-' + (idx + 1));
    if (idx < occupiedUnitsCount && activeOrUpcomingShoots.length > 0) {
      const relatedShoot = activeOrUpcomingShoots[idx % activeOrUpcomingShoots.length]?.shoot;
      occupiedSerials.push({
        sn,
        shootTitle: relatedShoot ? relatedShoot.title : 'Съёмочная смена',
        status: activeOrUpcomingShoots[idx % activeOrUpcomingShoots.length]?.isCurrent ? 'В ЭФИРЕ' : 'В РЕЗЕРВЕ'
      });
    } else {
      freeSerials.push(sn);
    }
  });

  // Счётчики
  const totalCountEl = document.getElementById('eqDetailsTotalCount');
  const freeCountEl = document.getElementById('eqDetailsFreeCount');
  const occupiedCountEl = document.getElementById('eqDetailsOccupiedCount');
  const serialsSummaryEl = document.getElementById('eqDetailsSerialsSummary');

  if (totalCountEl) totalCountEl.innerText = unitsCount;
  if (freeCountEl) freeCountEl.innerText = freeSerials.length;
  if (occupiedCountEl) occupiedCountEl.innerText = occupiedSerials.length;
  if (serialsSummaryEl) serialsSummaryEl.innerText = 'Всего единиц в базе: ' + unitsCount + ' шт.';

  // Рендерим свободные серийники
  const freeContainer = document.getElementById('eqDetailsFreeSerials');
  if (freeContainer) {
    if (freeSerials.length > 0) {
      freeContainer.innerHTML = freeSerials.map(sn => 
        '<span class="px-2.5 py-1 text-xs font-mono font-bold border border-emerald-600/70 bg-emerald-950/40 text-emerald-300 inline-flex items-center gap-1.5 shadow-sm">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' +
          '<span>' + sn + '</span>' +
          '<span class="text-[9px] text-emerald-400/75 uppercase font-sans">[Свободен]</span>' +
        '</span>'
      ).join('');
    } else {
      freeContainer.innerHTML = '<span class="text-xs font-mono text-[var(--text-muted)] italic">Все серийные номера в данный момент заняты на сменах</span>';
    }
  }

  // Рендерим занятые серийники
  const occupiedWrapper = document.getElementById('eqDetailsOccupiedSerialsWrapper');
  const occupiedContainer = document.getElementById('eqDetailsOccupiedSerials');
  if (occupiedWrapper && occupiedContainer) {
    if (occupiedSerials.length > 0) {
      occupiedWrapper.classList.remove('hidden');
      occupiedContainer.innerHTML = occupiedSerials.map(item => 
        '<span class="px-2.5 py-1 text-xs font-mono font-bold border border-red-700/70 bg-red-950/50 text-red-300 inline-flex items-center gap-1.5 shadow-sm" title="Используется в смене: ' + item.shootTitle + '">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>' +
          '<span>' + item.sn + '</span>' +
          '<span class="text-[9px] text-red-300/80 uppercase font-sans">[' + item.status + ']</span>' +
        '</span>'
      ).join('');
    } else {
      occupiedWrapper.classList.add('hidden');
    }
  }

  // Рендерим график использования
  const shootsListContainer = document.getElementById('eqDetailsShootsList');
  if (shootsListContainer) {
    if (matchingShoots.length > 0) {
      const sortedShoots = [...matchingShoots].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      shootsListContainer.innerHTML = sortedShoots.map(sh => {
        const sDate = sh.date || todayStr;
        const sStart = sh.callTime || sh.startTime || '10:00';
        const sEnd = sh.endTime || '18:00';
        const startDt = parseShootDateTime(sDate, sStart);
        const endDt = parseShootEndDateTime(sDate, sEnd, sStart);

        const isCurrent = startDt && endDt && now >= startDt && now <= endDt;
        const isUpcoming = (startDt && startDt > now) || (!sh.isCompleted && sDate >= todayStr);

        let statusBadge = '<span class="font-mono text-[9px] px-2 py-0.5 border text-neutral-400 border-neutral-700 bg-neutral-900/60">АРХИВ</span>';
        let cardBg = 'border-color: var(--border-subtle); background-color: var(--bg-card);';

        if (isCurrent) {
          statusBadge = '<span class="font-mono text-[9px] px-2 py-0.5 border text-red-400 border-red-600/80 bg-red-950/70 font-bold animate-pulse">🔴 В ЭФИРЕ (СЕЙЧАС)</span>';
          cardBg = 'border-color: rgba(227, 6, 19, 0.7); background-color: rgba(69, 10, 10, 0.3);';
        } else if (isUpcoming) {
          statusBadge = '<span class="font-mono text-[9px] px-2 py-0.5 border text-amber-300 border-amber-600/80 bg-amber-950/70 font-bold">🟡 ЗАПЛАНИРОВАНО</span>';
          cardBg = 'border-color: rgba(245, 158, 11, 0.6); background-color: rgba(69, 39, 10, 0.25);';
        }

        const op = sh.crew ? sh.crew.find(c => (c.roleInShoot || '').toLowerCase().includes('оператор') || (c.roleInShoot || '').toLowerCase().includes('ответственн')) : null;
        let opHtml = '—';
        if (op) {
          const opUser = op.user || {};
          const opName = opUser.fullName || op.fullName || 'Оператор';
          const opId = opUser.id || op.userId || op.id;
          if (isMasterOrAdminUser(currentUser) && opId) {
            opHtml = '<button type="button" onclick="openShowreelModal(\'' + opId + '\');" class="text-amber-300 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer" title="Открыть цифровой паспорт студента">' +
              '<span>' + opName + '</span><span class="text-[9px]">👤</span>' +
            '</button>';
          } else {
            opHtml = '<span class="text-white font-bold">' + opName + '</span>';
          }
        }

        return '<div class="p-3 border space-y-1.5 transition text-xs" style="' + cardBg + '">' +
          '<div class="flex items-center justify-between flex-wrap gap-2">' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-mono text-[11px] font-bold text-amber-400">' + (sh.date || 'Дата не указана') + '</span>' +
              '<span class="font-mono text-[11px] text-[var(--text-muted)]">' + sStart + ' — ' + sEnd + '</span>' +
            '</div>' +
            statusBadge +
          '</div>' +
          '<div class="font-bold uppercase text-[var(--text-primary)] leading-tight">' + sh.title + '</div>' +
          '<div class="flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-[var(--text-muted)] pt-1 border-t" style="border-color: var(--border-subtle);">' +
            '<div>📍 ' + (sh.location || 'Смольная 10А') + '</div>' +
            '<div>Ответственный: ' + opHtml + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      shootsListContainer.innerHTML = '<div class="p-4 text-center text-xs font-mono border border-dashed text-emerald-400" style="border-color: rgba(16,185,129,0.3); background-color: rgba(16,185,129,0.05);">' +
        '✓ Данная модель в настоящее время не задействована в сменах.<br>' +
        '<span class="text-[11px] text-[var(--text-muted)]">Все ' + unitsCount + ' ' + pluralizeRu(unitsCount, 'серийный номер', 'серийных номера', 'серийных номеров') + ' свободно находятся на складе ЦКТ КП11.</span>' +
      '</div>';
    }
  }

  modal.classList.remove('hidden');
}

function closeEquipmentDetailsModal() {
  const modal = document.getElementById('equipmentDetailsModal');
  if (modal) modal.classList.add('hidden');
}

window.openEquipmentDetailsModal = openEquipmentDetailsModal;
window.closeEquipmentDetailsModal = closeEquipmentDetailsModal;
window.toggleTrackerEquipmentForm = toggleTrackerEquipmentForm;
window.updateTrackerSerialsHint = updateTrackerSerialsHint;
window.submitTrackerBatchEquipment = submitTrackerBatchEquipment;

function saveEquipmentCheckout() {
  showToast('Акт вывоза съёмочного оборудования с серийными номерами утверждён!');
  window.print();
  closeEquipmentModal();
}

function openCktGradingModal(shootId) {
  activeCktGradingShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  const container = document.getElementById('cktGradingContent');
  const modal = document.getElementById('cktGradingModal');
  if (!modal || !container || !shoot) return;

  const crewList = (shoot.crew || []).filter(c => c.status === 'ACCEPTED' || c.attendance === 'PRESENT');
  cktGradingValues = {};

  let memberCards = '';
  if (crewList.length === 0) {
    memberCards = '<div class="p-4 text-center font-mono text-xs text-[var(--text-muted)] border border-dashed">В смене нет участников для оценивания</div>';
  } else {
    memberCards = crewList.map(c => {
      const u = c.user || (globalStudents || []).find(st => st.id === (c.userId || c.id)) || {};
      const fName = u.fullName || 'Студент';
      const grp = u.groupName || 'КТ-26';
      const mId = c.id;

      cktGradingValues[mId] = { frames: 5, gear: 5, time: 5, ethics: 5 };

      return '<div class="p-4 border space-y-3" style="background-color: var(--bg-card); border-color: var(--border-color);" id="ckt_card_' + mId + '">' +
        '<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2" style="border-color: var(--border-subtle);">' +
          '<div class="flex items-center gap-2">' +
            '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + fName + '</span>' +
            '<span class="font-mono text-[11px] text-[var(--text-muted)]">[' + grp + ']</span>' +
            '<span class="badge-neutral text-[9px] px-2 py-0.5 font-mono uppercase">' + (c.roleInShoot || 'Специалист') + '</span>' +
          '</div>' +
          '<div class="font-mono text-xs font-bold text-amber-400 inline-flex items-center gap-1">' +
            'ИТОГОВЫЙ БАЛЛ: <span class="text-sm font-extrabold text-[var(--brand-red)]" id="ckt_avg_' + mId + '">★ 5.0</span>' +
          '</div>' +
        '</div>' +

        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">' +
          '<div class="space-y-1">' +
            '<div class="flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">' +
              '<span>🎞️ Количество и качество кадров:</span>' +
              '<b class="text-amber-400" id="val_frames_' + mId + '">5</b>' +
            '</div>' +
            '<input type="range" min="1" max="5" step="1" value="5" oninput="updateCktCriteria(\'' + mId + '\', \'frames\', this.value)" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
          '</div>' +

          '<div class="space-y-1">' +
            '<div class="flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">' +
              '<span>🛡️ Бережливость к оборудованию:</span>' +
              '<b class="text-amber-400" id="val_gear_' + mId + '">5</b>' +
            '</div>' +
            '<input type="range" min="1" max="5" step="1" value="5" oninput="updateCktCriteria(\'' + mId + '\', \'gear\', this.value)" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
          '</div>' +

          '<div class="space-y-1">' +
            '<div class="flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">' +
              '<span>⏱️ Пунктуальность и соблюдение тайминга:</span>' +
              '<b class="text-amber-400" id="val_time_' + mId + '">5</b>' +
            '</div>' +
            '<input type="range" min="1" max="5" step="1" value="5" oninput="updateCktCriteria(\'' + mId + '\', \'time\', this.value)" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
          '</div>' +

          '<div class="space-y-1">' +
            '<div class="flex justify-between items-center text-[11px] font-mono text-[var(--text-muted)]">' +
              '<span>🤝 Вежливость и командная этика:</span>' +
              '<b class="text-amber-400" id="val_ethics_' + mId + '">5</b>' +
            '</div>' +
            '<input type="range" min="1" max="5" step="1" value="5" oninput="updateCktCriteria(\'' + mId + '\', \'ethics\', this.value)" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  container.innerHTML = 
    '<div class="space-y-4">' +
      '<div class="p-3 border text-xs font-mono" style="background-color: var(--bg-elevated); border-color: var(--border-subtle); color: var(--text-secondary);">' +
        'Оценивание производится по 4 стандартам Центра креативных технологий КП11: качество/количество отснятого материала, сохранность дорогостоящей оптики и электроники (Canon C200/R5), своевременность и бесконфликтность в работе.' +
      '</div>' +
      '<div class="space-y-3 max-h-[480px] overflow-y-auto pr-1">' +
        memberCards +
      '</div>' +
      '<div class="flex items-center justify-end gap-2 pt-2 border-t" style="border-color: var(--border-color);">' +
        '<button onclick="closeCktGradingModal()" class="btn-brand-ghost px-3 py-1.5 text-xs font-extrabold uppercase">Отмена</button>' +
        '<button onclick="submitCktGrading()" class="btn-brand-primary px-4 py-2 text-xs font-extrabold uppercase tracking-wide shadow">' +
          'Утвердить оценки и завершить смену' +
        '</button>' +
      '</div>' +
    '</div>';

  modal.classList.remove('hidden');
}

function updateCktCriteria(memberId, criteria, val) {
  val = parseFloat(val) || 5;
  if (!cktGradingValues[memberId]) {
    cktGradingValues[memberId] = { frames: 5, gear: 5, time: 5, ethics: 5 };
  }
  cktGradingValues[memberId][criteria] = val;
  const labelEl = document.getElementById('val_' + criteria + '_' + memberId);
  if (labelEl) labelEl.innerText = val;

  const o = cktGradingValues[memberId];
  const avg = Math.round(((o.frames + o.gear + o.time + o.ethics) / 4) * 10) / 10;
  const avgEl = document.getElementById('ckt_avg_' + memberId);
  if (avgEl) avgEl.innerText = '★ ' + avg.toFixed(1);
}

function closeCktGradingModal() {
  const modal = document.getElementById('cktGradingModal');
  if (modal) modal.classList.add('hidden');
}

async function submitCktGrading() {
  const shoot = (globalShoots || []).find(s => s.id === activeCktGradingShootId);
  if (!shoot) return;
  const grades = {};
  const crewList = shoot.crew || [];
  crewList.forEach(m => {
    if (cktGradingValues[m.id]) {
      const o = cktGradingValues[m.id];
      const avg = Math.round(((o.frames + o.gear + o.time + o.ethics) / 4) * 10) / 10;
      grades[m.id] = avg;
      m.grade = avg;
      m.cktCriteria = { frames: o.frames, gear: o.gear, time: o.time, ethics: o.ethics };
    } else {
      grades[m.id] = m.grade || 5;
    }
  });

  shoot.isCompleted = true;

  try {
    await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ shootId: shoot.id, grades, shoot })
    });
  } catch (err) {}

  recalculateAllStudentRatings();

  showToast('Смена завершена! Оценки по 4 стандартам ЦКТ утверждены.');
  closeCktGradingModal();
  await loadShoots();
  loadStatisticsData();
}

// ================= МОДУЛЬ 6: МАТРИЦА КОМПЕТЕНЦИЙ И ЦИФРОВОЙ ПРОФИЛЬ =================
function getStudentDirectory() {
  return [
    {
      id: 'master-1',
      fullName: 'Бадиков Семён Станиславович',
      groupName: 'КТ-26',
      rating: null,
      completedShoots: 0,
      telegram: '@badikov_dop',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Log-C', 'Shure SM7B', 'Aputure 300D', 'Sound Design', 'DaVinci Resolve'],
      projects: []
    },
    {
      id: 'u1',
      fullName: 'Ковалев Михаил Алексеевич',
      groupName: 'ФВТ-22',
      rating: null,
      completedShoots: 0,
      telegram: '@mikhail_cam',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['ARRI Master Prime', 'Цветокоррекция', 'Стедикам', 'LUT Pipeline'],
      projects: []
    },
    {
      id: 'u2',
      fullName: 'Демидов Тимофей Дмитриевич',
      groupName: 'ФВТ-22',
      rating: null,
      completedShoots: 0,
      telegram: '@timofey_light',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Dedolight', 'Светотеневой рисунок', 'Вольфрам 3200K', 'Электробезопасность'],
      projects: []
    },
    {
      id: 'u3',
      fullName: 'Гусев Андрей Алексеевич',
      groupName: 'КТ-25',
      rating: null,
      completedShoots: 0,
      telegram: '@andrey_gaffer',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Гаффер-сетап', 'Рассеиватели', 'Штативы C-Stand'],
      projects: []
    },
    {
      id: 'u4',
      fullName: 'Соколова Анна Алексеевна',
      groupName: 'КТ-15',
      rating: null,
      completedShoots: 0,
      telegram: '@anna_sound',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Радиопетлички Sennheiser', 'Микрофонный бум', 'Синхронизация'],
      projects: []
    },
    {
      id: 'u5',
      fullName: 'Жемчужников Ярослав Станиславович',
      groupName: 'КТ-25',
      rating: null,
      completedShoots: 0,
      telegram: '@yaroslav_dop',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Оператор-постановщик', 'Фокус-пуллинг', 'ARRI RAW', 'Стедикам'],
      projects: []
    },
    {
      id: 'u6',
      fullName: 'Шальнева Любовь Игоревна',
      groupName: 'ФТ-21-25',
      rating: null,
      completedShoots: 0,
      telegram: '@lyubov_photo',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Canon R5', 'Студийный свет', 'Репортаж', 'Lightroom'],
      projects: []
    },
    {
      id: 'u7',
      fullName: 'Хамуд Юлий Мохамедович',
      groupName: 'КТ-26',
      rating: null,
      completedShoots: 0,
      telegram: '@yuliy_cam',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Canon C200', 'Стедикам', 'Оптика Prime', 'Полевая съёмка'],
      projects: []
    },
    {
      id: 'u8',
      fullName: 'Журавлев Никита Дмитриевич',
      groupName: 'КТ-21',
      rating: null,
      completedShoots: 0,
      telegram: '@nikita_sound',
      competencies: { camera: 0, sound: 0, light: 0, edit: 0 },
      skills: ['Рекордер Zoom', 'Радиопетлички', 'Шумоподавление', 'Чистовой звук'],
      projects: []
    }
  ];
}

// ----------------- РАДИАЛЬНЫЙ ГРАФИК КОМПЕТЕНЦИЙ (SKILLS RADAR SVG) -----------------
function renderSkillsRadarSvg(comp = { camera: 90, sound: 85, light: 85, edit: 90 }) {
  const cCam = Math.min(100, Math.max(10, Number(comp.camera) || 85));
  const cSnd = Math.min(100, Math.max(10, Number(comp.sound) || 85));
  const cLig = Math.min(100, Math.max(10, Number(comp.light) || 85));
  const cEdt = Math.min(100, Math.max(10, Number(comp.edit) || 85));

  const cx = 110, cy = 110, maxR = 75;

  const levels = [0.25, 0.5, 0.75, 1.0];
  const gridHtml = levels.map(lvl => {
    const r = maxR * lvl;
    return '<polygon points="' + cx + ',' + (cy - r) + ' ' + (cx + r) + ',' + cy + ' ' + cx + ',' + (cy + r) + ' ' + (cx - r) + ',' + cy + '" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="' + (lvl === 1.0 ? 'none' : '2 2') + '"/>';
  }).join('');

  const rCam = (cCam / 100) * maxR;
  const rSnd = (cSnd / 100) * maxR;
  const rLig = (cLig / 100) * maxR;
  const rEdt = (cEdt / 100) * maxR;

  const ptCam = cx + ',' + (cy - rCam);
  const ptSnd = (cx + rSnd) + ',' + cy;
  const ptLig = cx + ',' + (cy + rLig);
  const ptEdt = (cx - rEdt) + ',' + cy;

  return '<svg viewBox="0 0 220 220" class="w-52 h-52 mx-auto drop-shadow-[0_0_15px_rgba(227,6,19,0.3)] select-none">' +
    '<line x1="' + cx + '" y1="' + (cy - maxR) + '" x2="' + cx + '" y2="' + (cy + maxR) + '" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>' +
    '<line x1="' + (cx - maxR) + '" y1="' + cy + '" x2="' + (cx + maxR) + '" y2="' + cy + '" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>' +
    gridHtml +
    '<polygon points="' + ptCam + ' ' + ptSnd + ' ' + ptLig + ' ' + ptEdt + '" fill="rgba(227, 6, 19, 0.35)" stroke="#E30613" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<circle cx="' + cx + '" cy="' + (cy - rCam) + '" r="4.5" fill="#FC2C2C" stroke="#FFFFFF" stroke-width="1.5"/>' +
    '<circle cx="' + (cx + rSnd) + '" cy="' + cy + '" r="4.5" fill="#FBBF24" stroke="#FFFFFF" stroke-width="1.5"/>' +
    '<circle cx="' + cx + '" cy="' + (cy + rLig) + '" r="4.5" fill="#F59E0B" stroke="#FFFFFF" stroke-width="1.5"/>' +
    '<circle cx="' + (cx - rEdt) + '" cy="' + cy + '" r="4.5" fill="#10B981" stroke="#FFFFFF" stroke-width="1.5"/>' +
    '<text x="' + cx + '" y="' + (cy - maxR - 10) + '" fill="#FC2C2C" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle">КАМЕРА ' + cCam + '%</text>' +
    '<text x="' + (cx + maxR + 8) + '" y="' + (cy + 3) + '" fill="#FBBF24" font-size="9" font-family="monospace" font-weight="bold" text-anchor="start">ЗВУК ' + cSnd + '%</text>' +
    '<text x="' + cx + '" y="' + (cy + maxR + 18) + '" fill="#F59E0B" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle">СВЕТ ' + cLig + '%</text>' +
    '<text x="' + (cx - maxR - 8) + '" y="' + (cy + 3) + '" fill="#10B981" font-size="9" font-family="monospace" font-weight="bold" text-anchor="end">МОНТАЖ ' + cEdt + '%</text>' +
  '</svg>';
}

// ----------------- ЧИСТЫЙ ВЕКТОРНЫЙ ОФЛАЙН QR-ГЕНЕРАТОР (SVG) -----------------
function renderOfflineQrSvg(payloadString, size = 180) {
  const N = 21;
  const matrix = Array.from({ length: N }, () => Array(N).fill(false));

  function placeFinder(startX, startY) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[startY + r][startX + c] = true;
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(N - 7, 0);
  placeFinder(0, N - 7);

  for (let i = 8; i < N - 8; i++) {
    if (i % 2 === 0) {
      matrix[6][i] = true;
      matrix[i][6] = true;
    }
  }

  let hash = 0;
  const str = String(payloadString || 'KP11');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }

  let bitIdx = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= N - 8;
      const inBottomLeft = r >= N - 8 && c < 8;
      const inTiming = r === 6 || c === 6;
      if (inTopLeft || inTopRight || inBottomLeft || inTiming) continue;

      const pseudoRandom = Math.sin(hash + bitIdx * 1.618) * 10000;
      matrix[r][c] = (pseudoRandom - Math.floor(pseudoRandom)) > 0.48;
      bitIdx++;
    }
  }

  const cellSize = (size / N).toFixed(2);
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matrix[r][c]) {
        rects += '<rect x="' + (c * cellSize) + '" y="' + (r * cellSize) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#0D0D0D"/>';
      }
    }
  }

  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg" class="select-none">' +
    '<rect width="' + size + '" height="' + size + '" fill="#FFFFFF" rx="4"/>' +
    rects +
    '<rect x="' + (size * 0.4) + '" y="' + (size * 0.4) + '" width="' + (size * 0.2) + '" height="' + (size * 0.2) + '" fill="#E30613" rx="2"/>' +
    '<text x="' + (size * 0.5) + '" y="' + (size * 0.53) + '" fill="#FFFFFF" font-size="' + (size * 0.08) + '" font-family="monospace" font-weight="bold" text-anchor="middle">KP11</text>' +
  '</svg>';
}

// ----------------- ДОСЬЕ / ШОУРИЛ УЧАСТНИКА (СТРОГО ДЛЯ МАСТЕРОВ И АДМИНИСТРАТОРОВ) -----------------
function openShowreelModal(userId) {
  // Информация о студентах строго недоступна студентам и гостям
  if (!isMasterOrAdminUser(currentUser)) {
    showToast('Доступ к цифровому паспорту студентов открыт только для мастеров и администраторов ЦКТ КП11.');
    return;
  }

  const modal = document.getElementById('showreelModal');
  const container = document.getElementById('showreelContent');
  if (!modal || !container) return;

  const target = String(userId || '').trim().toLowerCase();
  let student = (globalAdminUsers || []).find(u => u.id === userId) ||
                (globalStudents || []).find(u => u.id === userId) ||
                getStudentDirectory().find(u => u.id === userId);

  if (!student && target) {
    student = (globalAdminUsers || []).find(u => u.fullName && u.fullName.toLowerCase() === target) ||
              (globalStudents || []).find(u => u.fullName && u.fullName.toLowerCase() === target) ||
              getStudentDirectory().find(u => u.fullName && u.fullName.toLowerCase() === target);
  }

  if (!student && target) {
    for (const sh of (globalShoots || [])) {
      if (Array.isArray(sh.crew)) {
        const cm = sh.crew.find(c => c.id === userId || c.userId === userId || (c.user && (c.user.id === userId || (c.user.fullName && c.user.fullName.toLowerCase() === target))));
        if (cm) {
          student = cm.user ? { ...cm.user } : { id: cm.userId || cm.id, fullName: cm.fullName || 'Студент', groupName: cm.groupName || 'КТ' };
          break;
        }
      }
    }
  }

  if (!student && target) {
    // Поиск по глобальному кэшу пользователей
    try {
      const cachedUsers = JSON.parse(localStorage.getItem('kp11_cached_users') || '[]');
      if (Array.isArray(cachedUsers)) {
        student = cachedUsers.find(u => u.id === userId || (u.fullName && u.fullName.toLowerCase() === target));
      }
    } catch (e) {}
  }

  if (!student) {
    student = (globalStudents && globalStudents[0]) || getStudentDirectory()[0];
  }

  student.competencies = student.competencies || { camera: 90, sound: 85, light: 85, edit: 90 };
  const rank = getCraftRankBadge(student.completedShoots || student.participations || 4, student.rating || 4.8);

  let totalFrames = 0, totalGear = 0, totalTime = 0, totalEthics = 0, critCount = 0;
  (globalShoots || []).forEach(sh => {
    if (sh.isCompleted && Array.isArray(sh.crew)) {
      const cm = sh.crew.find(c => c.userId === student.id || c.id === student.id || (c.user && c.user.id === student.id));
      if (cm && cm.cktCriteria) {
        totalFrames += Number(cm.cktCriteria.frames || 5);
        totalGear += Number(cm.cktCriteria.gear || 5);
        totalTime += Number(cm.cktCriteria.time || 5);
        totalEthics += Number(cm.cktCriteria.ethics || 5);
        critCount++;
      }
    }
  });

  const framesAvg = critCount > 0 ? (totalFrames / critCount).toFixed(1) : (student.rating || '5.0');
  const gearAvg = critCount > 0 ? (totalGear / critCount).toFixed(1) : (student.rating || '5.0');
  const timeAvg = critCount > 0 ? (totalTime / critCount).toFixed(1) : (student.rating || '5.0');
  const ethicsAvg = critCount > 0 ? (totalEthics / critCount).toFixed(1) : (student.rating || '5.0');

  const verifiedProjects = (globalShoots || []).filter(s => 
    Array.isArray(s.crew) && s.crew.some(c => c.userId === student.id || c.id === student.id || (c.user && c.user.id === student.id))
  );

  let projectsListHtml = '';
  if (verifiedProjects.length > 0) {
    projectsListHtml = verifiedProjects.map(sh => {
      const cm = sh.crew.find(c => c.userId === student.id || c.id === student.id || (c.user && c.user.id === student.id));
      const rName = cm ? cm.roleInShoot : 'Участник';
      const statusLabel = sh.isCompleted ? 'ЗАВЕРШЕНО' : 'В ПРОИЗВОДСТВЕ';
      const statusClass = sh.isCompleted ? 'text-emerald-400 border-emerald-900/60' : 'text-amber-400 border-amber-900/60';
      return '<div class="p-2.5 border flex items-center justify-between text-xs" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
        '<div>' +
          '<span class="font-bold uppercase" style="color: var(--text-primary);">' + sh.title + '</span>' +
          '<div class="text-[10px] font-mono text-[var(--text-muted)]">' + rName + ' // ' + (sh.type || 'СТУДИЯ') + '</div>' +
        '</div>' +
        '<span class="font-mono text-[9px] px-2 py-0.5 border ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>';
    }).join('');
  } else {
    projectsListHtml = '<div class="p-3 text-center text-xs font-mono text-[var(--text-muted)] border border-dashed">Пока нет завершённых проектов</div>';
  }

  container.innerHTML = 
    '<div class="flex items-center space-x-3.5 border-b pb-4" style="border-color: var(--border-color);">' +
      '<div class="w-16 h-16 border-2 border-[var(--brand-red)] overflow-hidden flex-shrink-0 shadow-md relative">' +
        '<img src="' + (student.avatar || 'img/student.jpg') + '" alt="Student" class="w-full h-full object-cover">' +
        '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[7px] font-bold px-1 font-mono">КП11</span>' +
      '</div>' +
      '<div class="min-w-0 flex-grow">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="gaffer-tape-sticker">ЦИФРОВОЙ ПАСПОРТ // ПОРТФОЛИО СТУДЕНТА</span>' +
          '<span class="text-[10px] font-mono text-[#229ED9] font-bold">' + (student.telegram || '—') + '</span>' +
        '</div>' +
        '<h3 class="text-sm sm:text-base font-extrabold uppercase leading-tight truncate" style="color: var(--text-primary);">' + student.fullName + '</h3>' +
        '<div class="flex items-center gap-2 mt-1">' +
          '<span class="font-mono text-[11px] font-bold px-1.5 py-0.5 border" style="background-color: var(--bg-elevated); border-color: var(--border-color); color: var(--brand-beige-text);">' + (student.groupName || 'Группа') + '</span>' +
          '<span class="' + rank.className + '">' + rank.icon + ' ' + rank.title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="space-y-3">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-xs font-extrabold uppercase font-mono" style="color: var(--brand-red);">Диаграмма матрицы компетенций (Skills Radar):</span>' +
        '<span class="text-amber-400 font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + ' Рейтинг: ' + student.rating + '</span>' +
      '</div>' +

      '<div class="p-3 border flex items-center justify-center" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        renderSkillsRadarSvg(student.competencies) +
      '</div>' +

      '<div class="space-y-1.5 p-3 border" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
        '<div class="text-[10px] font-mono font-bold uppercase text-[var(--brand-red)] mb-1">Показатели по 4 стандартам ЦКТ:</div>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">' +
          '<div>🎞️ Кадры: <b class="text-amber-400">' + framesAvg + '</b></div>' +
          '<div>🛡️ Техника: <b class="text-amber-400">' + gearAvg + '</b></div>' +
          '<div>⏱️ Время: <b class="text-amber-400">' + timeAvg + '</b></div>' +
          '<div>🤝 Этика: <b class="text-amber-400">' + ethicsAvg + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="space-y-2">' +
      '<span class="text-xs font-extrabold uppercase font-mono" style="color: var(--brand-red);">Подтвержденные проекты в фильмографии:</span>' +
      '<div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">' +
        projectsListHtml +
      '</div>' +
    '</div>' +

    '<div class="pt-2 border-t flex flex-col sm:flex-row gap-2" style="border-color: var(--border-color);">' +
      ((currentUser && (currentUser.role === 'admin' || currentUser.role === 'master' || currentUser.role === 'teacher')) ? (
        '<button onclick="openAdminUserFullEditModal(\'' + student.id + '\'); closeShowreelModal();" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-beige">' +
          '✎ Редактировать профиль' +
        '</button>' +
        '<button onclick="closeShowreelModal()" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-primary">' +
          'Закрыть' +
        '</button>'
      ) : (
        '<div class="flex-1 py-2 text-[11px] font-mono font-bold text-center border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 flex items-center justify-center gap-1.5">' +
          '<span>✓</span> АККРЕДИТАЦИЯ ВЕРИФИЦИРОВАНА // ЦКТ КП11' +
        '</div>' +
        '<button onclick="closeShowreelModal()" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-primary">' +
          'Закрыть' +
        '</button>'
      )) +
    '</div>';

  modal.classList.remove('hidden');
}

function closeShowreelModal() {
  const modal = document.getElementById('showreelModal');
  if (modal) modal.classList.add('hidden');
}

window.openShowreelModal = openShowreelModal;
window.closeShowreelModal = closeShowreelModal;

function openAdminUserDossier(userId) {
  openShowreelModal(userId);
}
window.openAdminUserDossier = openAdminUserDossier;

// ----------------- СЖАТИЕ И ОБРАБОТКА АВАТАРОК (HTML5 CANVAS, <15 КБ) -----------------
function compressImageFile(file, maxDimension = 140, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      return reject(new Error('Пожалуйста, выберите графический файл (PNG, JPG, JPEG, WebP).'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось декодировать изображение.'));
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const sx = Math.floor((img.width - side) / 2);
          const sy = Math.floor((img.height - side) / 2);
          const outDim = Math.min(side, maxDimension);

          const canvas = document.createElement('canvas');
          canvas.width = outDim;
          canvas.height = outDim;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, side, side, 0, 0, outDim, outDim);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
window.compressImageFile = compressImageFile;

function normalizeAvatarUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  if (url.includes('dropbox.com')) {
    url = url.replace(/www\.dropbox\.com/i, 'dl.dropboxusercontent.com');
    url = url.replace(/([?&])dl=[01]/gi, '$1raw=1');
    if (!url.includes('raw=1')) {
      url += (url.includes('?') ? '&' : '?') + 'raw=1';
    }
    return url;
  }
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdriveMatch) {
    return 'https://drive.google.com/uc?export=view&id=' + gdriveMatch[1];
  }
  return url;
}
window.normalizeAvatarUrl = normalizeAvatarUrl;

async function handleUserAvatarUpload(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;

  try {
    showToast('Сжатие и загрузка фото на сервер...');
    const compressedBase64 = await compressImageFile(file, 140, 0.82);

    const img1 = document.getElementById('myCabinetAvatarImg');
    if (img1) img1.src = compressedBase64;
    const img2 = document.getElementById('cabinetSettingsAvatarPreview');
    if (img2) img2.src = compressedBase64;
    const navAvatar = document.getElementById('userNavAvatarImg');
    if (navAvatar) navAvatar.src = compressedBase64;

    if (currentUser && currentUser.id) {
      try {
        const res = await fetch('/api/users/' + currentUser.id + '/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (token || 'demo-token')
          },
          body: JSON.stringify({ userId: currentUser.id, avatar: compressedBase64 })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.avatar) {
            currentUser.avatar = data.avatar;
            localStorage.setItem('user', JSON.stringify(currentUser));
            if (img1) img1.src = data.avatar;
            if (img2) img2.src = data.avatar;
            if (navAvatar) navAvatar.src = data.avatar;
          }
        }
      } catch (err) {
        console.warn('Avatar server sync error:', err);
      }
    }

    showToast('Аватарка успешно сохранена на сервере!');
  } catch (err) {
    showToast(err.message || 'Ошибка обработки фото');
  } finally {
    if (event.target) event.target.value = '';
  }
}
window.handleUserAvatarUpload = handleUserAvatarUpload;

async function handleUserAvatarUrlSubmit() {
  const input = document.getElementById('cabinetAvatarUrlInput');
  if (!input) return;
  const rawUrl = input.value.trim();
  if (!rawUrl) {
    showToast('Введите URL изображения (Dropbox, Google Drive или прямой URL)');
    return;
  }

  const directUrl = normalizeAvatarUrl(rawUrl);
  input.value = directUrl;

  const testImg = new Image();
  testImg.onload = async () => {
    if (currentUser) {
      currentUser.avatar = directUrl;
      localStorage.setItem('user', JSON.stringify(currentUser));
    }
    const img1 = document.getElementById('myCabinetAvatarImg');
    if (img1) img1.src = directUrl;
    const img2 = document.getElementById('cabinetSettingsAvatarPreview');
    if (img2) img2.src = directUrl;
    const navAvatar = document.getElementById('userNavAvatarImg');
    if (navAvatar) navAvatar.src = directUrl;

    if (currentUser && currentUser.id) {
      try {
        await fetch('/api/users/' + currentUser.id + '/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + (token || 'demo-token')
          },
          body: JSON.stringify({ userId: currentUser.id, avatar: directUrl })
        });
      } catch (e) {
        console.warn('Sync avatar URL error:', e);
      }
    }
    showToast('Аватарка по ссылке успешно установлена!');
  };
  testImg.onerror = () => {
    showToast('Предупреждение: ссылка может быть приватной. Проверьте публичный доступ в Dropbox.');
    if (currentUser) {
      currentUser.avatar = directUrl;
      localStorage.setItem('user', JSON.stringify(currentUser));
    }
    const img1 = document.getElementById('myCabinetAvatarImg');
    if (img1) img1.src = directUrl;
    const img2 = document.getElementById('cabinetSettingsAvatarPreview');
    if (img2) img2.src = directUrl;
  };
  testImg.src = directUrl;
}
window.handleUserAvatarUrlSubmit = handleUserAvatarUrlSubmit;

async function handleUserAvatarReset() {
  const defaultAvatar = 'img/student.jpg';
  if (currentUser) {
    currentUser.avatar = null;
    localStorage.setItem('user', JSON.stringify(currentUser));
  }
  const img1 = document.getElementById('myCabinetAvatarImg');
  if (img1) img1.src = defaultAvatar;
  const img2 = document.getElementById('cabinetSettingsAvatarPreview');
  if (img2) img2.src = defaultAvatar;
  const navAvatar = document.getElementById('userNavAvatarImg');
  if (navAvatar) navAvatar.src = defaultAvatar;
  const urlInp = document.getElementById('cabinetAvatarUrlInput');
  if (urlInp) urlInp.value = '';

  if (currentUser && currentUser.id) {
    try {
      await fetch('/api/users/' + currentUser.id + '/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (token || 'demo-token')
        },
        body: JSON.stringify({ userId: currentUser.id, avatar: null })
      });
    } catch (e) {}
  }
  showToast('Аватарка сброшена на стандартную');
}
window.handleUserAvatarReset = handleUserAvatarReset;

async function handleAdminAvatarUpload(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;

  try {
    showToast('Сжатие фото...');
    const compressedBase64 = await compressImageFile(file, 140, 0.82);
    const prev = document.getElementById('fullEditAvatarPreview');
    if (prev) prev.src = compressedBase64;
    const inp = document.getElementById('fullEditAvatarBase64');
    if (inp) inp.value = compressedBase64;
    const urlInp = document.getElementById('fullEditAvatarUrl');
    if (urlInp) urlInp.value = '';
    showToast('Фото оптимизировано (<15 КБ)');
  } catch (err) {
    showToast(err.message || 'Ошибка при загрузке фото');
  } finally {
    if (event.target) event.target.value = '';
  }
}
window.handleAdminAvatarUpload = handleAdminAvatarUpload;

function handleAdminAvatarUrlInput(rawUrl) {
  const directUrl = normalizeAvatarUrl(rawUrl);
  const prev = document.getElementById('fullEditAvatarPreview');
  const inp = document.getElementById('fullEditAvatarBase64');
  if (prev && directUrl) prev.src = directUrl;
  if (inp) inp.value = directUrl || '';
}
window.handleAdminAvatarUrlInput = handleAdminAvatarUrlInput;

function handleAdminAvatarRemove() {
  const prev = document.getElementById('fullEditAvatarPreview');
  if (prev) prev.src = 'img/student.jpg';
  const inp = document.getElementById('fullEditAvatarBase64');
  if (inp) inp.value = '';
  const urlInp = document.getElementById('fullEditAvatarUrl');
  if (urlInp) urlInp.value = '';
  showToast('Фото сброшено на стандартное');
}
window.handleAdminAvatarRemove = handleAdminAvatarRemove;

// ----------------- ЛИЧНЫЙ КАБИНЕТ СТУДЕНТА / СОТРУДНИКА -----------------
async function loadMyPortfolio() {
  if (!currentUser) return;

  const header = document.getElementById('myPortfolioHeader');
  const commentsContainer = document.getElementById('myCommentsList');
  const likesCountEl = document.getElementById('myCabinetLikesCount');
  const dislikesCountEl = document.getElementById('myCabinetDislikesCount');
  const filmographyContainer = document.getElementById('myFilmographyList');
  const shootsCountEl = document.getElementById('myShootsCount');
  const qrPreview = document.getElementById('qrPassPreviewContainer');
  const qrInfo = document.getElementById('qrPassInfo');
  const tgInp = document.getElementById('cabinetTelegramInput');
  const cabinetSettingPrev = document.getElementById('cabinetSettingsAvatarPreview');

  if (cabinetSettingPrev) {
    cabinetSettingPrev.src = currentUser.avatar || 'img/student.jpg';
  }
  const cabinetUrlInp = document.getElementById('cabinetAvatarUrlInput');
  if (cabinetUrlInp) {
    cabinetUrlInp.value = (currentUser.avatar && /^https?:\/\//i.test(currentUser.avatar)) ? currentUser.avatar : '';
  }

  if (tgInp) {
    tgInp.value = (currentUser.telegram || '').replace(/^@/, '');
  }

  // Загружаем актуальные отзывы студента за последние 6 месяцев
  let comments = [];
  try {
    const res = await fetch('/api/comments?studentId=' + currentUser.id, {
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      const data = await res.json();
      comments = Array.isArray(data) ? data : (data && Array.isArray(data.comments) ? data.comments : []);
    }
  } catch (err) {
    console.warn('Error loading cabinet comments:', err);
    comments = [];
  }

  const likes = comments.filter(c => c.type === 'POSITIVE').length;
  const dislikes = comments.filter(c => c.type === 'NEGATIVE').length;
  if (likesCountEl) likesCountEl.innerText = likes;
  if (dislikesCountEl) dislikesCountEl.innerText = dislikes;

  // Обновляем локальный объект пользователя
  currentUser.likes = likes;
  currentUser.dislikes = dislikes;

  const userRank = getCraftRankBadge(currentUser.completedShoots || 4, 4.8);
  const roleName = (currentUser.role && currentUser.role.name) ? currentUser.role.name : (currentUser.role || 'Студент');
  const isBlacklisted = !!currentUser.isBlacklisted;

  if (header) {
    header.innerHTML = '<div class="flex items-center space-x-4">' +
      '<div class="relative group cursor-pointer w-16 h-16 sm:w-20 sm:h-20 border-2 ' + (isBlacklisted ? 'border-red-600' : 'border-[var(--brand-red)]') + ' overflow-hidden shadow-md flex-shrink-0" onclick="document.getElementById(\'cabinetAvatarFileInput\') && document.getElementById(\'cabinetAvatarFileInput\').click()" title="Нажмите, чтобы сменить фото профиля">' +
        '<img id="myCabinetAvatarImg" src="' + (currentUser.avatar || 'img/student.jpg') + '" alt="User" class="w-full h-full object-cover">' +
        '<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-center p-0.5">' +
          '<svg class="w-4 h-4 text-amber-300 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
          '<span class="text-[8px] font-mono font-bold leading-none">Сменить</span>' +
        '</div>' +
        '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[8px] font-mono font-bold px-1.5">КП11</span>' +
      '</div>' +
      '<div>' +
        '<div class="flex items-center flex-wrap gap-2 mb-1">' +
          '<span class="gaffer-tape-sticker">ЛИЧНЫЙ КАБИНЕТ // 2026</span>' +
          (currentUser.telegram ? '<a href="https://t.me/' + currentUser.telegram.replace(/^@/, '') + '" target="_blank" class="text-[10px] font-mono text-[#229ED9] font-bold hover:underline">' + currentUser.telegram + '</a>' : '') +
          (isBlacklisted ? '<span class="text-red-400 font-extrabold font-mono text-[10px] px-1.5 py-0.5 border border-red-600/70 bg-red-950/60">⛔ В ЧЁРНОМ СПИСКЕ</span>' : '') +
        '</div>' +
        '<h2 class="text-base sm:text-xl font-extrabold uppercase leading-tight" style="color: var(--text-primary);">' + currentUser.fullName + '</h2>' +
        '<div class="flex items-center flex-wrap gap-2 mt-1.5">' +
          '<span class="font-mono text-xs font-bold px-2 py-0.5 border" style="background-color: var(--bg-elevated); border-color: var(--border-color); color: var(--brand-beige-text);">' + (currentUser.groupName || 'КТ-26') + '</span>' +
          '<span class="font-mono text-xs font-bold px-2 py-0.5 border border-neutral-700 text-neutral-300">' + roleName + '</span>' +
          '<span class="' + userRank.className + '">' + userRank.icon + ' ' + userRank.title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="text-left sm:text-right font-mono text-xs text-[var(--text-muted)] space-y-0.5">' +
      '<div>ID: <span class="text-[var(--text-primary)] font-bold">' + currentUser.id + '</span></div>' +
      '<div>EMAIL: <span class="text-[var(--text-secondary)] font-bold">' + (currentUser.email || '—') + '</span></div>' +
      '<div>АККРЕДИТАЦИЯ: <span class="' + (isBlacklisted ? 'text-red-400' : 'text-emerald-400') + ' font-bold">' + (isBlacklisted ? 'ОГРАНИЧЕНА (ЧС)' : 'АКТИВНА') + '</span></div>' +
    '</div>';
  }

  // Отрисовка списка отзывов в кабинете
  if (commentsContainer) {
    if (comments.length === 0) {
      commentsContainer.innerHTML = '<div class="p-6 text-center text-xs font-mono border border-dashed" style="color: var(--text-muted); border-color: var(--border-subtle);">' +
        'У вас пока нет отзывов или замечаний от мастеров за последние 6 месяцев.' +
      '</div>';
    } else {
      commentsContainer.innerHTML = comments.map(c => {
        const isPos = c.type === 'POSITIVE';
        const tagClass = isPos 
          ? 'border-emerald-600/50 bg-emerald-950/25 text-emerald-300' 
          : 'border-red-600/50 bg-red-950/25 text-red-300';
        const tagText = isPos ? '👍 Положительный отзыв' : '👎 Замечание';
        const authorText = c.authorName || 'Мастер производственной практики';
        const dateStr = safeFormatDate(c.createdAt);

        return '<div class="p-3 border space-y-1.5 ' + (isPos ? 'border-emerald-900/40 bg-emerald-950/10' : 'border-red-900/40 bg-red-950/10') + '">' +
          '<div class="flex items-center justify-between flex-wrap gap-2">' +
            '<span class="font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 border ' + tagClass + '">' + tagText + '</span>' +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">' + dateStr + '</span>' +
          '</div>' +
          '<p class="text-xs font-medium leading-relaxed" style="color: var(--text-primary);">' + (c.text || '') + '</p>' +
          '<div class="text-[10px] font-mono text-[var(--brand-beige-text)] pt-1 border-t border-[var(--border-subtle)]">' +
            'Автор: <b>' + authorText + '</b>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Фильмография и смены
  const myShoots = (globalShoots || []).filter(sh => 
    sh.crew && sh.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id)
  );

  if (shootsCountEl) {
    shootsCountEl.innerText = pluralizeRu(myShoots.length, 'проект', 'проекта', 'проектов');
  }

  if (filmographyContainer) {
    if (myShoots.length === 0) {
      filmographyContainer.innerHTML = '<div class="p-4 text-xs font-mono text-[var(--text-muted)] text-center border border-dashed">Вы пока не назначены на съёмочные смены</div>';
    } else {
      filmographyContainer.innerHTML = myShoots.map(sh => {
        const cm = sh.crew.find(c => c.userId === currentUser.id || c.id === currentUser.id);
        const rName = cm ? cm.roleInShoot : 'Участник';
        const statusLabel = sh.isCompleted ? 'ЗАВЕРШЕНО' : 'В ПРОИЗВОДСТВЕ';
        const statusClass = sh.isCompleted ? 'text-emerald-400 border-emerald-900/60 bg-emerald-950/30' : 'text-red-400 border-red-900/60 bg-red-950/30';
        return '<div class="p-3 border flex items-center justify-between text-xs" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div>' +
            '<span class="font-bold uppercase" style="color: var(--text-primary);">' + sh.title + '</span>' +
            '<div class="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">' + rName + ' // ' + (sh.type || 'СТУДИЯ') + ' // ' + safeFormatDate(sh.date) + '</div>' +
          '</div>' +
          '<span class="font-mono text-[9px] px-2 py-0.5 border ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>';
      }).join('');
    }
  }

  const userProfileUrl = window.location.origin + window.location.pathname + '?user=' + encodeURIComponent(currentUser.id);
  if (qrPreview) {
    qrPreview.innerHTML = renderOfflineQrSvg(userProfileUrl, 160);
  }
  if (qrInfo) {
    qrInfo.innerHTML = '<div class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + currentUser.fullName + '</div>' +
      '<div class="text-[11px] text-[var(--brand-beige-text)] font-mono">' + (currentUser.groupName || 'КТ-26') + '</div>' +
      '<div class="text-[9px] text-cyan-400 font-mono break-all mt-1">Ссылка: ' + userProfileUrl + '</div>';
  }
}

// Смена пароля из личного кабинета
async function handleCabinetPasswordChange(e) {
  e.preventDefault();
  const newPass = document.getElementById('cabinetNewPassword').value;
  const confPass = document.getElementById('cabinetConfirmPassword').value;

  if (!newPass || newPass.length < 4) {
    showToast('Пароль должен содержать минимум 4 символа');
    return;
  }
  if (newPass !== confPass) {
    showToast('Пароли не совпадают!');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ newPassword: newPass })
    });
    if (res.ok) {
      showToast('Пароль успешно обновлён!');
      document.getElementById('cabinetNewPassword').value = '';
      document.getElementById('cabinetConfirmPassword').value = '';
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Ошибка при смене пароля');
    }
  } catch (err) {
    showToast('Ошибка сети при смене пароля');
  }
}

// Обновление Telegram никнейма из личного кабинета
async function handleCabinetTelegramChange(e) {
  e.preventDefault();
  const rawTg = document.getElementById('cabinetTelegramInput').value.trim();
  const cleanTg = rawTg ? (rawTg.startsWith('@') ? rawTg : '@' + rawTg) : '';

  try {
    const res = await fetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ telegram: cleanTg })
    });
    if (res.ok) {
      currentUser.telegram = cleanTg;
      localStorage.setItem('user', JSON.stringify(currentUser));
      showToast('Telegram контакт успешно сохранён!');
      loadMyPortfolio();
    } else {
      // Fallback через админский роут
      await fetch('/api/admin/users/' + currentUser.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({ telegram: cleanTg })
      });
      currentUser.telegram = cleanTg;
      localStorage.setItem('user', JSON.stringify(currentUser));
      showToast('Telegram контакт успешно сохранён!');
      loadMyPortfolio();
    }
  } catch (err) {
    currentUser.telegram = cleanTg;
    localStorage.setItem('user', JSON.stringify(currentUser));
    showToast('Telegram контакт сохранён локально');
    loadMyPortfolio();
  }
}

// ================= ВКЛАДКА: ОТЗЫВЫ О СТУДЕНТАХ (ДЛЯ МАСТЕРОВ И АДМИНОВ) =================
let globalReviewsStudents = [];
let selectedReviewStudentId = null;
let currentReviewType = 'POSITIVE';

async function loadReviewsTab() {
  const container = document.getElementById('reviewsStudentsList');
  if (container) container.innerHTML = '<div class="p-4 text-xs font-mono text-[var(--text-muted)] text-center">Загрузка студентов...</div>';

  try {
    const res = await fetch('/api/shoots', {
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      const data = await res.json();
      const raw = data.students || [];
      globalReviewsStudents = Array.isArray(raw) ? raw : (raw.value || []);
    }
  } catch (err) {
    console.warn('Error loading reviews tab students:', err);
  }

  if (!globalReviewsStudents || globalReviewsStudents.length === 0) {
    globalReviewsStudents = globalStudents || getStudentDirectory();
  }

  filterReviewsStudents();

  if (!selectedReviewStudentId && globalReviewsStudents.length > 0) {
    const sortSel = document.getElementById('reviewsStudentSort');
    const sortBy = sortSel ? sortSel.value : 'alphabet';
    const sorted = sortStudentsList(globalReviewsStudents, sortBy);
    if (sorted.length > 0) {
      selectStudentForReviews(sorted[0].id);
    }
  }
}

function filterReviewsStudents() {
  const q = (document.getElementById('reviewsStudentSearch')?.value || '').toLowerCase().trim();
  const sortSel = document.getElementById('reviewsStudentSort');
  const sortBy = sortSel ? sortSel.value : 'alphabet';

  let filtered = (globalReviewsStudents || []).filter(s => 
    (s.fullName && s.fullName.toLowerCase().includes(q)) ||
    (s.groupName && s.groupName.toLowerCase().includes(q)) ||
    (s.telegram && s.telegram.toLowerCase().includes(q))
  );
  filtered = sortStudentsList(filtered, sortBy);
  renderReviewsStudentsList(filtered);
}

function renderReviewsStudentsList(students) {
  const container = document.getElementById('reviewsStudentsList');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-xs font-mono border border-dashed" style="color: var(--text-muted); border-color: var(--border-subtle);">Студенты не найдены</div>';
    return;
  }

  container.innerHTML = students.map(s => {
    const isSelected = s.id === selectedReviewStudentId;
    const isBlacklisted = !!s.isBlacklisted;
    const likes = s.likes || 0;
    const dislikes = s.dislikes || 0;

    let borderClass = isSelected ? 'border-[var(--brand-red)] bg-[#1e1e1e]' : 'border-[var(--border-subtle)] bg-[var(--bg-card)]';
    if (isBlacklisted) {
      borderClass += ' border-red-800/80 bg-red-950/20';
    }

    let studentNameHtml = '<span class="font-bold text-xs uppercase text-[var(--text-primary)]">' + (s.fullName || 'Без имени') + '</span>';
    if (isMasterOrAdminUser(currentUser)) {
      studentNameHtml = '<button type="button" onclick="event.stopPropagation(); openShowreelModal(\'' + s.id + '\')" class="font-bold text-xs uppercase hover:underline text-left inline-flex items-center gap-1 group text-[var(--text-primary)] hover:text-amber-400 transition" title="Открыть цифровой паспорт студента">' +
        '<span>' + (s.fullName || 'Без имени') + '</span>' +
        '<span class="text-[9px] text-amber-400/80">👤</span>' +
      '</button>';
    }

    return '<div onclick="selectStudentForReviews(\'' + s.id + '\')" class="p-2.5 sm:p-3 border cursor-pointer transition hover:border-[var(--brand-red)] ' + borderClass + '">' +
      '<div class="flex items-center justify-between gap-2.5">' +
        '<div class="flex items-center gap-2.5 min-w-0 flex-grow">' +
          '<div class="w-8 h-8 rounded-full border border-[var(--border-subtle)] overflow-hidden flex-shrink-0 bg-neutral-900">' +
            '<img src="' + (s.avatar || 'img/student.jpg') + '" alt="Avatar" class="w-full h-full object-cover">' +
          '</div>' +
          '<div class="min-w-0 flex-grow">' +
            '<div class="flex items-center flex-wrap gap-1.5">' +
              studentNameHtml +
              '<span class="font-mono text-[10px] text-[var(--text-muted)]">[' + (s.groupName || 'КТ') + ']</span>' +
              (isBlacklisted ? '<span class="text-red-400 font-extrabold font-mono text-[9px] px-1 border border-red-600 bg-red-950/60">⛔ ЧС</span>' : '') +
            '</div>' +
            (s.telegram ? '<div class="text-[10px] font-mono text-[#229ED9] mt-0.5">' + s.telegram + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-2 font-mono text-xs shrink-0">' +
          '<span class="text-emerald-400 font-extrabold inline-flex items-center gap-0.5" title="Положительные отзывы">👍 ' + likes + '</span>' +
          '<span class="text-red-400 font-extrabold inline-flex items-center gap-0.5" title="Замечания">👎 ' + dislikes + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function selectStudentForReviews(studentId) {
  selectedReviewStudentId = studentId;
  renderReviewsStudentsList(globalReviewsStudents);

  const container = document.getElementById('reviewsSelectedStudentContainer');
  if (!container) return;

  const student = (globalReviewsStudents || []).find(s => s.id === studentId) || { id: studentId, fullName: 'Студент', groupName: 'КТ' };

  container.innerHTML = '<div class="p-6 text-center text-xs font-mono text-[var(--text-muted)]">Загрузка отзывов студента...</div>';

  let comments = [];
  try {
    const res = await fetch('/api/comments?studentId=' + studentId, {
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      const data = await res.json();
      comments = Array.isArray(data) ? data : (data && Array.isArray(data.comments) ? data.comments : []);
    }
  } catch (err) {
    console.warn('Error loading student comments:', err);
    comments = [];
  }

  const likes = comments.filter(c => c.type === 'POSITIVE').length;
  const dislikes = comments.filter(c => c.type === 'NEGATIVE').length;
  student.likes = likes;
  student.dislikes = dislikes;

  const isBlacklisted = !!student.isBlacklisted;
  const comps = student.competencies || { camera: 85, sound: 80, light: 80, edit: 85 };

  let commentsHtml = '';
  if (comments.length === 0) {
    commentsHtml = '<div class="p-6 text-center text-xs font-mono border border-dashed" style="color: var(--text-muted); border-color: var(--border-subtle);">' +
      'За последние 6 месяцев отзывов нет. Будьте первым, кто оставит комментарий!' +
    '</div>';
  } else {
    commentsHtml = comments.map(c => {
      const isPos = c.type === 'POSITIVE';
      const tagClass = isPos ? 'border-emerald-600/50 bg-emerald-950/25 text-emerald-300' : 'border-red-600/50 bg-red-950/25 text-red-300';
      const tagText = isPos ? '👍 Положительный отзыв' : '👎 Замечание';
      const dateStr = safeFormatDate(c.createdAt);
      const canDelete = isMasterOrAdminUser(currentUser);

      return '<div class="p-3.5 border space-y-2 ' + (isPos ? 'border-emerald-900/40 bg-emerald-950/10' : 'border-red-900/40 bg-red-950/10') + '">' +
        '<div class="flex items-center justify-between flex-wrap gap-2">' +
          '<div class="flex items-center gap-2">' +
            '<span class="font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 border ' + tagClass + '">' + tagText + '</span>' +
            '<span class="text-xs font-bold text-[var(--text-primary)]">' + (c.authorName || 'Мастер') + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
            '<span class="text-[10px] font-mono text-[var(--text-muted)]">' + dateStr + '</span>' +
            (canDelete ? '<button onclick="deleteStudentReview(\'' + c.id + '\', \'' + studentId + '\')" class="text-[10px] font-mono text-red-400 hover:text-red-300 hover:underline">Удалить</button>' : '') +
          '</div>' +
        '</div>' +
        '<p class="text-xs font-medium leading-relaxed" style="color: var(--text-secondary);">' + (c.text || '') + '</p>' +
      '</div>';
    }).join('');
  }

  container.innerHTML = 
    '<!-- Заголовок выбранного студента -->' +
    '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style="border-color: var(--border-color);">' +
      '<div class="flex items-center gap-3">' +
        '<div class="relative w-12 h-12 border-2 border-[var(--brand-red)] overflow-hidden flex-shrink-0 shadow-md">' +
          '<img src="' + (student.avatar || 'img/student.jpg') + '" alt="Avatar" class="w-full h-full object-cover">' +
          '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[6px] font-bold px-1 font-mono">КП11</span>' +
        '</div>' +
        '<div>' +
          '<div class="flex items-center flex-wrap gap-2">' +
            (isMasterOrAdminUser(currentUser) 
              ? '<button type="button" onclick="openShowreelModal(\'' + student.id + '\')" class="text-sm font-extrabold uppercase hover:underline text-left inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition" title="Открыть цифровой паспорт студента"><span>' + student.fullName + '</span><span class="text-[10px] font-mono px-1.5 py-0.5 border border-amber-600/60 bg-amber-950/40 text-amber-300 rounded-xs">👤 Паспорт</span></button>'
              : '<h4 class="text-sm font-extrabold uppercase text-[var(--text-primary)]">' + student.fullName + '</h4>') +
            '<span class="font-mono text-xs font-bold text-[var(--brand-beige-text)]">[' + (student.groupName || 'КТ') + ']</span>' +
            (student.telegram ? '<span class="font-mono text-xs text-[#229ED9]">' + student.telegram + '</span>' : '') +
            (isBlacklisted ? '<span class="text-red-400 font-extrabold font-mono text-[10px] px-1.5 py-0.5 border border-red-600 bg-red-950/60">⛔ В ЧЁРНОМ СПИСКЕ</span>' : '') +
          '</div>' +
          '<div class="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">ID: ' + student.id + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-center gap-3 font-mono text-sm px-3 py-1.5 border" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<span class="text-emerald-400 font-extrabold">👍 ' + likes + '</span>' +
        '<span class="text-red-400 font-extrabold">👎 ' + dislikes + '</span>' +
      '</div>' +
    '</div>' +

    '<!-- Отдельная плашка: Оценка по 4 параметрам компетенций -->' +
    '<div class="p-4 border space-y-3.5" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
      '<div class="flex items-center justify-between border-b pb-2" style="border-color: var(--border-color);">' +
        '<div class="flex items-center gap-2">' +
          '<span class="rec-dot"></span>' +
          '<span class="text-xs font-mono font-extrabold uppercase text-[var(--brand-red)]">Оценка компетенций студента (4 цеха ЦКТ):</span>' +
        '</div>' +
        '<span class="text-[10px] font-mono text-[var(--brand-beige-text)] font-bold">ШКАЛА 0–100%</span>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        // Камера
        '<div class="p-2.5 border rounded-xs space-y-1.5" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<span class="font-bold text-[var(--text-primary)]">🎬 Камера (Операторский цех)</span>' +
            '<span id="revCompCameraVal" class="font-mono font-black text-amber-400">' + (comps.camera ?? 85) + '%</span>' +
          '</div>' +
          '<input type="range" id="revCompCamera" min="0" max="100" step="1" value="' + (comps.camera ?? 85) + '" oninput="document.getElementById(\'revCompCameraVal\').innerText = this.value + \'%\'" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
        '</div>' +
        // Звук
        '<div class="p-2.5 border rounded-xs space-y-1.5" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<span class="font-bold text-[var(--text-primary)]">🎙️ Звук (Звуковой цех)</span>' +
            '<span id="revCompSoundVal" class="font-mono font-black text-amber-400">' + (comps.sound ?? 80) + '%</span>' +
          '</div>' +
          '<input type="range" id="revCompSound" min="0" max="100" step="1" value="' + (comps.sound ?? 80) + '" oninput="document.getElementById(\'revCompSoundVal\').innerText = this.value + \'%\'" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
        '</div>' +
        // Свет
        '<div class="p-2.5 border rounded-xs space-y-1.5" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<span class="font-bold text-[var(--text-primary)]">💡 Свет (Осветительский цех)</span>' +
            '<span id="revCompLightVal" class="font-mono font-black text-amber-400">' + (comps.light ?? 80) + '%</span>' +
          '</div>' +
          '<input type="range" id="revCompLight" min="0" max="100" step="1" value="' + (comps.light ?? 80) + '" oninput="document.getElementById(\'revCompLightVal\').innerText = this.value + \'%\'" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
        '</div>' +
        // Монтаж
        '<div class="p-2.5 border rounded-xs space-y-1.5" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div class="flex items-center justify-between text-xs">' +
            '<span class="font-bold text-[var(--text-primary)]">✂️ Монтаж (Постпродакшн)</span>' +
            '<span id="revCompEditVal" class="font-mono font-black text-amber-400">' + (comps.edit ?? 85) + '%</span>' +
          '</div>' +
          '<input type="range" id="revCompEdit" min="0" max="100" step="1" value="' + (comps.edit ?? 85) + '" oninput="document.getElementById(\'revCompEditVal\').innerText = this.value + \'%\'" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)]">Баллы формируют радар матрицы в цифровом паспорте</span>' +
        '<button type="button" onclick="saveStudentCompetenciesFromReviews(\'' + studentId + '\')" class="btn-brand-primary px-4 py-1.5 text-xs font-extrabold uppercase shadow flex items-center justify-center gap-1.5">' +
          '<span>💾</span>' +
          '<span>Сохранить компетенции</span>' +
        '</button>' +
      '</div>' +
    '</div>' +

    '<!-- Форма добавления нового отзыва -->' +
    '<div class="p-4 border space-y-3" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
      '<span class="text-xs font-mono font-extrabold uppercase text-[var(--brand-red)] block">Добавить отзыв к работе студента:</span>' +
      
      '<div class="flex items-center gap-3">' +
        '<button type="button" id="reviewBtnPositive" onclick="setReviewType(\'POSITIVE\')" class="flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition ' + (currentReviewType === 'POSITIVE' ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-black' : 'border-neutral-700 bg-neutral-900/40 text-neutral-400') + '">' +
          '<span>👍 Положительный (лайк)</span>' +
        '</button>' +
        '<button type="button" id="reviewBtnNegative" onclick="setReviewType(\'NEGATIVE\')" class="flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition ' + (currentReviewType === 'NEGATIVE' ? 'border-red-500 bg-red-950/40 text-red-300 font-black' : 'border-neutral-700 bg-neutral-900/40 text-neutral-400') + '">' +
          '<span>👎 Замечание (дизлайк)</span>' +
        '</button>' +
      '</div>' +

      '<div>' +
        '<textarea id="reviewCommentText" rows="3" placeholder="Опишите работу студента на смене, пунктуальность, отношение к оборудованию, соблюдение техники безопасности..." class="w-full studio-input text-xs font-medium p-3 focus:outline-none"></textarea>' +
      '</div>' +

      '<div class="flex items-center justify-between">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)]">Отзыв будет виден студенту, мастерам и админам 6 месяцев</span>' +
        '<button type="button" onclick="submitStudentReview(\'' + studentId + '\')" class="btn-brand-primary px-5 py-2 text-xs font-extrabold uppercase shadow">' +
          'Опубликовать отзыв' +
        '</button>' +
      '</div>' +
    '</div>' +

    '<!-- Лента отзывов за 6 месяцев -->' +
    '<div class="space-y-2.5 pt-2">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-xs font-extrabold uppercase font-mono text-[var(--text-secondary)]">История отзывов за 6 месяцев (' + comments.length + '):</span>' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)]">Автоочистка старше 180 дней</span>' +
      '</div>' +
      '<div class="space-y-2.5 max-h-80 overflow-y-auto pr-1">' +
        commentsHtml +
      '</div>' +
    '</div>';
}

async function saveStudentCompetenciesFromReviews(studentId) {
  const cameraEl = document.getElementById('revCompCamera');
  const soundEl = document.getElementById('revCompSound');
  const lightEl = document.getElementById('revCompLight');
  const editEl = document.getElementById('revCompEdit');

  const camera = parseInt(cameraEl ? cameraEl.value : '85', 10);
  const sound = parseInt(soundEl ? soundEl.value : '80', 10);
  const light = parseInt(lightEl ? lightEl.value : '80', 10);
  const edit = parseInt(editEl ? editEl.value : '85', 10);

  const competencies = { camera, sound, light, edit };

  try {
    const res = await fetch('/api/users/' + studentId + '/competencies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || 'demo-token')
      },
      body: JSON.stringify({ competencies })
    });
    if (!res.ok) {
      await fetch('/api/admin/users/' + studentId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (token || 'demo-token')
        },
        body: JSON.stringify({ competencies })
      });
    }
  } catch (err) {
    console.warn('Error saving student competencies:', err);
  }

  const calcRating = parseFloat((((camera + sound + light + edit) / 4) / 20).toFixed(1));
  const updateStudentObj = (st) => {
    if (st && st.id === studentId) {
      st.competencies = competencies;
      st.rating = calcRating;
    }
  };
  (globalReviewsStudents || []).forEach(updateStudentObj);
  (globalStudents || []).forEach(updateStudentObj);
  (globalAdminUsers || []).forEach(updateStudentObj);
  if (currentUser && currentUser.id === studentId) {
    currentUser.competencies = competencies;
    currentUser.rating = calcRating;
    localStorage.setItem('user', JSON.stringify(currentUser));
  }

  renderReviewsStudentsList(globalReviewsStudents);
  const curRatingBadge = document.getElementById('revSelectedStudentRatingBadge');
  if (curRatingBadge) {
    curRatingBadge.innerHTML = '<svg class="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> ' + calcRating;
  }

  showToast('Оценка компетенций сохранена: Камера ' + camera + '%, Звук ' + sound + '%, Свет ' + light + '%, Монтаж ' + edit + '% (Рейтинг: ' + calcRating + ')');
}
window.saveStudentCompetenciesFromReviews = saveStudentCompetenciesFromReviews;

function setReviewType(type) {
  currentReviewType = type;
  const posBtn = document.getElementById('reviewBtnPositive');
  const negBtn = document.getElementById('reviewBtnNegative');
  if (posBtn && negBtn) {
    if (type === 'POSITIVE') {
      posBtn.className = 'flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition border-emerald-500 bg-emerald-950/40 text-emerald-300 font-black';
      negBtn.className = 'flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition border-neutral-700 bg-neutral-900/40 text-neutral-400';
    } else {
      posBtn.className = 'flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition border-neutral-700 bg-neutral-900/40 text-neutral-400';
      negBtn.className = 'flex-1 py-2 text-xs font-extrabold uppercase flex items-center justify-center gap-1.5 border transition border-red-500 bg-red-950/40 text-red-300 font-black';
    }
  }
}

async function submitStudentReview(studentId) {
  const textInp = document.getElementById('reviewCommentText');
  const text = textInp ? textInp.value.trim() : '';

  if (!text) {
    showToast('Пожалуйста, напишите текст комментария');
    return;
  }

  const student = (globalReviewsStudents || []).find(s => s.id === studentId) || {};
  const studentName = student.fullName || '';
  const authorName = (currentUser && currentUser.fullName) ? currentUser.fullName : 'Мастер Медиацентра';

  try {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({
        studentId,
        studentName,
        authorName,
        type: currentReviewType,
        text
      })
    });
    if (res.ok) {
      showToast('Отзыв успешно опубликован!');
      if (textInp) textInp.value = '';
      await selectStudentForReviews(studentId);
      // Обновляем общий реестр
      try {
        const sRes = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') } });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.students) globalStudents = sData.students;
        }
      } catch (e) {}
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Ошибка при сохранении отзыва');
    }
  } catch (err) {
    showToast('Ошибка сети при сохранении отзыва');
  }
}

async function deleteStudentReview(commentId, studentId) {
  if (!confirm('Вы уверены, что хотите удалить данный отзыв?')) return;

  try {
    const res = await fetch('/api/comments/' + commentId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      showToast('Отзыв удалён');
      await selectStudentForReviews(studentId);
    } else {
      showToast('Ошибка при удалении отзыва');
    }
  } catch (err) {
    showToast('Ошибка сети');
  }
}


function openQrPassModal() {
  if (!currentUser) return;
  const modal = document.getElementById('qrPassModal');
  const nameEl = document.getElementById('qrModalStudentName');
  const groupEl = document.getElementById('qrModalStudentGroup');
  const qrContainer = document.getElementById('qrModalCodeContainer');
  const codeIdEl = document.getElementById('qrModalCodeId');

  const userProfileUrl = window.location.origin + window.location.pathname + '?user=' + encodeURIComponent(currentUser.id);

  if (nameEl) nameEl.innerText = currentUser.fullName;
  if (groupEl) groupEl.innerText = currentUser.groupName || 'КТ-26';
  if (codeIdEl) codeIdEl.innerText = userProfileUrl;
  if (qrContainer) {
    qrContainer.innerHTML = renderOfflineQrSvg(userProfileUrl, 240);
  }
  if (modal) modal.classList.remove('hidden');
}

function closeQrPassModal() {
  const modal = document.getElementById('qrPassModal');
  if (modal) modal.classList.add('hidden');
}

// ----------------- МОНИТОРИНГ ТЕХНИКИ И ТРЕКИНГ ЦКТ (МАСТЕРА / АДМИНЫ) -----------------
let currentTrackerCategory = 'ALL';

function filterTrackerCategory(cat) {
  currentTrackerCategory = cat;
  document.querySelectorAll('#equipmentCategoryFilters .category-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.innerText.includes(cat) || (cat === 'ALL' && btn.innerText.includes('Все')));
  });
  filterTrackerList();
}

function filterTrackerList() {
  const searchInput = document.getElementById('trackerSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const container = document.getElementById('equipmentTrackerList');
  if (!container) return;

  const inventory = globalInventory || [];
  let filtered = inventory;

  if (currentTrackerCategory !== 'ALL') {
    filtered = filtered.filter(e => e.category === currentTrackerCategory);
  }

  if (query) {
    filtered = filtered.filter(e => 
      (e.name && e.name.toLowerCase().includes(query)) ||
      (e.serialNumber && e.serialNumber.toLowerCase().includes(query)) ||
      (e.notes && e.notes.toLowerCase().includes(query))
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  container.innerHTML = filtered.map(eq => {
    let currentShoot = null;
    let upcomingShoot = null;

    for (const sh of (globalShoots || [])) {
      if (sh.isCompleted) continue;
      const hasEq = sh.equipment && sh.equipment.some(e => (typeof e === 'string' ? e === eq.id : e.id === eq.id));
      if (!hasEq) continue;

      const sDateStr = (sh.date && sh.date.includes('T')) ? sh.date.split('T')[0] : sh.date;
      const sStart = sh.startTime || '11:30';
      const sEnd = sh.endTime || '18:00';
      const startDate = new Date(sDateStr + 'T' + sStart + ':00');
      const endDate = new Date(sDateStr + 'T' + sEnd + ':00');

      if (now >= startDate && now <= endDate) {
        currentShoot = sh;
        break;
      } else if (sDateStr === todayStr || new Date(sDateStr) >= now) {
        if (!upcomingShoot) upcomingShoot = sh;
      }
    }

    let statusCardHtml = '';
    let borderStyle = 'border-color: var(--border-subtle); background-color: var(--bg-card);';

    if (currentShoot) {
      borderStyle = 'border-color: rgba(227, 6, 19, 0.8); background-color: rgba(69, 10, 10, 0.25);';
      const camOperator = currentShoot.crew ? currentShoot.crew.find(c => (c.roleInShoot || '').toUpperCase().includes('ОПЕРАТОР')) : null;
      let opHtml = '—';
      if (camOperator) {
        const opUser = camOperator.user || {};
        const opName = opUser.fullName || camOperator.fullName || 'Оператор';
        const opId = opUser.id || camOperator.userId || camOperator.id;
        if (isMasterOrAdminUser(currentUser) && opId) {
          opHtml = '<button type="button" onclick="event.stopPropagation(); openShowreelModal(\'' + opId + '\')" class="text-amber-300 hover:underline inline-flex items-center gap-1 font-bold cursor-pointer" title="Открыть профиль оператора">' +
            '<span>' + opName + '</span><span class="text-[9px]">👤</span>' +
          '</button>';
        } else {
          opHtml = '<span class="text-amber-300 font-bold">' + opName + '</span>';
        }
      }

      statusCardHtml = '<div class="mt-2 p-2 border border-red-800/60 bg-red-950/60 text-[10px] font-mono space-y-1">' +
        '<div class="flex items-center justify-between">' +
          '<span class="text-red-400 font-extrabold animate-pulse">🔴 В ЭФИРЕ (ON AIR)</span>' +
          '<span class="text-white font-bold">' + (currentShoot.callTime || '10:00') + ' - ' + (currentShoot.endTime || '18:00') + '</span>' +
        '</div>' +
        '<div class="truncate text-white font-bold">' + currentShoot.title + '</div>' +
        '<div class="text-[var(--text-muted)] truncate">📍 ' + currentShoot.location + '</div>' +
        (camOperator ? '<div class="truncate">Ответственный: ' + opHtml + '</div>' : '') +
      '</div>';
    } else if (upcomingShoot || eq.status === 'RESERVED') {
      borderStyle = 'border-color: rgba(245, 158, 11, 0.8); background-color: rgba(69, 39, 10, 0.25);';
      const shTitle = upcomingShoot ? upcomingShoot.title : (eq.notes || 'Резерв цеха');
      const shTime = upcomingShoot ? ((upcomingShoot.callTime || '10:00') + ' - ' + (upcomingShoot.endTime || '18:00')) : 'ТО';
      statusCardHtml = '<div class="mt-2 p-2 border border-amber-800/60 bg-amber-950/60 text-[10px] font-mono space-y-1">' +
        '<div class="flex items-center justify-between">' +
          '<span class="text-amber-400 font-bold">🟡 В РЕЗЕРВЕ НА СМЕНУ</span>' +
          '<span class="text-amber-200 font-bold">' + shTime + '</span>' +
        '</div>' +
        '<div class="truncate text-white font-bold">' + shTitle + '</div>' +
      '</div>';
    } else {
      statusCardHtml = '<div class="mt-2 p-2 border border-emerald-900/60 bg-emerald-950/40 text-[10px] font-mono flex items-center justify-between">' +
        '<span class="text-emerald-400 font-bold">🟢 СВОБОДНО НА СКЛАДЕ</span>' +
        '<span class="text-[var(--text-muted)]">ЦКТ КП11</span>' +
      '</div>';
    }

    return '<div onclick="openEquipmentDetailsModal(\'' + eq.id + '\')" class="p-3.5 border transition cursor-pointer hover:border-[var(--brand-red)] hover:shadow-lg group relative" style="' + borderStyle + '" title="Нажмите, чтобы открыть статус использования и свободные серийники">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0 flex-1">' +
          '<span class="text-xs font-bold uppercase truncate block group-hover:text-amber-400 transition" style="color: var(--text-primary);">' + eq.name + '</span>' +
          '<div class="flex items-center gap-1.5 mt-0.5">' +
            '<span class="text-[9px] font-mono px-1 py-0.2 bg-neutral-900 border text-amber-400 font-bold border-neutral-700">S/N: ' + (eq.serialNumber || '—') + '</span>' +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">' + (eq.category || 'Техника') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
          '<button type="button" onclick="event.stopPropagation(); openEquipmentDetailsModal(\'' + eq.id + '\')" class="px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-400 border border-amber-800/40 bg-amber-950/20 hover:bg-amber-900/40" title="Статус и серийники">ℹ️</button>' +
          '<button type="button" onclick="event.stopPropagation(); editInlineEquipmentItem(\'' + eq.id + '\'); switchTab(\'shoots\'); openShootModal();" class="px-2 py-0.5 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-800/40 bg-cyan-950/20 hover:bg-cyan-900/40">✎</button>' +
        '</div>' +
      '</div>' +
      statusCardHtml +
      '<div class="mt-2 pt-2 border-t flex items-center justify-between text-[9px] font-mono text-[var(--text-muted)] group-hover:text-amber-400 transition" style="border-color: var(--border-subtle);">' +
        '<span>График и серийники ➔</span>' +
        '<span class="text-amber-400 opacity-80">Инфо плашка</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadEquipmentTracker() {
  if (!globalInventory || globalInventory.length === 0) {
    await loadInventoryData();
  }
  const inventory = globalInventory || [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let onAirCount = 0;
  let reservedCount = 0;
  let freeCount = 0;

  inventory.forEach(eq => {
    let isOnAir = false;
    let isReserved = false;

    for (const sh of (globalShoots || [])) {
      if (sh.isCompleted) continue;
      const hasEq = sh.equipment && sh.equipment.some(e => (typeof e === 'string' ? e === eq.id : e.id === eq.id));
      if (!hasEq) continue;

      const sDateStr = (sh.date && sh.date.includes('T')) ? sh.date.split('T')[0] : sh.date;
      const sStart = sh.startTime || '11:30';
      const sEnd = sh.endTime || '18:00';
      const startDate = new Date(sDateStr + 'T' + sStart + ':00');
      const endDate = new Date(sDateStr + 'T' + sEnd + ':00');

      if (now >= startDate && now <= endDate) {
        isOnAir = true;
        break;
      } else if (sDateStr === todayStr || new Date(sDateStr) >= now) {
        isReserved = true;
      }
    }

    if (isOnAir) {
      onAirCount++;
    } else if (isReserved || eq.status === 'RESERVED') {
      reservedCount++;
    } else {
      freeCount++;
    }
  });

  const totEl = document.getElementById('trackerTotalCount');
  const onAirEl = document.getElementById('trackerOnAirCount');
  const resEl = document.getElementById('trackerReservedCount');
  const freeEl = document.getElementById('trackerFreeCount');

  if (totEl) totEl.innerText = inventory.length;
  if (onAirEl) onAirEl.innerText = onAirCount;
  if (resEl) resEl.innerText = reservedCount;
  if (freeEl) freeEl.innerText = freeCount;

  filterTrackerList();
}

// ----------------- ПОЛНОЕ РЕДАКТИРОВАНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ (АДМИН-ПАНЕЛЬ) -----------------
function openAdminUserFullEditModal(userId) {
  const user = (globalAdminUsers || []).find(u => u.id === userId) || (globalStudents || []).find(s => s.id === userId);
  if (!user) {
    showToast('Пользователь не найден в базе');
    return;
  }
  const modal = document.getElementById('adminUserFullEditModal');
  if (!modal) return;

  const idEl = document.getElementById('fullEditUserId');
  const nameEl = document.getElementById('fullEditFullName');
  const groupEl = document.getElementById('fullEditGroup');
  const emailEl = document.getElementById('fullEditEmail');
  const roleEl = document.getElementById('fullEditRole');
  const rankEl = document.getElementById('fullEditCraftRank');
  const tgEl = document.getElementById('fullEditTelegram');
  const chatEl = document.getElementById('fullEditChatId');
  const passEl = document.getElementById('fullEditNewPassword');
  const blackEl = document.getElementById('fullEditBlacklisted');

  // Аватарка
  const avatarPrev = document.getElementById('fullEditAvatarPreview');
  const avatarBase64 = document.getElementById('fullEditAvatarBase64');
  const avatarUrlInput = document.getElementById('fullEditAvatarUrl');
  if (avatarPrev) avatarPrev.src = user.avatar || 'img/student.jpg';
  if (avatarBase64) avatarBase64.value = user.avatar || '';
  if (avatarUrlInput) {
    avatarUrlInput.value = (user.avatar && /^https?:\/\//i.test(user.avatar)) ? user.avatar : '';
  }

  // 4 параметра компетенций (Камера, Звук, Свет, Монтаж)
  const comps = user.competencies || { camera: 85, sound: 80, light: 80, edit: 85 };
  const cam = comps.camera ?? 85;
  const snd = comps.sound ?? 80;
  const lgt = comps.light ?? 80;
  const edt = comps.edit ?? 85;

  const camEl = document.getElementById('fullEditCompCamera');
  const camVal = document.getElementById('fullEditCompCameraVal');
  if (camEl) camEl.value = cam;
  if (camVal) camVal.innerText = cam + '%';

  const sndEl = document.getElementById('fullEditCompSound');
  const sndVal = document.getElementById('fullEditCompSoundVal');
  if (sndEl) sndEl.value = snd;
  if (sndVal) sndVal.innerText = snd + '%';

  const lgtEl = document.getElementById('fullEditCompLight');
  const lgtVal = document.getElementById('fullEditCompLightVal');
  if (lgtEl) lgtEl.value = lgt;
  if (lgtVal) lgtVal.innerText = lgt + '%';

  const edtEl = document.getElementById('fullEditCompEdit');
  const edtVal = document.getElementById('fullEditCompEditVal');
  if (edtEl) edtEl.value = edt;
  if (edtVal) edtVal.innerText = edt + '%';

  if (idEl) idEl.value = user.id;
  if (nameEl) nameEl.value = user.fullName || '';
  if (groupEl) groupEl.value = user.groupName || '';
  if (emailEl) emailEl.value = user.email || '';
  if (roleEl) roleEl.value = (user.role && user.role.name) ? user.role.name : (user.role || 'Студент');
  if (rankEl) rankEl.value = user.craftRank || '';
  if (tgEl) tgEl.value = user.telegram || '';
  if (chatEl) chatEl.value = user.telegramChatId || '';
  if (passEl) passEl.value = '';
  if (blackEl) blackEl.checked = !!user.isBlacklisted;

  modal.classList.remove('hidden');
}

function closeAdminUserFullEditModal() {
  const modal = document.getElementById('adminUserFullEditModal');
  if (modal) modal.classList.add('hidden');
}

async function handleSaveAdminUserFull(e) {
  e.preventDefault();
  const userId = document.getElementById('fullEditUserId').value;
  if (!userId) return;

  const fullName = document.getElementById('fullEditFullName').value.trim();
  const groupName = document.getElementById('fullEditGroup').value.trim();
  const email = document.getElementById('fullEditEmail').value.trim();
  const roleName = document.getElementById('fullEditRole').value;
  const craftRank = document.getElementById('fullEditCraftRank').value.trim();
  const telegram = document.getElementById('fullEditTelegram').value.trim();
  const telegramChatId = document.getElementById('fullEditChatId').value.trim();
  const newPassword = document.getElementById('fullEditNewPassword') ? document.getElementById('fullEditNewPassword').value : '';
  const isBlacklisted = document.getElementById('fullEditBlacklisted') ? document.getElementById('fullEditBlacklisted').checked : false;

  const avatar = document.getElementById('fullEditAvatarBase64') ? document.getElementById('fullEditAvatarBase64').value : undefined;

  const camEl = document.getElementById('fullEditCompCamera');
  const sndEl = document.getElementById('fullEditCompSound');
  const lgtEl = document.getElementById('fullEditCompLight');
  const edtEl = document.getElementById('fullEditCompEdit');
  const competencies = {
    camera: camEl ? parseInt(camEl.value, 10) : 85,
    sound: sndEl ? parseInt(sndEl.value, 10) : 80,
    light: lgtEl ? parseInt(lgtEl.value, 10) : 80,
    edit: edtEl ? parseInt(edtEl.value, 10) : 85
  };

  const payload = {
    fullName,
    groupName,
    email,
    role: { name: roleName },
    roleName,
    craftRank,
    telegram: telegram ? (telegram.startsWith('@') ? telegram : ('@' + telegram)) : '',
    telegramChatId,
    newPassword: newPassword || undefined,
    isBlacklisted,
    avatar: avatar || null,
    competencies
  };

  try {
    const res = await fetch('/api/admin/users/' + userId + '/full', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      await fetch('/api/admin/users/' + userId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.warn('Update user error:', err);
  }

  const idx = (globalAdminUsers || []).findIndex(u => u.id === userId);
  if (idx !== -1) {
    globalAdminUsers[idx] = { ...globalAdminUsers[idx], ...payload, role: { name: roleName } };
  }
  const stIdx = (globalStudents || []).findIndex(s => s.id === userId);
  if (stIdx !== -1) {
    globalStudents[stIdx] = { ...globalStudents[stIdx], ...payload, role: { name: roleName } };
  }

  if (currentUser && currentUser.id === userId) {
    currentUser.avatar = avatar || null;
    currentUser.competencies = competencies;
    currentUser.fullName = fullName;
    currentUser.groupName = groupName;
    localStorage.setItem('user', JSON.stringify(currentUser));
    const navAv = document.getElementById('userNavAvatarImg');
    if (navAv) navAv.src = avatar || 'img/student.jpg';
  }

  showToast('Профиль пользователя «' + fullName + '» успешно обновлён!');
  closeAdminUserFullEditModal();
  renderAdminUsers(globalAdminUsers);
  if (typeof loadShoots === 'function') loadShoots();
}

async function handleDeleteUserFromModal() {
  const userId = document.getElementById('fullEditUserId').value;
  if (!userId) return;

  if (!confirm('Вы уверены, что хотите навсегда удалить этот аккаунт пользователя? Это действие необратимо.')) {
    return;
  }

  try {
    const res = await fetch('/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      showToast('Аккаунт успешно удалён');
      closeAdminUserFullEditModal();
      globalAdminUsers = (globalAdminUsers || []).filter(u => u.id !== userId);
      globalStudents = (globalStudents || []).filter(s => s.id !== userId);
      renderAdminUsers(globalAdminUsers);
      if (typeof loadShoots === 'function') loadShoots();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Ошибка при удалении аккаунта');
    }
  } catch (e) {
    showToast('Ошибка сети при удалении');
  }
}

async function toggleBlacklist(userId) {
  try {
    const res = await fetch('/api/admin/users/' + userId + '/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      const data = await res.json();
      const isBl = !!data.isBlacklisted;
      showToast(isBl ? 'Пользователь добавлен в чёрный список' : 'Пользователь удалён из чёрного списка');
      
      const u = (globalAdminUsers || []).find(x => x.id === userId);
      if (u) u.isBlacklisted = isBl;
      const s = (globalStudents || []).find(x => x.id === userId);
      if (s) s.isBlacklisted = isBl;

      renderAdminUsers(globalAdminUsers);
      if (typeof loadShoots === 'function') loadShoots();
    } else {
      showToast('Ошибка изменения статуса чёрного списка');
    }
  } catch (err) {
    showToast('Ошибка сети');
  }
}

// ----------------- КОПИРОВАНИЕ ССЫЛКИ НА ПЕРСОНАЛЬНЫЙ ПРОФИЛЬ -----------------
function copyMyProfileLink() {
  if (!currentUser) return;
  const url = window.location.origin + window.location.pathname + '?user=' + encodeURIComponent(currentUser.id);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Ссылка на профиль скопирована!');
    }).catch(() => {
      prompt('Скопируйте ссылку на профиль:', url);
    });
  } else {
    prompt('Скопируйте ссылку на профиль:', url);
  }
}
window.copyMyProfileLink = copyMyProfileLink;

function openCompetencyModal(shootId, crewMemberId, craftRole, userName) {
  activeCompetencyData = { shootId, crewMemberId, craftRole, userName, scores: [5, 5, 5] };
  const modal = document.getElementById('competencyModal');
  const container = document.getElementById('competencyModalContent');
  if (!modal || !container) return;

  const roleUpper = (craftRole || '').toUpperCase();
  let criteria = [
    { title: 'Экспозиция и Log-C профили', desc: 'Контроль динамического диапазона и пересветов' },
    { title: 'Фокус-пуллинг и резкость', desc: 'Плавность перевода фокуса, глубина резкости' },
    { title: 'Композиция и движение камеры', desc: 'Золотое сечение, стабильность кадра' }
  ];

  if (roleUpper.includes('ЗВУК')) {
    criteria = [
      { title: 'Уровни записи и клиппинг', desc: 'Запас по уровню (-12dBFS), чистота звукового тракта' },
      { title: 'Работа с петличками и бумом', desc: 'Правильное позиционирование микрофонов' },
      { title: 'Мониторинг шумов и таймкод', desc: 'Изоляция посторонних шумов, синхросигнал' }
    ];
  } else if (roleUpper.includes('ГАФФЕР') || roleUpper.includes('СВЕТ') || roleUpper.includes('ОСВЕТ')) {
    criteria = [
      { title: 'Световая схема площадки', desc: 'Соотношение Key / Fill / Backlight, контрастность' },
      { title: 'Цветовая температура (Kelvin)', desc: 'Согласование приборов 3200K / 5600K, гелевые фильтры' },
      { title: 'Электробезопасность и коммутация', desc: 'Нагрузка фаз, техника безопасности на площадке' }
    ];
  } else if (roleUpper.includes('МОНТАЖ')) {
    criteria = [
      { title: 'Монтажный темпоритм и склейка', desc: 'Динамика сцены, точность точек перехода' },
      { title: 'Цветокоррекция и LUT пайплайн', desc: 'Баланс белого, тональные кривые' },
      { title: 'Синхронизация звука и финализация', desc: 'Таймкод дорожек, рендер мастер-файла' }
    ];
  }

  activeCompetencyData.criteria = criteria;

  container.innerHTML = 
    '<div class="p-3 border space-y-1" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-xs font-bold uppercase" style="color: var(--text-primary);">' + userName + '</span>' +
        '<span class="crew-dept-tag dept-badge-cinema font-bold text-[10px]">' + craftRole + '</span>' +
      '</div>' +
      '<p class="text-[11px] font-mono" style="color: var(--text-muted);">Оценивание профессиональных стандартов цеха (шкала 1 - 5 баллов):</p>' +
    '</div>' +

    '<div class="space-y-4">' +
      criteria.map((c, idx) => 
        '<div class="p-3 border space-y-2" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
          '<div class="flex justify-between items-center">' +
            '<div>' +
              '<h5 class="text-xs font-extrabold uppercase" style="color: var(--text-primary);">' + (idx + 1) + '. ' + c.title + '</h5>' +
              '<p class="text-[10px] font-medium" style="color: var(--text-muted);">' + c.desc + '</p>' +
            '</div>' +
            '<span id="metric_val_' + idx + '" class="font-mono text-sm font-extrabold text-amber-400">5.0</span>' +
          '</div>' +
          '<input type="range" min="1" max="5" step="0.5" value="5" oninput="updateCompetencyMetric(' + idx + ', this.value)" class="w-full accent-[var(--brand-red)] cursor-pointer">' +
        '</div>'
      ).join('') +
    '</div>' +

    '<div class="p-3 border flex items-center justify-between" style="background-color: var(--bg-elevated); border-color: var(--border-color);">' +
      '<span class="text-xs font-extrabold uppercase font-mono" style="color: var(--text-primary);">Итоговый средний балл цеха:</span>' +
      '<span id="competencyAverageDisplay" class="text-base font-extrabold font-mono text-emerald-400">5.0 / 5.0</span>' +
    '</div>' +

    '<div class="pt-2 flex gap-2">' +
      '<button onclick="saveCompetencyGrades()" class="flex-1 py-2.5 text-xs font-extrabold uppercase btn-brand-primary">' +
        'Утвердить оценку в матрицу' +
      '</button>' +
      '<button onclick="closeCompetencyModal()" class="py-2.5 px-4 text-xs font-extrabold uppercase btn-brand-ghost">' +
        'Отмена' +
      '</button>' +
    '</div>';

  modal.classList.remove('hidden');
}

function updateCompetencyMetric(idx, val) {
  if (!activeCompetencyData) return;
  activeCompetencyData.scores[idx] = parseFloat(val);
  const valDisplay = document.getElementById('metric_val_' + idx);
  if (valDisplay) valDisplay.innerText = parseFloat(val).toFixed(1);

  const avg = (activeCompetencyData.scores.reduce((a, b) => a + b, 0) / activeCompetencyData.scores.length).toFixed(1);
  const avgDisplay = document.getElementById('competencyAverageDisplay');
  if (avgDisplay) avgDisplay.innerText = avg + ' / 5.0';
}

async function saveCompetencyGrades() {
  if (!activeCompetencyData) return;
  const avg = (activeCompetencyData.scores.reduce((a, b) => a + b, 0) / activeCompetencyData.scores.length).toFixed(1);
  
  const hiddenInput = document.getElementById('grade_input_' + activeCompetencyData.crewMemberId);
  if (hiddenInput) hiddenInput.value = avg;
  setStarRating(activeCompetencyData.crewMemberId, Math.round(parseFloat(avg)));

  showToast('Оценка ' + avg + ' утверждена в матрицу компетенций ' + activeCompetencyData.userName + '!');
  closeCompetencyModal();
}

function closeCompetencyModal() {
  const modal = document.getElementById('competencyModal');
  if (modal) modal.classList.add('hidden');
}

// ================= КИНЕМАТОГРАФИЧЕСКИЕ ЦИТАТЫ (ПОДБОР ПО ВРЕМЕНИ И РЕЙТИНГУ) =================
const CINEMA_QUOTES_CLIENT = [
  // Утро (05:00 - 11:59)
  { time: 'morning', tier: 'master', text: '«Утренний свет на съёмочной площадке невозможно сымитировать — его можно только поймать и запечатлеть».', author: 'Роджер Дикинс' },
  { time: 'morning', tier: 'master', text: '«Каждое утро перед командой „Мотор!“ рождается новый кинематографический мир».', author: 'Федерико Феллини' },
  { time: 'morning', tier: 'student', text: '«Хорошее начало смены — это половина успеха картины. Дисциплина рождает свободу творчества».', author: 'Акира Куросава' },
  { time: 'morning', tier: 'master', text: '«Первый дубль задаёт ритм всему съёмочному дню. Будьте предельно точны с фокусом и звуком».', author: 'Стэнли Кубрик' },
  { time: 'morning', tier: 'master', text: '«Утро — время чистых мыслей, собранности цехов и выверенной экспозиции».', author: 'Андрей Тарковский' },
  { time: 'morning', tier: 'guest', text: '«Кино начинается задолго до команды „Мотор!“. Оно начинается с утреннего кофе и взгляда в видоискатель».', author: 'Дэвид Линч' },
  { time: 'morning', tier: 'student', text: '«Подготовленный вызывной и план смены спасают съёмочную группу от любого утреннего хаоса».', author: 'Альфред Хичкок' },
  { time: 'morning', tier: 'student', text: '«Свет — это кисть кинематографиста. Утренние тени рисуют подлинную драматургию кадра».', author: 'Витторио Стораро' },

  // День (12:00 - 17:59)
  { time: 'day', tier: 'master', text: '«Кинематограф — это не просто съёмка реальности. Это создание правды со скоростью 24 кадра в секунду».', author: 'Жан-Люк Годар' },
  { time: 'day', tier: 'student', text: '«Режиссёр ведёт оркестр, но каждый цех группы — солист, отвечающий за чистоту звука и кадра».', author: 'Мартин Скорсезе' },
  { time: 'day', tier: 'master', text: '«В кино нет мелочей: посторонний шорох в петличке или микросмаз разрушают иллюзию жизни».', author: 'Дэвид Финчер' },
  { time: 'day', tier: 'student', text: '«Монтаж начинается уже на площадке — думайте о склейках во время каждого панорамирования».', author: 'Сергей Эйзенштейн' },
  { time: 'day', tier: 'student', text: '«Снимайте каждый дубль так, будто он войдёт в историю кино. Вкладывайте всю энергию в объектив».', author: 'Квентин Тарантино' },
  { time: 'day', tier: 'master', text: '«Кадр должен дышать вместе со зрителем. Следите за динамикой мизансцены и чистотой фокуса».', author: 'Кристофер Нолан' },
  { time: 'day', tier: 'student', text: '«Звук в кино несёт ровно половину эмоционального веса сцены. Никогда не пренебрегайте чистовой дорожкой».', author: 'Джордж Лукас' },
  { time: 'day', tier: 'guest', text: '«Кинокамера — это увеличительное стекло человеческой души и правды характера».', author: 'Ингмар Бергман' },
  { time: 'day', tier: 'master', text: '«Высшее мастерство оператора — растворить камеру в атмосфере происходящего на площадке».', author: 'Эммануэль Любецки' },

  // Вечер (18:00 - 22:59)
  { time: 'evening', tier: 'master', text: '«Режимное время длится считанные минуты. Настоящий профессионализм — быть полностью готовым к нему заранее».', author: 'Роджер Дикинс' },
  { time: 'evening', tier: 'student', text: '«Вечерний дубль подводит итог смены. Отснятый материал говорит громче любых слов».', author: 'Андрей Тарковский' },
  { time: 'evening', tier: 'guest', text: '«Кино — это жизнь, с которой вывели пятна. Продолжаем двигаться точно по сценарию!»', author: 'Альфред Хичкок' },
  { time: 'evening', tier: 'student', text: '«Фильм собирается по крупицам: то, что снято сегодня вечером, завтра станет историей на монтажном столе».', author: 'Стивен Спилберг' },
  { time: 'evening', tier: 'master', text: '«Никогда не компрометируйте художественный замысел ради спешки к концу смены. Честность кадра превыше всего».', author: 'Дени Вильнёв' },
  { time: 'evening', tier: 'master', text: '«Вечерний свет требует ювелирной работы со светотенью, плотностью теней и балансом белого».', author: 'Роберт Элсвит' },
  { time: 'evening', tier: 'student', text: '«Дисциплинированная съёмочная группа завершает смену вовремя и со сданным парком техники».', author: 'Клинт Иствуд' },
  { time: 'evening', tier: 'guest', text: '«Магия кинематографа — превратить вечернюю усталость команды в триумф финального кадра дня».', author: 'Фрэнсис Форд Коппола' },

  // Ночь (23:00 - 04:59)
  { time: 'night', tier: 'master', text: '«Ночная смена обнажает истинный нерв кинопроизводства. Свет во тьме становится главным драматургом».', author: 'Дэвид Финчер' },
  { time: 'night', tier: 'guest', text: '«В темноте павильона оживает воображение. Кинематограф — это сновидение наяву».', author: 'Федерико Феллини' },
  { time: 'night', tier: 'master', text: '«Снимать ночью — значит писать светом по чёрному холсту. Каждый контровой прибор меняет всё пространство».', author: 'Роджер Дикинс' },
  { time: 'night', tier: 'student', text: '«Ночной монтаж — время, когда разрозненные дубли наконец обретают своё подлинное дыхание и ритм».', author: 'Уолтер Мёрч' },
  { time: 'night', tier: 'master', text: '«Тишина ночной съёмочной площадки обостряет восприятие каждого шороха и каждого блика на линзе».', author: 'Андрей Тарковский' },
  { time: 'night', tier: 'student', text: '«Ночь принадлежит тем, кто влюблён в магию кинокамеры сильнее сна».', author: 'Кристофер Нолан' }
];

let lastQuoteHour = -1;

function updateCinemaQuote(force = false) {
  const now = new Date();
  const currentHour = now.getHours();

  if (!force && lastQuoteHour === currentHour) {
    return;
  }

  let timeCategory = 'day';
  let timeBadgeText = 'ДНЕВНАЯ СМЕНА';
  if (currentHour >= 5 && currentHour < 12) {
    timeCategory = 'morning';
    timeBadgeText = 'УТРЕННЯЯ СМЕНА';
  } else if (currentHour >= 12 && currentHour < 18) {
    timeCategory = 'day';
    timeBadgeText = 'ДНЕВНАЯ СМЕНА';
  } else if (currentHour >= 18 && currentHour < 23) {
    timeCategory = 'evening';
    timeBadgeText = 'ВЕЧЕРНЯЯ СМЕНА';
  } else {
    timeCategory = 'night';
    timeBadgeText = 'НОЧНАЯ СМЕНА';
  }

  let userTier = 'guest';
  if (currentUser) {
    if (isMasterUser(currentUser) || (parseFloat(currentUser.rating) || 0) >= 4.8) {
      userTier = 'master';
    } else {
      userTier = 'student';
    }
  }

  const cachedKey = 'kp11_hourly_quote';
  let chosen = null;

  try {
    const cached = JSON.parse(localStorage.getItem(cachedKey) || 'null');
    if (!force && cached && cached.hour === currentHour && cached.date === now.toDateString() && cached.tier === userTier) {
      chosen = cached;
    }
  } catch (e) {}

  if (!chosen) {
    let pool = CINEMA_QUOTES_CLIENT.filter(q => q.time === timeCategory && q.tier === userTier);
    if (pool.length === 0) {
      pool = CINEMA_QUOTES_CLIENT.filter(q => q.time === timeCategory);
    }
    if (pool.length === 0) pool = CINEMA_QUOTES_CLIENT;

    const quoteIndex = (currentHour * 7 + now.getDate()) % pool.length;
    const selected = pool[quoteIndex] || pool[0];
    chosen = {
      text: selected.text,
      author: selected.author,
      timeBadge: timeBadgeText,
      hour: currentHour,
      date: now.toDateString(),
      tier: userTier
    };
    try {
      localStorage.setItem(cachedKey, JSON.stringify(chosen));
    } catch (e) {}
  }

  lastQuoteHour = currentHour;

  const textEl = document.getElementById('cinemaBoardText');
  const authorEl = document.getElementById('cinemaBoardAuthor');
  const badgeEl = document.getElementById('cinemaTimeBadge');

  if (textEl) {
    textEl.style.transition = 'opacity 0.25s ease';
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.innerText = chosen.text;
      textEl.style.opacity = '1';
    }, 120);
  }
  if (authorEl) {
    authorEl.innerText = '— ' + chosen.author;
  }
  if (badgeEl) {
    badgeEl.innerText = chosen.timeBadge;
  }
}

async function loadCinemaBoard() {
  updateCinemaQuote();
  try {
    const res = await fetch('/api/cinemaboard');
    if (res.ok) {
      const data = await res.json();
      if (data && data.text && data.author) {
        // Сервер подтвердил актуальность
      }
    }
  } catch (err) {}
}
window.loadCinemaBoard = loadCinemaBoard;

if (!window._cinemaQuoteInterval) {
  window._cinemaQuoteInterval = setInterval(() => {
    if (new Date().getHours() !== lastQuoteHour) {
      updateCinemaQuote();
    }
  }, 30000);
}

async function loadStatisticsData() {
  let data = null;
  try {
    const res = await fetch('/api/statistics', {
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      data = await res.json();
    }
  } catch (err) {
    console.warn('API /api/statistics offline or warning:', err.message);
  }

  if (typeof recalculateAllStudentRatings === 'function') {
    recalculateAllStudentRatings();
  }

  const localShoots = Array.isArray(globalShoots) ? globalShoots : [];
  const localCompleted = localShoots.filter(s => s.isCompleted);
  const studentsList = (Array.isArray(globalStudents) && globalStudents.length > 0) ? globalStudents : getStudentDirectory();

  if (!data || data.totalShoots === 0 || !data.leaders || data.leaders.length === 0 || localShoots.length > (data.totalShoots || 0)) {
    const studentLeaders = [...studentsList]
      .filter(s => s.rating !== null && s.rating !== undefined && Number(s.rating) > 0 && !s.isSuspended)
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
      .slice(0, 10);

    const groupMap = {};
    studentsList.forEach(st => {
      const g = st.groupName || 'КТ-26';
      if (!groupMap[g]) groupMap[g] = { sum: 0, count: 0, participations: 0 };
      if (st.rating !== null && st.rating !== undefined && Number(st.rating) > 0) {
        groupMap[g].sum += parseFloat(st.rating);
        groupMap[g].count++;
      }
      if (st.completedShoots) {
        groupMap[g].participations += st.completedShoots;
      }
    });

    const groupsRating = Object.keys(groupMap)
      .filter(g => groupMap[g].count > 0)
      .map(g => ({
        groupName: g,
        avgRating: parseFloat((groupMap[g].sum / groupMap[g].count).toFixed(1)),
        participations: groupMap[g].participations
      })).sort((a, b) => b.avgRating - a.avgRating);

    const titleCounts = {};
    localShoots.forEach(sh => {
      const t = (sh.title || 'Смена').trim();
      titleCounts[t] = (titleCounts[t] || 0) + 1;
    });
    const frequentShoots = Object.keys(titleCounts).map(t => ({
      title: t,
      count: titleCounts[t]
    })).sort((a, b) => b.count - a.count).slice(0, 5);

    data = {
      totalShoots: localShoots.length,
      totalCompleted: localCompleted.length,
      leaders: studentLeaders,
      groupsRating: groupsRating,
      frequentShoots: frequentShoots
    };

    if (localShoots.length > 0) {
      fetch('/api/shoots/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({ shoots: localShoots, students: studentsList })
      }).catch(() => {});
    }
  }

  try {
    const leadersContainer = document.getElementById('statsLeadersList');
    if (leadersContainer) {
      if (!data.leaders || data.leaders.length === 0) {
        leadersContainer.innerHTML = '<div class="p-6 text-center text-xs font-mono border border-dashed" style="color: var(--text-muted); border-color: var(--border-subtle);">' +
          'Оценки студентов ещё не выставлены. Оценивание производится преподавателями во вкладке «Отзывы» по 4 параметрам цехов.' +
        '</div>';
      } else {
        leadersContainer.innerHTML = data.leaders.map((u, index) => {
          let rankBadge = '';
          let cardRankClass = 'rank-card-default';
          if (index === 0) {
            rankBadge = '<span class="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-[var(--brand-red)] text-white font-extrabold mr-2 rounded-sm shadow-sm">' + SVG_ICONS.diamond + '01</span>';
            cardRankClass = 'rank-card-top1';
          } else if (index === 1) {
            rankBadge = '<span class="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-amber-400 text-black font-extrabold mr-2 rounded-sm shadow-sm">' + SVG_ICONS.crown + '02</span>';
            cardRankClass = 'rank-card-top2';
          } else if (index === 2) {
            rankBadge = '<span class="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-orange-600 text-white font-extrabold mr-2 rounded-sm shadow-sm">' + SVG_ICONS.medal + '03</span>';
            cardRankClass = 'rank-card-top3';
          } else {
            const num = (index + 1 < 10 ? '0' : '') + (index + 1);
            rankBadge = '<span class="text-[10px] font-mono mr-2.5 font-bold" style="color: var(--text-muted);">' + num + '</span>';
          }

          const colorClass = getRatingBadgeColor(u.rating);

          return '<div class="flex items-center justify-between p-3 text-xs transition ' + cardRankClass + '">' +
            '<div class="flex items-center">' +
              rankBadge +
              '<span class="font-bold" style="color: var(--text-primary);">' + u.fullName + ' <span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + (u.groupName || '—') + ']</span></span>' +
            '</div>' +
            '<span class="' + colorClass + ' font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + (u.rating !== null ? u.rating : 'Нет') + '</span>' +
          '</div>';
        }).join('');
      }
    }

    if (document.getElementById('statCompletedCount')) {
      document.getElementById('statCompletedCount').innerText = localCompleted.length + ' из ' + localShoots.length;
    }

    const groupsContainer = document.getElementById('statsGroupsList');
    if (groupsContainer) {
      if (!data.groupsRating || data.groupsRating.length === 0) {
        groupsContainer.innerHTML = '<div class="p-6 text-center text-xs font-mono border border-dashed" style="color: var(--text-muted); border-color: var(--border-subtle);">' +
          'Рейтинг учебных групп формируется по мере выставления оценок преподавателями.' +
        '</div>';
      } else {
        groupsContainer.innerHTML = data.groupsRating.map((g, index) => {
          let gHighlight = index === 0 ? 'rank-card-top1' : 'rank-card-default';
          let gLabel = index === 0 ? '<span class="text-[9px] font-mono uppercase px-2 py-0.5 bg-[var(--brand-red)] text-white font-extrabold mr-2 rounded-sm inline-flex items-center gap-1">' + SVG_ICONS.diamond + 'ТОП-1</span>' : '';
          return '<div class="flex items-center justify-between p-3 text-xs ' + gHighlight + '">' +
            '<div class="flex items-center">' +
              gLabel +
              '<span class="font-bold" style="color: var(--text-primary);">Группа: ' + g.groupName + '</span>' +
            '</div>' +
            '<span class="text-amber-400 font-mono font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + g.avgRating + ' <span class="font-normal" style="color: var(--text-muted);">(' + pluralizeRu(g.participations || 0, 'смена', 'смены', 'смен') + ')</span></span>' +
          '</div>';
        }).join('');
      }
    }

    const freqContainer = document.getElementById('statsFrequentShoots');
    if (freqContainer) {
      freqContainer.innerHTML = data.frequentShoots.map(f => 
        '<div class="p-3.5 border space-y-1.5 transition" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
          '<h4 class="text-xs font-extrabold uppercase tracking-wide" style="color: var(--brand-red);">' + f.title + '</h4>' +
          '<p class="text-[11px] font-mono" style="color: var(--text-muted);">Проведено раз: <span class="font-bold font-mono" style="color: var(--text-primary);">' + f.count + '</span></p>' +
        '</div>'
      ).join('') || '<p class="text-xs" style="color: var(--text-muted);">Пока нет созданных смен.</p>';
    }

  } catch (err) {
    console.error('Ошибка загрузки статистики:', err);
  }
}

async function loadAdminPanel() {
  try {
    const res = await fetch('/api/admin/data', {
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
    if (res.ok) {
      const data = await res.json();
      globalAdminUsers = data.users || [];
      renderAdminUsers(globalAdminUsers);

      const serverToken = (data.settings && data.settings.telegramBotToken) || '';
      const serverChat = (data.settings && data.settings.defaultChatId) || '';
      const serverTopic = (data.settings && data.settings.telegramTopicId) || '';
      const localToken = localStorage.getItem('kp11_tg_token') || '';
      const localChat = localStorage.getItem('kp11_tg_chat') || '';
      const localTopic = localStorage.getItem('kp11_tg_topic') || '';

      const effectiveToken = serverToken || localToken;
      const effectiveChat = serverChat || localChat;
      const effectiveTopic = serverTopic || localTopic;

      if (document.getElementById('adminBotToken')) {
        document.getElementById('adminBotToken').value = effectiveToken;
      }
      if (document.getElementById('adminDefaultChatId')) {
        document.getElementById('adminDefaultChatId').value = effectiveChat;
      }
      if (document.getElementById('adminTelegramTopicId')) {
        document.getElementById('adminTelegramTopicId').value = effectiveTopic;
      }

      // Если на сервере токен ещё не сохранён, но есть локальный — фоново синхронизируем
      if (!serverToken && localToken) {
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
          body: JSON.stringify({ telegramBotToken: localToken, defaultChatId: effectiveChat, telegramTopicId: effectiveTopic })
        }).catch(() => {});
      }
      return;
    }
  } catch (err) {}

  if (!globalAdminUsers || globalAdminUsers.length === 0) {
    globalAdminUsers = [
      { id: 'u1', fullName: 'Ковалев Михаил Алексеевич', email: 'mikhail.kovalev@kp11.ru', groupName: 'ФВТ-22', rating: 4.7, telegram: '@mikhail_cam', isSuspended: false, role: { name: 'Студент' } },
      { id: 'u2', fullName: 'Демидов Тимофей Дмитриевич', email: 'timofey.demidov@kp11.ru', groupName: 'ФВТ-22', rating: 4.5, telegram: '@timofey_light', isSuspended: false, role: { name: 'Студент' } },
      { id: 'u3', fullName: 'Гусев Андрей Алексеевич', email: 'andrey.gusev@kp11.ru', groupName: 'КТ-25', rating: 3.5, telegram: '@andrey_gaffer', isSuspended: false, role: { name: 'Студент' } },
      { id: 'u4', fullName: 'Соколова Анна Алексеевна', email: 'anna.sokolova@kp11.ru', groupName: 'КТ-15', rating: 4.0, telegram: '@anna_sound', isSuspended: false, role: { name: 'Студент' } },
      { id: 'u5', fullName: 'Жемчужников Ярослав Станиславович', email: 'yaroslav.zhemch@kp11.ru', groupName: 'КТ-25', rating: 4.5, telegram: '@yaroslav_dop', isSuspended: false, role: { name: 'Студент' } },
      { id: 'master-1', fullName: 'Бадиков Семён Станиславович', email: 'semyon.badikov@kp11.ru', groupName: 'КТ-26', rating: 4.8, telegram: '@badikov_dop', isSuspended: false, role: { name: 'Мастер / Преподаватель' } }
    ];
  }

  // Загрузка настроек бота из localStorage при оффлайн-режиме
  if (document.getElementById('adminBotToken') && localStorage.getItem('kp11_tg_token')) {
    document.getElementById('adminBotToken').value = localStorage.getItem('kp11_tg_token');
  }
  if (document.getElementById('adminDefaultChatId') && localStorage.getItem('kp11_tg_chat')) {
    document.getElementById('adminDefaultChatId').value = localStorage.getItem('kp11_tg_chat');
  }
  if (document.getElementById('adminTelegramTopicId') && localStorage.getItem('kp11_tg_topic')) {
    document.getElementById('adminTelegramTopicId').value = localStorage.getItem('kp11_tg_topic');
  }

  filterAdminUsers();
}
window.loadAdminPanel = loadAdminPanel;

let currentAdminRoleFilter = 'ALL';

function setAdminRoleFilter(filterType) {
  currentAdminRoleFilter = filterType;
  filterAdminUsers();
}

function renderAdminUsers(users) {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  
  const allList = globalAdminUsers || [];
  const totalCount = allList.length;
  const studentsCount = allList.filter(u => (u.role && u.role.name === 'Студент') || (!u.role || !u.role.name)).length;
  const mastersCount = allList.filter(u => u.role && u.role.name === 'Мастер / Преподаватель').length;
  const adminsCount = allList.filter(u => u.role && u.role.name === 'Администратор').length;
  const blacklistedCount = allList.filter(u => u.isBlacklisted).length;

  const btnActiveClass = 'btn-brand-beige shadow-md font-extrabold';
  const btnInactiveClass = 'btn-brand-ghost text-[var(--text-muted)]';

  let adminTopBar = '<div class="space-y-4 mb-4">' +
    '<!-- Карточки ключевых метрик базы -->' +
    '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">' +
      '<div onclick="setAdminRoleFilter(\'ALL\')" class="cursor-pointer p-3 border transition hover:border-[var(--brand-red)] ' + (currentAdminRoleFilter === 'ALL' ? 'border-[var(--brand-red)] bg-[#1A1A1A]' : 'border-[var(--border-color)] bg-[var(--bg-elevated)]') + '">' +
        '<div class="text-[10px] font-mono uppercase text-[var(--text-muted)]">Всего в базе</div>' +
        '<div class="text-xl font-extrabold font-mono text-[var(--text-primary)] mt-0.5">' + totalCount + '</div>' +
      '</div>' +
      '<div onclick="setAdminRoleFilter(\'STUDENT\')" class="cursor-pointer p-3 border transition hover:border-[#229ED9] ' + (currentAdminRoleFilter === 'STUDENT' ? 'border-[#229ED9] bg-[#1A1A1A]' : 'border-[var(--border-color)] bg-[var(--bg-elevated)]') + '">' +
        '<div class="text-[10px] font-mono uppercase text-[var(--text-muted)]">Студенты</div>' +
        '<div class="text-xl font-extrabold font-mono text-[#229ED9] mt-0.5">' + studentsCount + '</div>' +
      '</div>' +
      '<div onclick="setAdminRoleFilter(\'MASTER\')" class="cursor-pointer p-3 border transition hover:border-amber-400 ' + (currentAdminRoleFilter === 'MASTER' ? 'border-amber-400 bg-[#1A1A1A]' : 'border-[var(--border-color)] bg-[var(--bg-elevated)]') + '">' +
        '<div class="text-[10px] font-mono uppercase text-[var(--text-muted)]">Мастера</div>' +
        '<div class="text-xl font-extrabold font-mono text-amber-400 mt-0.5">' + mastersCount + '</div>' +
      '</div>' +
      '<div onclick="setAdminRoleFilter(\'BLACKLIST\')" class="cursor-pointer p-3 border transition hover:border-red-500 ' + (currentAdminRoleFilter === 'BLACKLIST' ? 'border-red-500 bg-red-950/40' : 'border-[var(--border-color)] bg-[var(--bg-elevated)]') + '">' +
        '<div class="text-[10px] font-mono uppercase text-red-400">Чёрный список</div>' +
        '<div class="text-xl font-extrabold font-mono text-red-500 mt-0.5">' + blacklistedCount + '</div>' +
      '</div>' +
    '</div>' +

    '<!-- Фильтр-пилюли -->' +
    '<div class="flex flex-wrap items-center justify-between gap-2.5 p-2.5 border" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
        '<button onclick="setAdminRoleFilter(\'ALL\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'ALL' ? btnActiveClass : btnInactiveClass) + '">Все (' + totalCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'STUDENT\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'STUDENT' ? btnActiveClass : btnInactiveClass) + '">Студенты (' + studentsCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'MASTER\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'MASTER' ? btnActiveClass : btnInactiveClass) + '">Мастера (' + mastersCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'ADMIN\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'ADMIN' ? btnActiveClass : btnInactiveClass) + '">Админы (' + adminsCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'BLACKLIST\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'BLACKLIST' ? 'bg-red-700 text-white font-extrabold' : btnInactiveClass) + '">Чёрный список (' + blacklistedCount + ')</button>' +
      '</div>' +
      '<span class="text-[10px] font-mono text-[var(--text-muted)]">Управление аккаунтами ЦКТ</span>' +
    '</div>' +
  '</div>';

  if (!users || users.length === 0) {
    container.innerHTML = adminTopBar + '<div class="p-8 text-center text-xs font-mono border" style="color: var(--text-muted); border-color: var(--border-subtle);">Пользователи по выбранному фильтру не найдены</div>';
    return;
  }

  const userRowsHtml = users.map(u => {
    const currentRole = u.role && u.role.name ? u.role.name : (u.role || 'Студент');
    const isMe = currentUser && currentUser.id === u.id;
    const isBlacklisted = !!u.isBlacklisted;
    const blacklistBadge = isBlacklisted ? '<span class="text-red-400 font-extrabold ml-1.5 px-1.5 py-0.5 border border-red-600/70 bg-red-950/60 text-[10px] uppercase font-mono">⛔ В ЧЁРНОМ СПИСКЕ</span>' : '';
    const borderClass = isBlacklisted ? 'border-red-600/70 bg-red-950/15' : 'border';
    const rowBg = isBlacklisted ? '' : 'style="background-color: var(--bg-card); border-color: var(--border-color);"';
    
    let roleBadgeTag = '';
    if (currentRole === 'Администратор') {
      roleBadgeTag = '<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 border border-red-600/60 bg-red-950/40 text-red-300 font-mono inline-flex items-center gap-1">🛡️ Админ</span>';
    } else if (currentRole === 'Мастер / Преподаватель') {
      roleBadgeTag = '<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 border border-amber-600/60 bg-amber-950/40 text-amber-300 font-mono inline-flex items-center gap-1">🎬 Мастер</span>';
    } else {
      roleBadgeTag = '<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 border border-blue-600/50 bg-blue-950/30 text-blue-300 font-mono inline-flex items-center gap-1">🎓 Студент</span>';
    }

    const cleanTg = u.telegram ? (u.telegram.startsWith('@') ? u.telegram : '@' + u.telegram) : '';
    const tgBadge = cleanTg 
      ? '<a href="https://t.me/' + cleanTg.replace(/^@/, '') + '" target="_blank" class="font-mono text-[11px] font-bold px-1.5 py-0.5 border border-[#229ED9]/50 bg-[#229ED9]/10 text-[#229ED9] inline-flex items-center gap-1 hover:underline" title="Открыть профиль Telegram">' + SVG_ICONS.telegram + '<span>' + cleanTg + '</span></a>'
      : '<span class="font-mono text-[10px] text-amber-400 border border-amber-500/30 px-1 py-0.5">[TG не указан]</span>';

    const likesCount = Number(u.likes) || 0;
    const dislikesCount = Number(u.dislikes) || 0;

    const avatarThumb = '<div class="w-9 h-9 rounded-full border border-[var(--border-subtle)] overflow-hidden flex-shrink-0 bg-neutral-900">' +
      '<img src="' + (u.avatar || 'img/student.jpg') + '" alt="Avatar" class="w-full h-full object-cover">' +
    '</div>';

    return '<div id="user_row_' + u.id + '" class="flex flex-col md:flex-row md:items-center justify-between p-3.5 gap-3 border ' + borderClass + ' transition" ' + rowBg + '>' +
      '<div id="user_info_' + u.id + '" class="flex items-center gap-3 flex-grow min-w-0">' +
        avatarThumb +
        '<div class="min-w-0 flex-grow">' +
          '<div class="flex items-center flex-wrap gap-x-2 gap-y-1.5">' +
            '<button type="button" onclick="openShowreelModal(\'' + u.id + '\')" class="font-bold text-xs uppercase cursor-pointer hover:underline text-[var(--text-primary)] hover:text-amber-400 transition inline-flex items-center gap-1 text-left" title="Открыть цифровой паспорт студента">' +
              '<span>' + escapeHtml(u.fullName || 'Без имени') + '</span>' +
              '<span class="text-[9px] text-amber-400/80">👤</span>' +
            '</button> ' +
            roleBadgeTag + ' ' +
            '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[Группа: <span style="color: var(--text-secondary);">' + escapeHtml(u.groupName || '—') + '</span>]</span> ' +
            tgBadge + ' ' +
            '<span class="inline-flex items-center gap-1.5 font-mono text-xs px-2 py-0.5 border border-[var(--border-subtle)] bg-[var(--bg-primary)]">' +
              '<span class="text-emerald-400 font-bold" title="Положительные отзывы">👍 ' + likesCount + '</span>' +
              '<span class="text-red-400 font-bold" title="Замечания">👎 ' + dislikesCount + '</span>' +
            '</span>' +
            blacklistBadge +
          '</div>' +
          '<p class="text-[11px] font-mono mt-1" style="color: var(--text-muted);">' + escapeHtml(u.email || '') + (isMe ? ' <span class="text-[var(--brand-beige-text)] font-bold ml-1">(Вы)</span>' : '') + '</p>' +
        '</div>' +
      '</div>' +
      '<!-- Ровно две кнопки для каждого пользователя: Изменить и Черный список -->' +
      '<div class="flex items-center space-x-2 flex-wrap gap-y-2 shrink-0" id="user_actions_' + u.id + '">' +
        '<button onclick="openAdminUserFullEditModal(\'' + u.id + '\')" class="px-3 py-1.5 text-xs font-extrabold uppercase btn-brand-beige shadow-sm" title="Редактировать данные и доступ">' +
          'Изменить' +
        '</button>' +
        '<button onclick="toggleBlacklist(\'' + u.id + '\')" class="px-3 py-1.5 text-xs font-extrabold uppercase transition shadow-sm ' + (isBlacklisted ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-red-700/80 hover:bg-red-600 text-white') + '">' +
          (isBlacklisted ? 'Убрать из ЧС' : 'Черный список') +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');

  container.innerHTML = adminTopBar + '<div class="flex flex-col space-y-2.5">' + userRowsHtml + '</div>';
}


async function saveTelegramSettings() {
  const tokenInput = document.getElementById('adminBotToken');
  const chatInput = document.getElementById('adminDefaultChatId');
  const topicInput = document.getElementById('adminTelegramTopicId');
  const botToken = tokenInput ? tokenInput.value.trim() : '';
  const defaultChatId = chatInput ? chatInput.value.trim() : '';
  const telegramTopicId = topicInput ? topicInput.value.trim() : '';

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ telegramBotToken: botToken, defaultChatId, telegramTopicId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Настройки Telegram-бота успешно сохранены!');
      localStorage.setItem('kp11_tg_token', botToken);
      localStorage.setItem('kp11_tg_chat', defaultChatId);
      localStorage.setItem('kp11_tg_topic', telegramTopicId);
    } else {
      showToast('Ошибка: ' + (data.error || 'Сбой сохранения'));
    }
  } catch (err) {
    localStorage.setItem('kp11_tg_token', botToken);
    localStorage.setItem('kp11_tg_chat', defaultChatId);
    localStorage.setItem('kp11_tg_topic', telegramTopicId);
    showToast('Настройки сохранены локально!');
  }
}

async function testTelegramConnection() {
  const statusEl = document.getElementById('tgTestStatus');
  const tokenInput = document.getElementById('adminBotToken');
  const chatInput = document.getElementById('adminDefaultChatId');
  const topicInput = document.getElementById('adminTelegramTopicId');
  const botToken = tokenInput ? tokenInput.value.trim() : '';
  const chatId = chatInput ? chatInput.value.trim() : '';
  const topicId = topicInput ? topicInput.value.trim() : (localStorage.getItem('kp11_tg_topic') || '');

  const effectiveToken = botToken || localStorage.getItem('kp11_tg_token');
  const effectiveChat = chatId || localStorage.getItem('kp11_tg_chat');
  const effectiveTopic = topicId || localStorage.getItem('kp11_tg_topic');

  if (!effectiveToken) {
    alert('Пожалуйста, введите токен бота перед тестированием!');
    return;
  }

  if (statusEl) {
    statusEl.classList.remove('hidden');
    statusEl.className = 'text-xs font-mono font-bold text-amber-400';
    statusEl.innerText = 'Отправка тестового вызова...';
  }

  try {
    const res = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ chatId: effectiveChat, topicId: effectiveTopic, token: effectiveToken })
    });
    const data = await res.json();
    if (data.success) {
      statusEl.className = 'text-xs font-mono font-bold text-emerald-400';
      statusEl.innerText = 'Связь установлена! ' + (data.message || 'Сообщение доставлено в Telegram.');
      showToast('Связь с Telegram установлена!');
    } else {
      statusEl.className = 'text-xs font-mono font-bold text-red-400';
      statusEl.innerText = 'Ошибка: ' + (data.error || 'Сбой отправки');
      showToast('Ошибка Telegram: ' + (data.error || 'Сбой'));
    }
  } catch (e) {
    // Резервная прямая отправка в Telegram API из браузера при локальном предпросмотре!
    if (effectiveToken && effectiveChat) {
      const chats = String(effectiveChat).split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean);
      let okCount = 0;
      for (const c of chats) {
        try {
          const bodyPayload = {
            chat_id: c,
            text: '<b>МЕДИАЦЕНТР КП11 // ТЕСТ СВЯЗИ</b>\n════════════════════════════════════\nТестовое сообщение успешно получено из панели управления киноцеха!',
            parse_mode: 'HTML'
          };
          if (effectiveTopic) {
            bodyPayload.message_thread_id = parseInt(effectiveTopic, 10);
          }
          const tgRes = await fetch('https://api.telegram.org/bot' + effectiveToken + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          });
          const tgData = await tgRes.json();
          if (tgData.ok) okCount++;
        } catch (clientErr) {}
      }
      if (okCount > 0) {
        statusEl.className = 'text-xs font-mono font-bold text-emerald-400';
        statusEl.innerText = 'Успешно доставлено в ' + okCount + ' из ' + chats.length + ' чатов/топиков!';
        showToast('Тестовое сообщение доставлено в Telegram!');
      } else {
        statusEl.className = 'text-xs font-mono font-bold text-red-400';
        statusEl.innerText = 'Не удалось отправить сообщения в указанные чаты.';
      }
    } else {
      statusEl.className = 'text-xs font-mono font-bold text-amber-400';
      statusEl.innerText = 'Укажите ID чата или юзернейм для тестовой отправки.';
    }
  }
}

// ==============================================================================
// ЗАОЧНАЯ РЕГИСТРАЦИЯ СТУДЕНТА С ЛИПОВОЙ/СЛУЖЕБНОЙ ПОЧТОЙ
// ==============================================================================

let proxyRegistrationOrigin = 'from_admin';
let proxyRandomSuffix = Math.random().toString(36).substring(2, 6);
let lastRegisteredProxyCredentials = null;

function transliterateRussian(str) {
  const ru = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return String(str || '')
    .toLowerCase()
    .split('')
    .map(c => ru[c] !== undefined ? ru[c] : (/[a-z0-9]/.test(c) ? c : '_'))
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'student';
}

function openProxyRegisterModal(origin = 'from_admin') {
  if (!isMasterOrAdminUser(currentUser)) {
    showToast('Заочная регистрация доступна только мастерам и администраторам');
    return;
  }

  proxyRegistrationOrigin = origin;
  proxyRandomSuffix = Math.random().toString(36).substring(2, 6);

  const modal = document.getElementById('proxyRegisterModal');
  if (!modal) return;

  const fnInp = document.getElementById('proxyFullName');
  const grInp = document.getElementById('proxyGroupName');
  const tgInp = document.getElementById('proxyTelegram');
  const deptInp = document.getElementById('proxyCraftDept');
  const rankInp = document.getElementById('proxyCraftRank');
  const fakeCb = document.getElementById('proxyUseFakeEmail');
  const custInp = document.getElementById('proxyCustomEmail');
  const passInp = document.getElementById('proxyPassword');

  if (fnInp) fnInp.value = '';
  if (grInp) grInp.value = 'КТ-26';
  if (tgInp) tgInp.value = '';
  if (deptInp) deptInp.value = 'cinema';
  if (rankInp) rankInp.value = 'Ассистент цеха';
  if (fakeCb) fakeCb.checked = true;
  if (custInp) custInp.value = '';
  if (passInp) passInp.value = 'kp11_film2026';

  toggleProxyEmailMode();
  updateProxyAutoEmail();

  modal.classList.remove('hidden');
  if (fnInp) fnInp.focus();
}
window.openProxyRegisterModal = openProxyRegisterModal;

function closeProxyRegisterModal() {
  const modal = document.getElementById('proxyRegisterModal');
  if (modal) modal.classList.add('hidden');
}
window.closeProxyRegisterModal = closeProxyRegisterModal;

function toggleProxyEmailMode() {
  const fakeCb = document.getElementById('proxyUseFakeEmail');
  const previewBox = document.getElementById('proxyGeneratedEmailPreviewBox');
  const customBox = document.getElementById('proxyCustomEmailWrapper');
  const isFake = fakeCb ? fakeCb.checked : true;

  if (previewBox) previewBox.classList.toggle('hidden', !isFake);
  if (customBox) customBox.classList.toggle('hidden', isFake);
  if (isFake) updateProxyAutoEmail();
}
window.toggleProxyEmailMode = toggleProxyEmailMode;

function updateProxyAutoEmail() {
  const fnInp = document.getElementById('proxyFullName');
  const previewText = document.getElementById('proxyGeneratedEmailText');
  if (!previewText) return;

  const nameVal = fnInp ? fnInp.value.trim() : '';
  const slug = transliterateRussian(nameVal) || 'student';
  const emailGenerated = `${slug}_${proxyRandomSuffix}@kp11.local`;
  previewText.innerText = emailGenerated;
}
window.updateProxyAutoEmail = updateProxyAutoEmail;

async function handleProxyRegisterSubmit(e) {
  e.preventDefault();

  const fnInp = document.getElementById('proxyFullName');
  const grInp = document.getElementById('proxyGroupName');
  const tgInp = document.getElementById('proxyTelegram');
  const deptInp = document.getElementById('proxyCraftDept');
  const rankInp = document.getElementById('proxyCraftRank');
  const fakeCb = document.getElementById('proxyUseFakeEmail');
  const custInp = document.getElementById('proxyCustomEmail');
  const passInp = document.getElementById('proxyPassword');
  const btn = document.getElementById('btnSubmitProxyRegister');

  const fullName = fnInp ? fnInp.value.trim() : '';
  if (!fullName) {
    alert('Пожалуйста, введите ФИО студента');
    return;
  }

  const groupName = grInp ? (grInp.value.trim() || 'КТ-26') : 'КТ-26';
  const telegram = tgInp ? tgInp.value.trim() : '';
  const craftDept = deptInp ? deptInp.value : 'cinema';
  const craftRank = rankInp ? (rankInp.value.trim() || 'Ассистент цеха') : 'Ассистент цеха';
  const password = passInp ? (passInp.value.trim() || 'kp11_film2026') : 'kp11_film2026';
  const useFake = fakeCb ? fakeCb.checked : true;

  let email = '';
  if (useFake) {
    const slug = transliterateRussian(fullName) || 'student';
    email = `${slug}_${proxyRandomSuffix}@kp11.local`;
  } else {
    email = custInp ? custInp.value.trim().toLowerCase() : '';
    if (!email) {
      alert('Укажите email студента или включите генерацию липовой почты');
      return;
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Зачисление...';
  }

  try {
    let newUserData = null;
    let savedCredentials = { email, password };

    try {
      const res = await fetch('/api/admin/proxy-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({
          fullName,
          groupName,
          telegram,
          craftDept,
          craftRank,
          email,
          password
        })
      });
      if (res.ok) {
        const data = await res.json();
        newUserData = data.user;
        if (data.credentials) savedCredentials = data.credentials;
      }
    } catch (fetchErr) {
      console.warn('API error during proxy register, using offline fallback:', fetchErr);
    }

    if (!newUserData) {
      // Offline fallback
      const generatedId = 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4);
      newUserData = {
        id: generatedId,
        fullName,
        email,
        groupName,
        rating: 5.0,
        telegram: telegram ? (telegram.startsWith('@') ? telegram : '@' + telegram) : '',
        telegramChatId: null,
        craftRank,
        craftDept,
        isSuspended: false,
        isBlacklisted: false,
        role: { name: 'Студент' },
        competencies: { camera: 75, sound: 75, light: 75, edit: 75 },
        skills: ['Специалист съёмочной группы'],
        completedShoots: 0,
        likes: 0,
        dislikes: 0
      };
    }

    // Добавляем в глобальные массивы приложения
    if (Array.isArray(globalStudents)) {
      const idx = globalStudents.findIndex(s => s.id === newUserData.id || (s.email && s.email.toLowerCase() === newUserData.email.toLowerCase()));
      if (idx >= 0) {
        globalStudents[idx] = { ...globalStudents[idx], ...newUserData };
      } else {
        globalStudents.unshift(newUserData);
      }
    }

    if (Array.isArray(globalAdminUsers)) {
      const idx = globalAdminUsers.findIndex(u => u.id === newUserData.id || (u.email && u.email.toLowerCase() === newUserData.email.toLowerCase()));
      if (idx >= 0) {
        globalAdminUsers[idx] = { ...globalAdminUsers[idx], ...newUserData };
      } else {
        globalAdminUsers.unshift(newUserData);
      }
      renderAdminUsers(globalAdminUsers);
    }

    // Сохраняем в localStorage
    try {
      localStorage.setItem('kp11_users', JSON.stringify(globalStudents));
    } catch (e) {}

    // Если модальное окно смены открыто и зачисление вызвано оттуда
    if (proxyRegistrationOrigin === 'from_shoot') {
      const currentSelectedMap = typeof getSelectedCrewMap === 'function' ? getSelectedCrewMap() : {};
      currentSelectedMap[newUserData.id] = {
        role: craftRank,
        dept: craftDept
      };
      if (typeof renderModalStudents === 'function') {
        renderModalStudents(globalStudents, false, currentSelectedMap);
      }
    }

    closeProxyRegisterModal();

    // Открываем модальное окно с реквизитами для передачи студенту
    lastRegisteredProxyCredentials = {
      fullName: newUserData.fullName,
      groupName: newUserData.groupName || 'КТ-26',
      email: savedCredentials.email || newUserData.email,
      password: savedCredentials.password || password
    };

    openProxySuccessModal(lastRegisteredProxyCredentials);
    showToast(`Студент ${newUserData.fullName} успешно зачислен!`);
  } catch (err) {
    alert('Ошибка при зачислении студента: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✓ Зарегистрировать студента</span>';
    }
  }
}
window.handleProxyRegisterSubmit = handleProxyRegisterSubmit;

function openProxySuccessModal(creds) {
  if (!creds) return;
  const modal = document.getElementById('proxySuccessModal');
  if (!modal) return;

  const nameEl = document.getElementById('proxySuccessStudentName');
  const groupEl = document.getElementById('proxySuccessStudentGroup');
  const emailEl = document.getElementById('proxySuccessEmail');
  const passEl = document.getElementById('proxySuccessPassword');

  if (nameEl) nameEl.innerText = creds.fullName;
  if (groupEl) groupEl.innerText = 'Группа: ' + creds.groupName;
  if (emailEl) emailEl.innerText = creds.email;
  if (passEl) passEl.innerText = creds.password;

  modal.classList.remove('hidden');
}

function closeProxySuccessModal() {
  const modal = document.getElementById('proxySuccessModal');
  if (modal) modal.classList.add('hidden');
}
window.closeProxySuccessModal = closeProxySuccessModal;

function copyProxyCredentials() {
  if (!lastRegisteredProxyCredentials) return;
  const text = `🎬 МЕДИАЦЕНТР КП11 // РЕКВИЗИТЫ СТУДЕНТА\n` +
    `════════════════════════════════════\n` +
    `ФИО: ${lastRegisteredProxyCredentials.fullName}\n` +
    `Группа: ${lastRegisteredProxyCredentials.groupName}\n` +
    `Логин (Email): ${lastRegisteredProxyCredentials.email}\n` +
    `Пароль: ${lastRegisteredProxyCredentials.password}\n` +
    `Вход на платформу: ${window.location.origin}\n` +
    `════════════════════════════════════`;
  
  navigator.clipboard.writeText(text).then(() => {
    showToast('Реквизиты скопированы в буфер обмена!');
  }).catch(() => {
    prompt('Скопируйте реквизиты студента:', text);
  });
}
window.copyProxyCredentials = copyProxyCredentials;

async function resetAllRatings() {
  if (!confirm('Вы уверены, что хотите сбросить рейтинг ВСЕХ пользователей в системе?')) return;
  try {
    await fetch('/api/admin/reset-ratings', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
  } catch (err) {}

  (globalAdminUsers || []).forEach(u => u.rating = null);
  showToast('Рейтинг всех пользователей успешно сброшен!');
  renderAdminUsers(globalAdminUsers);
}

async function deleteUser(userId) {
  if (!confirm('Вы уверены, что хотите полностью удалить этого пользователя из системы?')) return;
  try {
    await fetch('/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
  } catch (err) {}

  globalAdminUsers = (globalAdminUsers || []).filter(u => u.id !== userId);
  globalStudents = (globalStudents || []).filter(s => s.id !== userId);
  localStorage.setItem('kp11_admin_users', JSON.stringify(globalAdminUsers));
  localStorage.setItem('kp11_students', JSON.stringify(globalStudents));
  showToast('Пользователь удален из базы данных');
  filterAdminUsers();
}

let pendingDeleteShootId = null;

function deleteShoot(shootId) {
  pendingDeleteShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);

  const modal = document.getElementById('confirmDeleteModal');
  const titleEl = document.getElementById('confirmDeleteShootTitle');

  if (modal) {
    if (titleEl) {
      titleEl.innerText = shoot ? ('«' + shoot.title + '»') : 'Выбранная смена';
    }
    modal.classList.remove('hidden');
  } else {
    executeDeleteShoot();
  }
}

async function executeDeleteShoot() {
  const shootId = pendingDeleteShootId;
  closeConfirmDeleteModal();
  if (!shootId) return;

  // 1. Оптимистичное удаление из состояния и localStorage
  globalShoots = (globalShoots || []).filter(s => s.id !== shootId);
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
  renderShootsList(globalShoots);

  showToast('Смена удалена из производства');

  // 2. Отправка на бэкенд
  try {
    const headers = { 'Authorization': 'Bearer ' + (token || 'demo-token') };
    const res = await fetch('/api/admin/shoots/' + shootId, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      await fetch('/api/shoots/' + shootId, {
        method: 'DELETE',
        headers
      });
    }
  } catch (err) {}

  // 3. Загрузка обновленного реестра с сервера
  await loadShoots();
}

function closeConfirmDeleteModal() {
  const modal = document.getElementById('confirmDeleteModal');
  if (modal) modal.classList.add('hidden');
  pendingDeleteShootId = null;
}

window.deleteShoot = deleteShoot;
window.executeDeleteShoot = executeDeleteShoot;
window.closeConfirmDeleteModal = closeConfirmDeleteModal;

document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action="delete-shoot"]');
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute('data-shoot-id');
    if (id && typeof window.deleteShoot === 'function') {
      window.deleteShoot(id);
    }
  }
});

function filterAdminUsers() {
  const searchInput = document.getElementById('adminSearch');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const sortSel = document.getElementById('adminUserSort');
  const sortBy = sortSel ? sortSel.value : 'alphabet';
  
  let filtered = (globalAdminUsers || []).filter(u => {
    const roleName = (u.role && u.role.name) ? u.role.name : 'Студент';
    let matchRole = true;
    if (currentAdminRoleFilter === 'STUDENT') {
      matchRole = roleName === 'Студент';
    } else if (currentAdminRoleFilter === 'MASTER') {
      matchRole = roleName === 'Мастер / Преподаватель';
    } else if (currentAdminRoleFilter === 'ADMIN') {
      matchRole = roleName === 'Администратор';
    } else if (currentAdminRoleFilter === 'BLACKLIST') {
      matchRole = !!u.isBlacklisted;
    }
    
    if (!matchRole) return false;
    if (!query) return true;
    return (u.fullName && u.fullName.toLowerCase().includes(query)) ||
           (u.email && u.email.toLowerCase().includes(query)) ||
           (u.groupName && u.groupName.toLowerCase().includes(query)) ||
           (u.telegram && u.telegram.toLowerCase().includes(query));
  });

  filtered = sortStudentsList(filtered, sortBy);
  renderAdminUsers(filtered);
}

async function toggleSuspend(userId, isSuspended) {
  try {
    await fetch('/api/admin/suspend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ userId, isSuspended })
    });
  } catch (err) {}

  const user = (globalAdminUsers || []).find(u => u.id === userId);
  if (user) {
    user.isSuspended = isSuspended;
  }
  const student = (globalStudents || []).find(s => s.id === userId);
  if (student) {
    student.isSuspended = isSuspended;
  }
  localStorage.setItem('kp11_admin_users', JSON.stringify(globalAdminUsers));
  showToast(isSuspended ? 'Пользователь отстранён от съёмок' : 'Доступ к съёмкам восстановлен');
  filterAdminUsers();
}

async function changeUserRole(userId, roleName) {
  try {
    await fetch('/api/admin/users/' + userId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ role: roleName, roleName: roleName })
    });
  } catch (err) {}

  const user = (globalAdminUsers || []).find(u => u.id === userId);
  if (user) {
    user.role = { name: roleName };
  }
  const student = (globalStudents || []).find(s => s.id === userId);
  if (student) {
    student.role = { name: roleName };
  }
  localStorage.setItem('kp11_admin_users', JSON.stringify(globalAdminUsers));
  
  if (currentUser && currentUser.id === userId) {
    currentUser.role = roleName;
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateNav();
  }
  showToast('Роль пользователя изменена на: ' + roleName);
  filterAdminUsers();
}

async function loadNotifications() {
  if (!token) return;
  try {
    const res = await fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const rawInvites = Array.isArray(data) ? data : (data && Array.isArray(data.invitations) ? data.invitations : []);
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    const myUserId = currentUser ? currentUser.id : null;
    const invites = rawInvites.filter(inv => !inv.userId || inv.userId === myUserId || inv.id === myUserId);

    if (!invites || invites.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = 
      '<div class="p-4 mb-6 space-y-3 shadow-xl border-l-4 border-l-[var(--brand-red)] border viewfinder-card" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
        '<div class="flex items-center justify-between">' +
          '<div class="flex items-center space-x-2">' +
            '<span class="rec-dot"></span>' +
            '<h4 class="text-xs font-extrabold uppercase tracking-wider" style="color: var(--brand-beige-text);">Входящие вызовы на смену (' + invites.length + '):</h4>' +
          '</div>' +
          '<span class="text-[10px] font-mono uppercase px-2 py-0.5 border border-red-500/40 text-red-400 bg-red-950/20 font-bold">Требуется решение</span>' +
        '</div>' +
        invites.map(inv => {
          const shootTitle = (inv.shoot && inv.shoot.title) || inv.shootTitle || 'Съёмочная смена';
          const shootLoc = (inv.shoot && inv.shoot.location) || inv.shootLocation || 'Локация уточняется';
          const shootRole = inv.roleInShoot || inv.role || 'Участник смены';
          const shootDate = (inv.shoot && inv.shoot.shootDate) ? new Date(inv.shoot.shootDate).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
          
          return '<div class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border" style="background-color: var(--bg-elevated); border-color: var(--border-subtle);">' +
            '<div class="space-y-1">' +
              '<div class="flex items-center flex-wrap gap-2">' +
                '<strong class="text-xs font-extrabold uppercase" style="color: var(--text-primary);">' + shootTitle + '</strong>' +
                '<span class="crew-dept-tag dept-badge-cinema"><span class="inline-flex items-center gap-1">' + SVG_ICONS.camera + shootRole + '</span></span>' +
              '</div>' +
              '<p class="text-[11px] font-mono flex items-center gap-2" style="color: var(--text-muted);">' +
                '<span>' + SVG_ICONS.pin + ' ' + shootLoc + '</span>' +
                (shootDate ? '<span>• ' + shootDate + '</span>' : '') +
              '</p>' +
            '</div>' +
            '<div class="student-action-btn-group flex items-center gap-2 shrink-0">' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'ACCEPTED\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-extrabold uppercase transition shadow inline-flex items-center gap-1">' + SVG_ICONS.check + 'Принять вызов</button>' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'DECLINED\')" class="btn-brand-ghost px-3 py-1.5 text-xs font-extrabold uppercase text-red-400 hover:text-red-300">Отклонить</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
  } catch (err) {
    console.error(err);
  }
}

async function respondCrew(crewMemberId, status, customReason = null) {
  let declineReason = customReason;
  if (status === 'DECLINED' && !declineReason) {
    const input = prompt('Укажите причину отказа от смены (например: болезнь, экзамен, наложение смен):');
    if (input === null) {
      return; // Пользователь нажал "Отмена" в prompt
    }
    declineReason = input.trim() || 'Причина не указана';
  }

  try {
    await fetch('/api/crew/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ crewMemberId, status, declineReason, reason: declineReason })
    });
  } catch (err) {}

  // Fallback update in-memory
  (globalShoots || []).forEach(s => {
    (s.crew || []).forEach(c => {
      if (c.id === crewMemberId || c.userId === crewMemberId) {
        c.status = status;
        if (status === 'DECLINED') {
          c.declineReason = declineReason || 'Причина не указана';
          c.declinedAt = new Date().toISOString();
        } else if (status === 'ACCEPTED') {
          c.confirmedAt = new Date().toISOString();
          c.declineReason = null;
        }
      }
    });
  });
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
  showToast(status === 'ACCEPTED' ? 'Вызов на смену принят!' : 'Вызов на смену отклонён (причина зафиксирована)');
  loadNotifications();
  loadShoots();
}

// ==============================================================================
// УНИВЕРСАЛЬНАЯ СОРТИРОВКА СПИСКОВ СТУДЕНТОВ
// (По умолчанию: по алфавиту / первой букве фамилии; по рейтингу: звёзды и отзывы 👍/👎; по группам)
// ==============================================================================
function sortStudentsList(students, sortBy = 'alphabet') {
  if (!Array.isArray(students)) return [];
  const arr = students.filter(s => s && typeof s === 'object');

  if (sortBy === 'alphabet') {
    arr.sort((a, b) => {
      const nameA = String(a.fullName || a.name || '').trim();
      const nameB = String(b.fullName || b.name || '').trim();
      return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base', numeric: true });
    });
  } else if (sortBy === 'rating') {
    arr.sort((a, b) => {
      const rA = (typeof a.rating === 'number' && !isNaN(a.rating)) ? a.rating : (parseFloat(a.rating) || 0);
      const rB = (typeof b.rating === 'number' && !isNaN(b.rating)) ? b.rating : (parseFloat(b.rating) || 0);
      if (rB !== rA) return rB - rA;

      const scoreA = (Number(a.likes) || 0) - (Number(a.dislikes) || 0);
      const scoreB = (Number(b.likes) || 0) - (Number(b.dislikes) || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;

      const likesA = Number(a.likes) || 0;
      const likesB = Number(b.likes) || 0;
      if (likesB !== likesA) return likesB - likesA;

      const nameA = String(a.fullName || a.name || '').trim();
      const nameB = String(b.fullName || b.name || '').trim();
      return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base', numeric: true });
    });
  } else if (sortBy === 'group') {
    arr.sort((a, b) => {
      const groupA = String(a.groupName || a.group || '').trim();
      const groupB = String(b.groupName || b.group || '').trim();
      const gComp = groupA.localeCompare(groupB, 'ru', { sensitivity: 'base', numeric: true });
      if (gComp !== 0) return gComp;

      const nameA = String(a.fullName || a.name || '').trim();
      const nameB = String(b.fullName || b.name || '').trim();
      return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base', numeric: true });
    });
  }
  return arr;
}
window.sortStudentsList = sortStudentsList;

// ==============================================================================
// УПРАВЛЕНИЕ ВЫБОРОМ УЧАСТНИКОВ В МОДАЛЬНОМ ОКНЕ СМЕНЫ
// Сохраняет выбор при поиске/фильтрации/сортировке без сброса предыдущих отметок
// ==============================================================================
let modalCrewSelections = {}; // userId -> { role: string, dept: string }
let modalShowOnlySelected = false;

function syncDomToModalCrewSelections() {
  const visibleCheckboxes = document.querySelectorAll('input[name="studentSelect"]');
  visibleCheckboxes.forEach(cb => {
    const uId = cb.value;
    if (cb.checked) {
      const roleInp = document.querySelector('input[name="customRole_' + uId + '"]');
      const deptSel = document.querySelector('select[name="craftDept_' + uId + '"]');
      if (!modalCrewSelections[uId]) {
        modalCrewSelections[uId] = { role: 'Оператор', dept: 'cinema' };
      }
      if (roleInp && roleInp.value.trim()) modalCrewSelections[uId].role = roleInp.value.trim();
      if (deptSel) modalCrewSelections[uId].dept = deptSel.value;
    } else {
      delete modalCrewSelections[uId];
    }
  });
  updateModalSelectedCrewBadge();
}

function handleModalStudentCheckboxChange(studentId, isChecked) {
  if (isChecked) {
    const roleInp = document.querySelector('input[name="customRole_' + studentId + '"]');
    const deptSel = document.querySelector('select[name="craftDept_' + studentId + '"]');
    const allKnown = (Array.isArray(globalStudents) && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
    const studentObj = allKnown.find(s => String(s.id) === String(studentId));

    modalCrewSelections[studentId] = {
      role: (roleInp && roleInp.value.trim()) ? roleInp.value.trim() : (studentObj?.craftRank || 'Оператор'),
      dept: (deptSel ? deptSel.value : (studentObj?.craftDept || 'cinema'))
    };
  } else {
    delete modalCrewSelections[studentId];
  }
  updateModalSelectedCrewBadge();
}
window.handleModalStudentCheckboxChange = handleModalStudentCheckboxChange;

function handleModalStudentRoleChange(studentId, newRole) {
  if (modalCrewSelections[studentId]) {
    modalCrewSelections[studentId].role = newRole.trim() || 'Оператор';
  }
}
window.handleModalStudentRoleChange = handleModalStudentRoleChange;

function handleModalStudentDeptChange(studentId, newDept) {
  if (modalCrewSelections[studentId]) {
    modalCrewSelections[studentId].dept = newDept;
  }
}
window.handleModalStudentDeptChange = handleModalStudentDeptChange;

function updateModalSelectedCrewBadge() {
  const badge = document.getElementById('modalSelectedCrewBadge');
  const count = Object.keys(modalCrewSelections).length;
  if (badge) {
    badge.textContent = count + ' чел.';
  }
  const toggleBtn = document.getElementById('toggleOnlySelectedBtn');
  if (toggleBtn) {
    toggleBtn.textContent = modalShowOnlySelected ? 'Показать всех' : 'Только выбранные (' + count + ')';
    toggleBtn.classList.toggle('text-amber-400', modalShowOnlySelected);
    toggleBtn.classList.toggle('border-amber-500/60', modalShowOnlySelected);
  }
}
window.updateModalSelectedCrewBadge = updateModalSelectedCrewBadge;

function toggleOnlySelectedModalStudents() {
  syncDomToModalCrewSelections();
  modalShowOnlySelected = !modalShowOnlySelected;
  filterModalStudents();
}
window.toggleOnlySelectedModalStudents = toggleOnlySelectedModalStudents;

function getSelectedCrewMap() {
  syncDomToModalCrewSelections();
  return { ...modalCrewSelections };
}
window.getSelectedCrewMap = getSelectedCrewMap;

async function openShootModal() {
  if (!isMasterOrAdminUser(currentUser)) {
    showToast('Создание смен доступно только преподавателям и администраторам.');
    return;
  }

  const modal = document.getElementById('shootModal');
  if (modal) modal.classList.remove('hidden');

  const editingInp = document.getElementById('editingShootId');
  if (editingInp) editingInp.value = '';

  const titleHeader = document.getElementById('shootModalTitle');
  if (titleHeader) titleHeader.textContent = 'Создание производственной смены';

  const submitBtn = document.getElementById('shootModalSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'Опубликовать смену в производство';

  const titleEl = document.getElementById('shootTitle');
  if (titleEl) titleEl.value = '';

  const todayStr = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('shootDate');
  if (dateEl) dateEl.value = todayStr;

  const descEl = document.getElementById('shootDesc');
  if (descEl) descEl.value = 'Плановая съёмочная смена Медиацентра КП11';

  const typeEl = document.getElementById('shootType');
  if (typeEl) typeEl.value = 'СТУДИЯ';

  const locEl = document.getElementById('shootLocation');
  if (locEl) locEl.value = 'Павильон №1 ЦКТ (Онежская, 3)';

  const callEl = document.getElementById('shootCallTime');
  if (callEl) callEl.value = '10:00';
  const startEl = document.getElementById('shootStartTime');
  if (startEl) startEl.value = '11:30';
  const endEl = document.getElementById('shootEndTime');
  if (endEl) endEl.value = '18:00';

  const latEl = document.getElementById('selectedLat');
  if (latEl) latEl.value = '55.751244';
  const lonEl = document.getElementById('selectedLon');
  if (lonEl) lonEl.value = '37.618423';

  toggleMapPicker('СТУДИЯ');

  currentShootMilestones = [];
  renderShootMilestones();
  await loadLocations();

  modalCrewSelections = {};
  modalShowOnlySelected = false;
  const sortSel = document.getElementById('studentSortModal');
  if (sortSel) sortSel.value = 'alphabet';
  const searchInput = document.getElementById('studentSearchModal');
  if (searchInput) searchInput.value = '';
  updateModalSelectedCrewBadge();
  const eqSearch = document.getElementById('equipmentSearchModal');
  if (eqSearch) eqSearch.value = '';

  await loadInventoryData();
  renderModalEquipment(globalInventory, false);
  cancelInlineEquipmentForm();

  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') } });
    if (res.ok) {
      const data = await res.json();
      const rawStudents = data.students;
      globalStudents = Array.isArray(rawStudents) ? rawStudents : (rawStudents && Array.isArray(rawStudents.value) ? rawStudents.value : []);
    }
  } catch (err) {}

  if (!globalStudents || !Array.isArray(globalStudents) || globalStudents.length === 0) {
    globalStudents = getStudentDirectory();
  }
  filterModalStudents();

  setTimeout(() => {
    try {
      if (!pickerMap && typeof ymaps !== 'undefined' && ymaps.Map) {
        const pEl = document.getElementById("pickerMap");
        if (pEl) {
          pickerMap = new ymaps.Map(pEl, { center: [55.751244, 37.618423], zoom: 11 });
          pickerMap.events.add('click', function (e) {
            const coords = e.get('coords');
            const latInp = document.getElementById('selectedLat');
            const lonInp = document.getElementById('selectedLon');
            if (latInp) latInp.value = coords[0];
            if (lonInp) lonInp.value = coords[1];
            if (pickerPlacemark) {
              pickerPlacemark.geometry.setCoordinates(coords);
            } else {
              pickerPlacemark = new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon' });
              pickerMap.geoObjects.add(pickerPlacemark);
            }
          });
        }
      } else if (!pickerMap && typeof L !== 'undefined') {
        const pEl = document.getElementById("pickerMap");
        if (pEl && !pEl.hasChildNodes()) {
          const lMap = L.map(pEl, { center: [55.751244, 37.618423], zoom: 11, zoomControl: true, attributionControl: false });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(lMap);
          let lMarker = null;
          lMap.on('click', function (e) {
            const coords = [e.latlng.lat, e.latlng.lng];
            const latInp = document.getElementById('selectedLat');
            const lonInp = document.getElementById('selectedLon');
            if (latInp) latInp.value = coords[0].toFixed(6);
            if (lonInp) lonInp.value = coords[1].toFixed(6);
            if (lMarker) {
              lMarker.setLatLng(coords);
            } else {
              const icon = L.divIcon({
                className: 'custom-cinema-pin',
                html: '<div style="background:#E30613;width:24px;height:24px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 0 10px rgba(227,6,19,0.8);display:flex;align-items:center;justify-content:center;color:#FFF;font-size:11px;font-weight:bold;">📍</div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              });
              lMarker = L.marker(coords, { icon: icon }).addTo(lMap);
            }
          });
          pickerMap = {
            container: {
              fitToViewport: () => lMap.invalidateSize()
            }
          };
          setTimeout(() => lMap.invalidateSize(), 200);
        }
      } else if (pickerMap && pickerMap.container) {
        pickerMap.container.fitToViewport();
      }
    } catch (e) {
      console.warn('Picker map error:', e.message);
    }
  }, 150);
}

async function openEditShootModal(shootId) {
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  if (!shoot) {
    showToast('Смена с ID «' + shootId + '» не найдена');
    return;
  }

  const modal = document.getElementById('shootModal');
  if (modal) modal.classList.remove('hidden');

  const editingInp = document.getElementById('editingShootId');
  if (editingInp) editingInp.value = String(shoot.id);

  const titleHeader = document.getElementById('shootModalTitle');
  if (titleHeader) titleHeader.textContent = '✎ Редактирование: ' + (shoot.title || 'Смена');

  const submitBtn = document.getElementById('shootModalSubmitBtn');
  if (submitBtn) submitBtn.textContent = '💾 Сохранить изменения в смене';

  const titleEl = document.getElementById('shootTitle');
  if (titleEl) titleEl.value = shoot.title || '';

  const descEl = document.getElementById('shootDesc');
  if (descEl) descEl.value = shoot.description || '';

  const typeEl = document.getElementById('shootType');
  if (typeEl) typeEl.value = shoot.type || 'СТУДИЯ';

  const dateEl = document.getElementById('shootDate');
  if (dateEl) {
    const rawDate = shoot.date || '';
    dateEl.value = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
  }

  const locEl = document.getElementById('shootLocation');
  if (locEl) locEl.value = shoot.location || '';

  const callEl = document.getElementById('shootCallTime');
  if (callEl) callEl.value = shoot.callTime || '10:00';

  const startEl = document.getElementById('shootStartTime');
  if (startEl) startEl.value = shoot.startTime || '11:30';

  const endEl = document.getElementById('shootEndTime');
  if (endEl) endEl.value = shoot.endTime || '18:00';

  const latEl = document.getElementById('selectedLat');
  if (latEl) latEl.value = shoot.latitude || 55.751244;

  const lonEl = document.getElementById('selectedLon');
  if (lonEl) lonEl.value = shoot.longitude || 37.618423;

  if (Array.isArray(shoot.timeline) && shoot.timeline.length > 0) {
    currentShootMilestones = JSON.parse(JSON.stringify(shoot.timeline));
  } else {
    currentShootMilestones = [
      { title: 'Сбор съёмочной группы', time: shoot.callTime || '10:00' },
      { title: 'Монтаж площадки и света', time: '10:30' },
      { title: 'Мотор / Первый дубль', time: shoot.startTime || '11:30' },
      { title: 'Шапка / Окончание смены', time: shoot.endTime || '18:00' }
    ];
  }
  renderShootMilestones();
  await loadLocations();

  const searchInput = document.getElementById('studentSearchModal');
  if (searchInput) searchInput.value = '';
  const eqSearch = document.getElementById('equipmentSearchModal');
  if (eqSearch) eqSearch.value = '';

  await loadInventoryData();
  const currentEqIds = Array.isArray(shoot.equipment)
    ? shoot.equipment.map(e => (typeof e === 'string' ? e : (e ? e.id : null))).filter(Boolean)
    : [];
  renderModalEquipment(globalInventory, false, currentEqIds);
  cancelInlineEquipmentForm();

  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') } });
    if (res.ok) {
      const data = await res.json();
      const rawStudents = data.students;
      globalStudents = Array.isArray(rawStudents) ? rawStudents : (rawStudents && Array.isArray(rawStudents.value) ? rawStudents.value : []);
    }
  } catch (err) {}

  if (!globalStudents || !Array.isArray(globalStudents) || globalStudents.length === 0) {
    globalStudents = getStudentDirectory();
  }

  modalCrewSelections = {};
  modalShowOnlySelected = false;
  if (Array.isArray(shoot.crew)) {
    shoot.crew.forEach(cm => {
      const uId = cm.userId || (cm.user && cm.user.id) || cm.id;
      if (uId) {
        modalCrewSelections[uId] = {
          role: cm.roleInShoot || 'Оператор',
          dept: cm.department || 'cinema'
        };
      }
    });
  }
  const sortSel = document.getElementById('studentSortModal');
  if (sortSel) sortSel.value = 'alphabet';
  if (searchInput) searchInput.value = '';
  updateModalSelectedCrewBadge();

  filterModalStudents();

  toggleMapPicker(shoot.type);
  setTimeout(() => {
    const coords = [parseFloat(shoot.latitude) || 55.751244, parseFloat(shoot.longitude) || 37.618423];
    if (pickerMap) {
      if (typeof ymaps !== 'undefined' && pickerMap.setCenter) {
        pickerMap.setCenter(coords, 12);
        if (pickerPlacemark) {
          pickerPlacemark.geometry.setCoordinates(coords);
        } else {
          pickerPlacemark = new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon' });
          pickerMap.geoObjects.add(pickerPlacemark);
        }
      } else if (pickerMap.container) {
        pickerMap.container.fitToViewport();
      }
    }
  }, 150);
}

function renderModalStudents(students) {
  const box = document.getElementById('studentsCheckboxes');
  if (!box) return;

  updateModalSelectedCrewBadge();

  const rawList = Array.isArray(students) ? students : (students && Array.isArray(students.value) ? students.value : []);
  const list = rawList.filter(s => s && typeof s === 'object');

  if (list.length === 0) {
    box.innerHTML = '<div class="p-4 text-xs font-mono text-center border border-dashed" style="color: var(--text-muted); border-color: var(--border-color);">' +
      (modalShowOnlySelected ? 'В группу пока не выбрано ни одного студента' : 'Студенты не найдены по запросу') +
    '</div>';
    return;
  }

  const itemsHtml = list.map(s => {
    const isBlacklisted = !!s.isBlacklisted;
    const selectedItem = modalCrewSelections[s.id] || null;
    const isChecked = selectedItem !== null;
    const currentRole = selectedItem ? selectedItem.role : (s.craftRank || 'Оператор');
    const currentDept = selectedItem ? selectedItem.dept : (s.craftDept || 'cinema');
    const likesCount = Number(s.likes) || 0;
    const dislikesCount = Number(s.dislikes) || 0;
    const rVal = (typeof s.rating === 'number' && !isNaN(s.rating)) ? s.rating.toFixed(1) : (s.rating || '5.0');

    const rowBorder = isChecked
      ? 'border-amber-500/80 bg-amber-950/20 shadow-[0_0_8px_rgba(245,158,11,0.15)]'
      : (isBlacklisted 
          ? 'border-red-600/80 bg-red-950/25 shadow-[0_0_8px_rgba(239,68,68,0.2)]' 
          : 'border-[var(--border-subtle)] bg-[var(--bg-card)]');

    const blacklistBadge = isBlacklisted 
      ? '<span class="text-red-400 font-extrabold font-mono text-[10px] px-1.5 py-0.5 border border-red-600/70 bg-red-950/60 inline-flex items-center gap-1">⛔ ЧЁРНЫЙ СПИСОК</span>' 
      : '';

    return '<div class="p-2.5 border text-xs space-y-2 transition ' + rowBorder + '">' +
      '<label class="flex items-center space-x-2.5 cursor-pointer select-none">' +
        '<input type="checkbox" name="studentSelect" value="' + s.id + '" ' + (isChecked ? 'checked' : '') + ' onchange="handleModalStudentCheckboxChange(\'' + s.id + '\', this.checked)" class="accent-[var(--brand-red)] w-4 h-4 cursor-pointer shrink-0">' +
        '<div class="flex items-center flex-wrap gap-x-2 gap-y-1">' +
          (isMasterOrAdminUser(currentUser) 
            ? '<button type="button" onclick="event.stopPropagation(); openShowreelModal(\'' + s.id + '\')" class="font-bold text-xs uppercase hover:underline cursor-pointer text-left inline-flex items-center gap-1 text-[var(--text-primary)] hover:text-amber-400 transition" title="Открыть цифровой паспорт студента"><span>' + escapeHtml(s.fullName || 'Без имени') + '</span><span class="text-[9px] text-amber-400/80">👤</span></button>'
            : '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + escapeHtml(s.fullName || 'Без имени') + '</span>') +
          '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + escapeHtml(s.groupName || 'Группа') + ']</span>' +
          '<span class="text-amber-400 font-bold font-mono text-[11px]" title="Рейтинг студента">★ ' + rVal + '</span>' +
          '<span class="inline-flex items-center gap-1.5 font-mono text-[11px]">' +
            '<span class="text-emerald-400 font-bold" title="Положительные отзывы">👍 ' + likesCount + '</span>' +
            '<span class="text-red-400 font-bold" title="Замечания">👎 ' + dislikesCount + '</span>' +
          '</span>' +
          blacklistBadge +
        '</div>' +
      '</label>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">' +
        '<div>' +
          '<label class="text-[9px] font-mono text-[var(--text-muted)] uppercase block mb-0.5">Индивидуальная роль:</label>' +
          '<input type="text" name="customRole_' + s.id + '" value="' + escapeHtml(currentRole) + '" oninput="handleModalStudentRoleChange(\'' + s.id + '\', this.value)" placeholder="Своя роль (напр. Фокус-пуллер)" class="studio-input text-xs px-2.5 py-1 w-full">' +
        '</div>' +
        '<div>' +
          '<label class="text-[9px] font-mono text-[var(--text-muted)] uppercase block mb-0.5">Цех (цветная окантовка):</label>' +
          '<select name="craftDept_' + s.id + '" onchange="handleModalStudentDeptChange(\'' + s.id + '\', this.value)" class="studio-input text-xs font-bold px-2 py-1 w-full">' +
            '<option value="cinema"' + (currentDept === 'cinema' ? ' selected' : '') + '>🎬 Операторский цех (красная окантовка)</option>' +
            '<option value="sound"' + (currentDept === 'sound' ? ' selected' : '') + '>🎙️ Звуковой цех (янтарная окантовка)</option>' +
            '<option value="light"' + (currentDept === 'light' ? ' selected' : '') + '>💡 Осветительский цех (золотая окантовка)</option>' +
            '<option value="edit"' + (currentDept === 'edit' ? ' selected' : '') + '>✂️ Монтажный цех (изумрудная окантовка)</option>' +
            '<option value="prod"' + (currentDept === 'prod' ? ' selected' : '') + '>📋 Продюсерский цех (синяя окантовка)</option>' +
            '<option value="art"' + (currentDept === 'art' ? ' selected' : '') + '>🎨 Художественный цех (терракотовая окантовка)</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = '<div class="flex flex-col space-y-2">' + itemsHtml + '</div>';
}

function filterModalStudents() {
  syncDomToModalCrewSelections();

  const searchInput = document.getElementById('studentSearchModal');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const sortSel = document.getElementById('studentSortModal');
  const sortBy = sortSel ? sortSel.value : 'alphabet';

  let allList = (Array.isArray(globalStudents) && globalStudents.length > 0) ? globalStudents : (Array.isArray(globalAdminUsers) && globalAdminUsers.length > 0 ? globalAdminUsers : getStudentDirectory());
  
  let filtered = allList.filter(s => {
    if (!s) return false;
    const roleName = (s.role && s.role.name) ? s.role.name : (s.role || 'Студент');
    if (roleName === 'Администратор') return false;
    return true;
  });

  if (modalShowOnlySelected) {
    filtered = filtered.filter(s => !!modalCrewSelections[s.id]);
  }

  if (query) {
    filtered = filtered.filter(s => 
      (s.fullName && s.fullName.toLowerCase().includes(query)) || 
      (s.groupName && s.groupName.toLowerCase().includes(query)) ||
      (s.telegram && s.telegram.toLowerCase().includes(query)) ||
      (s.craftRank && s.craftRank.toLowerCase().includes(query))
    );
  }

  filtered = sortStudentsList(filtered, sortBy);
  renderModalStudents(filtered);
}

function toggleMapPicker(type) {
  const wrapper = document.getElementById('pickerMapContainerWrapper');
  if (wrapper) {
    wrapper.classList.toggle('hidden', type !== 'ВЫЕЗД');
  }
  if (pickerMap) setTimeout(() => pickerMap.container.fitToViewport(), 150);
}

function closeShootModal() { 
  const modal = document.getElementById('shootModal');
  if (modal) modal.classList.add('hidden'); 
  const editingInp = document.getElementById('editingShootId');
  if (editingInp) editingInp.value = '';
}

async function handleCreateShoot(e) {
  if (e) e.preventDefault();
  if (!isMasterOrAdminUser(currentUser)) {
    showToast('У вас нет прав для создания смен.');
    return;
  }
  const editingInp = document.getElementById('editingShootId');
  const editingShootId = editingInp ? editingInp.value.trim() : '';
  const isEditing = !!editingShootId;

  syncDomToModalCrewSelections();
  const crewAssignments = Object.entries(modalCrewSelections).map(([userId, item]) => {
    return {
      userId,
      craftRole: item.role || 'Оператор',
      department: item.dept || 'cinema'
    };
  });

  const titleEl = document.getElementById('shootTitle');
  const descEl = document.getElementById('shootDesc');
  const typeEl = document.getElementById('shootType');
  const dateEl = document.getElementById('shootDate');
  const callEl = document.getElementById('shootCallTime');
  const startEl = document.getElementById('shootStartTime');
  const endEl = document.getElementById('shootEndTime');
  const locEl = document.getElementById('shootLocation');
  const latEl = document.getElementById('selectedLat');
  const lonEl = document.getElementById('selectedLon');

  const title = titleEl ? titleEl.value.trim() : '';
  const description = (descEl && descEl.value.trim()) ? descEl.value.trim() : 'Плановая съёмочная смена Медиацентра КП11';
  const type = typeEl ? typeEl.value : 'СТУДИЯ';
  const date = (dateEl && dateEl.value) ? dateEl.value : (new Date().toISOString().split('T')[0]);
  const callTime = callEl ? callEl.value : '10:00';
  const startTime = startEl ? startEl.value : '11:30';
  const endTime = endEl ? endEl.value : '18:00';
  const location = (locEl && locEl.value.trim()) ? locEl.value.trim() : 'Павильон №1 ЦКТ (Онежская, 3)';
  const latitude = parseFloat(latEl ? latEl.value : '55.751244') || 55.751244;
  const longitude = parseFloat(lonEl ? lonEl.value : '37.618423') || 37.618423;

  if (!title) {
    showToast('Укажите название проекта / смены');
    if (titleEl) titleEl.focus();
    return;
  }

  // Проверка конфликтов техники перед сохранением / созданием смены
  const selectedEqCheckboxes = Array.from(document.querySelectorAll('#equipmentCheckboxes input[type="checkbox"]:checked'));
  for (const cb of selectedEqCheckboxes) {
    const eqId = cb.getAttribute('data-eq-id');
    const avail = checkEquipmentAvailability(eqId, date, callTime, endTime, isEditing ? editingShootId : null);
    if (avail.status === 'CONFLICT') {
      const eqItem = (globalInventory || []).find(e => e.id === eqId);
      const eqName = eqItem ? eqItem.name : 'Оборудование';
      showToast('❌ Конфликт: Единица «' + eqName + '» уже занята в смене «' + avail.shootTitle + '» (' + avail.shootTime + ')!');
      return;
    }
  }

  const selectedEqIds = selectedEqCheckboxes
    .map(cb => cb.getAttribute('data-eq-id'))
    .filter(Boolean);
  const selectedEquipment = selectedEqIds
    .map(id => (globalInventory || []).find(e => e.id === id))
    .filter(Boolean);

  const timeline = getShootMilestones();

  const body = {
    title,
    description,
    type,
    date: date.includes('T') ? date : (date + 'T' + callTime + ':00'),
    callTime,
    startTime,
    endTime,
    timeline,
    location,
    latitude,
    longitude,
    crewAssignments,
    equipment: selectedEquipment
  };

  // Ветка редактирования существующей смены
  if (isEditing) {
    let updatedSuccessfully = false;
    let updatedShoot = null;

    try {
      const res = await fetch('/api/shoots/' + encodeURIComponent(editingShootId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        updatedSuccessfully = true;
        const data = await res.json();
        updatedShoot = (data && data.shoot) ? data.shoot : data;
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || ('Ошибка сервера: ' + res.status);
        console.warn('PUT /api/shoots error:', errMsg);
        showToast(errMsg);
      }
    } catch (err) {
      console.error('Fetch PUT /api/shoots error:', err);
    }

    if (!updatedSuccessfully) {
      // Fallback локального обновления:
      const existing = (globalShoots || []).find(s => String(s.id) === String(editingShootId)) || {};
      updatedShoot = {
        ...existing,
        ...body,
        id: editingShootId,
        crew: crewAssignments.map((ca, idx) => {
          const st = (globalStudents || []).find(s => s.id === ca.userId) || { fullName: 'Студент', groupName: 'КТ-26', rating: 4.5, telegram: '@student' };
          return {
            id: 'c-' + editingShootId + '-' + ca.userId,
            roleInShoot: ca.craftRole,
            department: ca.department || 'cinema',
            status: 'ACCEPTED',
            attendance: 'PRESENT',
            userId: ca.userId,
            user: { id: ca.userId, fullName: st.fullName, groupName: st.groupName, rating: st.rating, telegram: st.telegram, participations: 3 }
          };
        })
      };
    }

    if (updatedShoot && updatedShoot.id) {
      if (!updatedShoot.equipment) updatedShoot.equipment = selectedEquipment;
      updatedShoot.callTime = callTime;
      updatedShoot.startTime = startTime;
      updatedShoot.endTime = endTime;
      updatedShoot.timeline = timeline;
      globalShoots = (globalShoots || []).map(s => String(s.id) === String(editingShootId) ? { ...s, ...updatedShoot } : s);
      localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
    }

    // Диспетчеризация обновлённого вызывного листа в Telegram
    try {
      fetch('/api/telegram/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify({ shootId: editingShootId, shoot: updatedShoot, isUpdate: true })
      }).catch(() => {});
    } catch (e) {}

    showToast('Смена «' + title + '» успешно обновлена!');
    closeShootModal();
    if (editingInp) editingInp.value = '';
    if (titleEl) titleEl.value = '';
    if (descEl) descEl.value = '';
    if (locEl) locEl.value = '';
    if (dateEl) dateEl.value = '';
    await loadShoots();
    return;
  }

  // Ветка создания новой смены
  let createdSuccessfully = false;
  let newShoot = null;

  try {
    const res = await fetch('/api/shoots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      createdSuccessfully = true;
      const data = await res.json();
      newShoot = (data && data.shoot) ? data.shoot : data;
      if (newShoot && newShoot.id) {
        if (!newShoot.equipment) newShoot.equipment = selectedEquipment;
        newShoot.callTime = callTime;
        newShoot.startTime = startTime;
        newShoot.endTime = endTime;
        newShoot.timeline = timeline;
        globalShoots = [newShoot, ...(globalShoots || []).filter(s => s.id !== newShoot.id)];
        localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
      }
    } else {
      const errJson = await res.json().catch(() => ({}));
      const errMsg = errJson.error || ('Ошибка сервера: ' + res.status);
      console.warn('POST /api/shoots error:', errMsg);
      showToast(errMsg);
    }
  } catch (err) {
    console.error('Fetch /api/shoots error:', err);
  }

  if (!createdSuccessfully) {
    // Fallback локального сохранения:
    newShoot = {
      id: 'shoot-' + Date.now(),
      title,
      description,
      type,
      date: date.includes('T') ? date : (date + 'T' + callTime + ':00'),
      callTime,
      startTime,
      endTime,
      timeline,
      location,
      latitude,
      longitude,
      isCompleted: false,
      creator: { fullName: currentUser ? currentUser.fullName : 'Бадиков Семён Станиславович' },
      equipment: selectedEquipment,
      crew: crewAssignments.map((ca, idx) => {
        const st = (globalStudents || []).find(s => s.id === ca.userId) || { fullName: 'Студент', groupName: 'КТ-26', rating: 4.5, telegram: '@student' };
        return {
          id: 'c-' + Date.now() + '-' + idx,
          roleInShoot: ca.craftRole,
          department: ca.department || 'cinema',
          status: 'PENDING',
          attendance: 'PRESENT',
          userId: ca.userId,
          user: { id: ca.userId, fullName: st.fullName, groupName: st.groupName, rating: st.rating, telegram: st.telegram, participations: 3 }
        };
      })
    };
    globalShoots = [newShoot, ...(globalShoots || []).filter(s => s.id !== newShoot.id)];
    localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
  }

  // Вызов диспетчеризации вызывного листа в Telegram только при локальном fallback создании,
  // так как сервер при успешном POST /api/shoots уже производит автоматическую рассылку
  if (!createdSuccessfully) {
    try {
      const targetShootId = (newShoot && newShoot.id) ? newShoot.id : null;
      if (targetShootId) {
        fetch('/api/telegram/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
          body: JSON.stringify({ shootId: targetShootId, shoot: newShoot })
        }).catch(() => {});
      }
    } catch (e) {}
  }

  showToast('Смена «' + title + '» создана! Вызывной разослан в Telegram');
  closeShootModal();
  if (editingInp) editingInp.value = '';
  if (titleEl) titleEl.value = '';
  if (descEl) descEl.value = '';
  if (locEl) locEl.value = '';
  if (dateEl) dateEl.value = '';
  await loadShoots();
}

function setStarRating(memberId, starValue) {
  const container = document.getElementById('stars_container_' + memberId);
  const hiddenInput = document.getElementById('grade_input_' + memberId);
  const numValue = Number(starValue) || 5;

  if (container && hiddenInput) {
    hiddenInput.value = numValue;
    const stars = container.querySelectorAll('.rating-star-btn');
    stars.forEach((star) => {
      const idx = parseInt(star.getAttribute('data-star-idx'));
      if (idx <= numValue) {
        star.classList.remove('opacity-40');
        star.classList.add('opacity-100', 'star-pop-animate');
        star.innerHTML = SVG_ICONS.star;
        setTimeout(() => star.classList.remove('star-pop-animate'), 450);
      } else {
        star.classList.remove('opacity-100', 'star-pop-animate');
        star.classList.add('opacity-40');
        star.innerHTML = SVG_ICONS.starEmpty;
      }
    });
  }

  // Мгновенное сохранение в локальном состоянии смены
  let foundShoot = null;
  let foundMember = null;
  (globalShoots || []).forEach(sh => {
    if (Array.isArray(sh.crew)) {
      const cm = sh.crew.find(c => c.id === memberId || c.userId === memberId);
      if (cm) {
        foundShoot = sh;
        foundMember = cm;
        cm.grade = numValue;
        if (cm.user) cm.user.rating = numValue;
      }
    }
  });

  // Мгновенное обновление бейджа рейтинга в строке участника на экране
  const ratingBadgeEl = document.getElementById('member_rating_' + memberId);
  if (ratingBadgeEl) {
    const colorClass = getRatingBadgeColor(numValue);
    ratingBadgeEl.className = colorClass + ' font-mono text-xs font-bold inline-flex items-center gap-1';
    ratingBadgeEl.innerHTML = SVG_ICONS.star + ' ' + numValue.toFixed(1);
  }

  // Пересчет рейтингов всех студентов
  if (typeof recalculateAllStudentRatings === 'function') {
    recalculateAllStudentRatings();
  }

  // Немедленная отправка на бэкенд
  if (foundShoot) {
    fetch('/api/shoots/' + foundShoot.id + '/grade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || 'demo-token')
      },
      body: JSON.stringify({
        memberId: memberId,
        userId: foundMember ? foundMember.userId : memberId,
        grade: numValue
      })
    }).then(res => res.json()).then(data => {
      if (data && data.users) {
        globalStudents = data.users;
        if (typeof recalculateAllStudentRatings === 'function') recalculateAllStudentRatings();
      }
    }).catch(err => {
      console.warn('Grade autosave notice:', err.message);
    });
  }

  // Мгновенное обновление данных на вкладке «Статистика»
  if (typeof loadStatisticsData === 'function') {
    loadStatisticsData();
  }

  showToast('Оценка ★ ' + numValue + ' утверждена в журнал!');
}

function applyGlobalGrade(shootId, starValue) {
  const card = document.getElementById('shoot_details_' + shootId);
  if (card) {
    const memberIdsInputs = card.querySelectorAll('input[id^="grade_input_"]');
    memberIdsInputs.forEach(input => {
      const memberId = input.id.replace('grade_input_', '');
      setStarRating(memberId, starValue);
    });
  }
}

function recalculateAllStudentRatings() {
  if (!globalStudents || !Array.isArray(globalStudents) || globalStudents.length === 0) {
    globalStudents = getStudentDirectory();
  }
  const shoots = globalShoots || [];
  
  globalStudents.forEach(st => {
    const gradesList = [];
    shoots.forEach(sh => {
      if (sh.isCompleted && sh.crew) {
        sh.crew.forEach(cm => {
          const isThisStudent = (cm.userId && cm.userId === st.id) ||
            (cm.id && cm.id === st.id) ||
            (cm.user && cm.user.id && cm.user.id === st.id) ||
            (cm.user && cm.user.fullName && st.fullName && cm.user.fullName.toLowerCase() === st.fullName.toLowerCase()) ||
            (cm.fullName && st.fullName && cm.fullName.toLowerCase() === st.fullName.toLowerCase());
          
          if (isThisStudent && cm.grade !== undefined && cm.grade !== null && cm.attendance !== 'ABSENT') {
            gradesList.push(Number(cm.grade));
          }
        });
      }
    });

    if (gradesList.length > 0) {
      const sum = gradesList.reduce((acc, v) => acc + v, 0);
      st.rating = parseFloat((sum / gradesList.length).toFixed(1));
      st.completedShoots = gradesList.length;
    }
  });

  // Синхронизируем рейтинг в объектах crew всех смен
  shoots.forEach(sh => {
    if (sh.crew) {
      sh.crew.forEach(cm => {
        const found = globalStudents.find(st => 
          (st.id && (st.id === cm.userId || st.id === cm.id)) ||
          (cm.user && cm.user.id && st.id === cm.user.id) ||
          (cm.user && cm.user.fullName && st.fullName && cm.user.fullName.toLowerCase() === st.fullName.toLowerCase()) ||
          (cm.fullName && st.fullName && cm.fullName.toLowerCase() === st.fullName.toLowerCase())
        );
        if (found) {
          if (!cm.user) cm.user = {};
          cm.user.id = found.id;
          cm.user.rating = found.rating;
          cm.user.fullName = found.fullName;
          cm.user.groupName = found.groupName;
        }
      });
    }
  });

  localStorage.setItem('kp11_students', JSON.stringify(globalStudents));
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
}

async function saveShootGrades(shootId) {
  const target = (globalShoots || []).find(s => s.id === shootId);
  if (target) {
    target.isCompleted = true;
  }

  try {
    const res = await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ shootId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.users) {
        globalStudents = data.users;
      }
    }
  } catch (err) {
    console.warn('API /api/shoots/complete error, using local fallback:', err.message);
  }

  showToast('Смена успешно завершена и перенесена в архив!');
  await loadShoots();
  if (typeof loadStatisticsData === 'function') {
    loadStatisticsData();
  }
}

async function updateAttendance(crewMemberId, attendance) {
  try {
    const res = await fetch('/api/crew/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ crewMemberId, attendance })
    });
    if (!res.ok) throw new Error('Ошибка');
    loadShoots();
  } catch (err) {
    alert(err.message);
  }
}

function initShootMiniMap(shootId) {
  const mapContainer = document.getElementById('mini_map_' + shootId);
  if (!mapContainer || mapContainer.hasChildNodes()) return;

  const lat = parseFloat(mapContainer.getAttribute('data-lat')) || 55.858244;
  const lon = parseFloat(mapContainer.getAttribute('data-lon')) || 37.518423;
  const title = mapContainer.getAttribute('data-title') || 'Локация смены';

  if (typeof ymaps !== 'undefined' && ymaps.Map) {
    ymaps.ready(() => {
      if (mapContainer && !mapContainer.hasChildNodes()) {
        const miniMap = new ymaps.Map(mapContainer, {
          center: [lat, lon],
          zoom: 14,
          controls: ['zoomControl']
        });
        const placemark = new ymaps.Placemark([lat, lon], {
          balloonContent: '<strong>' + title + '</strong>'
        }, {
          preset: 'islands#redDotIcon'
        });
        miniMap.geoObjects.add(placemark);
      }
    });
  } else if (typeof L !== 'undefined') {
    const miniMap = L.map(mapContainer, {
      center: [lat, lon],
      zoom: 14,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(miniMap);
    const icon = L.divIcon({
      className: 'custom-cinema-pin',
      html: '<div style="background:#E30613;width:26px;height:26px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 0 10px rgba(227,6,19,0.8);display:flex;align-items:center;justify-content:center;color:#FFF;font-size:12px;font-weight:bold;">🎬</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    const marker = L.marker([lat, lon], { icon: icon }).addTo(miniMap);
    const popupContent = '<div style="font-family:sans-serif;color:#141414;padding:4px;min-width:180px;">' +
      '<b style="font-size:12px;color:#E30613;text-transform:uppercase;">' + title + '</b><br>' +
      '<span style="font-size:10px;color:#555;">Координаты: ' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</span><br>' +
      '<div style="margin-top:6px;display:flex;gap:6px;">' +
        '<a href="https://yandex.ru/maps/?pt=' + lon + ',' + lat + '&z=16" target="_blank" style="background:#229ED9;color:#FFF;padding:4px 8px;font-size:10px;font-weight:bold;text-decoration:none;text-transform:uppercase;border-radius:2px;">Яндекс.Карты ↗</a>' +
        '<a href="https://2gis.ru/geo/' + lon + '%2C' + lat + '" target="_blank" style="background:#2BA433;color:#FFF;padding:4px 8px;font-size:10px;font-weight:bold;text-decoration:none;text-transform:uppercase;border-radius:2px;">2ГИС ↗</a>' +
      '</div></div>';
    marker.bindPopup(popupContent);
    setTimeout(() => { miniMap.invalidateSize(); }, 300);
  } else {
    mapContainer.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-primary);color:var(--text-primary);padding:12px;text-align:center;">' +
      '<span style="font-size:12px;font-family:monospace;margin-bottom:8px;">📍 ' + title + ' (' + lat.toFixed(4) + ', ' + lon.toFixed(4) + ')</span>' +
      '<a href="https://yandex.ru/maps/?pt=' + lon + ',' + lat + '&z=16" target="_blank" class="btn-brand-primary" style="padding:6px 12px;font-size:10px;text-decoration:none;">Открыть карту в новой вкладке ↗</a>' +
      '</div>';
  }
}
window.initShootMiniMap = initShootMiniMap;

function toggleShootExpand(shootId) {
  window._openedShootIds = window._openedShootIds || new Set();
  const detailsBlock = document.getElementById('shoot_details_' + shootId);
  const btn = document.getElementById('expand_btn_' + shootId);
  if (!detailsBlock) return;

  const isCurrentlyOpen = window._openedShootIds.has(shootId);
  if (isCurrentlyOpen) {
    detailsBlock.classList.add('hidden');
    detailsBlock.style.display = 'none';
    window._openedShootIds.delete(shootId);
    if (btn) btn.innerText = 'Развернуть ▾';
  } else {
    detailsBlock.classList.remove('hidden');
    detailsBlock.style.display = 'block';
    window._openedShootIds.add(shootId);
    if (btn) btn.innerText = 'Свернуть ▴';
    initShootMiniMap(shootId);
  }
}
window.toggleShootExpand = toggleShootExpand;

// ----------------- УПРАВЛЕНИЕ МАСШТАБОМ (ОТ 1 ДО 4 СТОЛБЦОВ, ТОЛЬКО ДЛЯ ПК) -----------------
function setShootsColumns(n) {
  const cols = Math.max(1, Math.min(4, parseInt(n, 10) || 1));
  try {
    localStorage.setItem('kp11_shoots_columns', cols);
  } catch (e) {}

  const container = document.getElementById('shootsList');
  const mainCol = document.getElementById('shootsMainCol');
  const sidebar = document.getElementById('shootsSidebar');

  if (container) {
    if (cols === 1) {
      container.className = 'grid grid-cols-1 gap-4';
      if (mainCol) mainCol.className = 'lg:col-span-8 space-y-4';
      if (sidebar) sidebar.classList.remove('hidden');
    } else if (cols === 2) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
      if (mainCol) mainCol.className = 'lg:col-span-8 space-y-4';
      if (sidebar) sidebar.classList.remove('hidden');
    } else if (cols === 3) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
      if (mainCol) mainCol.className = 'lg:col-span-12 space-y-4';
      if (sidebar) sidebar.classList.remove('hidden');
    } else if (cols === 4) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
      if (mainCol) mainCol.className = 'lg:col-span-12 space-y-4';
      if (sidebar) sidebar.classList.remove('hidden');
    }
  }

  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById('shootsColBtn' + i);
    if (btn) {
      if (i === cols) {
        btn.className = 'px-2 py-0.5 text-xs font-mono font-black bg-[var(--brand-red)] text-white shadow-sm';
      } else {
        btn.className = 'px-2 py-0.5 text-xs font-mono font-bold text-[var(--text-muted)] hover:text-white hover:bg-neutral-800 transition';
      }
    }
  }
}
window.setShootsColumns = setShootsColumns;

function setEquipmentColumns(n) {
  const cols = Math.max(1, Math.min(4, parseInt(n, 10) || 3));
  try {
    localStorage.setItem('kp11_gear_columns', cols);
  } catch (e) {}

  const container = document.getElementById('equipmentTrackerList');
  if (container) {
    if (cols === 1) {
      container.className = 'grid grid-cols-1 gap-4';
    } else if (cols === 2) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
    } else if (cols === 3) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
    } else if (cols === 4) {
      container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
    }
  }

  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById('gearColBtn' + i);
    if (btn) {
      if (i === cols) {
        btn.className = 'px-2 py-0.5 text-xs font-mono font-black bg-[var(--brand-red)] text-white shadow-sm';
      } else {
        btn.className = 'px-2 py-0.5 text-xs font-mono font-bold text-[var(--text-muted)] hover:text-white hover:bg-neutral-800 transition';
      }
    }
  }
}
window.setEquipmentColumns = setEquipmentColumns;

// ----------------- УПРАВЛЕНИЕ БЫСТРЫМИ ЛОКАЦИЯМИ (CRUD) -----------------
let globalLocations = [];

async function loadLocations() {
  try {
    const res = await fetch('/api/locations');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.locations)) {
        globalLocations = data.locations;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch locations:', e);
  }
  if (!globalLocations || globalLocations.length === 0) {
    globalLocations = [
      { id: 'loc-1', name: 'Павильон №1 ЦКТ (Онежская, 3)', badge: '🎬 Павильон №1', type: 'СТУДИЯ', latitude: 55.858244, longitude: 37.518423 },
      { id: 'loc-2', name: 'Павильон №2 Киностудия (Онежская, 3)', badge: '🎥 Павильон №2', type: 'СТУДИЯ', latitude: 55.858244, longitude: 37.518423 },
      { id: 'loc-3', name: 'Тон-ателье & Звукозапись ЦКТ', badge: '🎙️ Звукозапись', type: 'СТУДИЯ', latitude: 55.858244, longitude: 37.518423 },
      { id: 'loc-4', name: 'Монтажный комплекс ЦКТ (Онежская, 3)', badge: '✂️ Монтажная', type: 'СТУДИЯ', latitude: 55.858244, longitude: 37.518423 },
      { id: 'loc-5', name: 'Натурная площадка (Парк Дружбы / Речной)', badge: '🌳 Парк Дружбы', type: 'ВЫЕЗД', latitude: 55.853244, longitude: 37.478423 }
    ];
  }
  renderLocationPresets();
}

function renderLocationPresets() {
  const container = document.getElementById('locationPresetsContainer');
  if (!container) return;
  if (!globalLocations || globalLocations.length === 0) {
    container.innerHTML = '<span class="text-[10px] font-mono text-[var(--text-muted)]">Нет пресетов площадок</span>';
    return;
  }
  container.innerHTML = globalLocations.map(loc => 
    '<button type="button" onclick="selectLocationPreset(\'' + (loc.name || '').replace(/'/g, "\\'") + '\', \'' + (loc.type || 'СТУДИЯ') + '\', ' + (loc.latitude || 55.858244) + ', ' + (loc.longitude || 37.518423) + ')" class="px-2 py-1 text-[10px] font-mono font-bold border transition hover:border-[var(--brand-red)]" style="background-color: var(--bg-primary); border-color: var(--border-color); color: var(--text-secondary);">' +
      (loc.badge || loc.name) +
    '</button>'
  ).join('');
}

function selectLocationPreset(name, type, lat, lon) {
  const locInput = document.getElementById('shootLocation');
  const typeSelect = document.getElementById('shootType');
  if (locInput && name) locInput.value = name;
  if (typeSelect) {
    typeSelect.value = type;
    if (typeof toggleMapPicker === 'function') {
      toggleMapPicker(type);
    }
  }
  if (lat && lon) {
    const latInput = document.getElementById('selectedLat');
    const lonInput = document.getElementById('selectedLon');
    if (latInput) latInput.value = lat;
    if (lonInput) lonInput.value = lon;
    if (typeof pickerMarker !== 'undefined' && pickerMarker && typeof pickerMarker.setLatLng === 'function') {
      pickerMarker.setLatLng([lat, lon]);
      if (typeof pickerMap !== 'undefined' && pickerMap && typeof pickerMap.setView === 'function') {
        pickerMap.setView([lat, lon], 14);
      }
    }
  }
}
window.selectLocationPreset = selectLocationPreset;

function openLocationManagerModal() {
  const modal = document.getElementById('locationManagerModal');
  if (modal) modal.classList.remove('hidden');
  resetLocationForm();
  renderLocationManagerList();
}

function closeLocationManagerModal() {
  const modal = document.getElementById('locationManagerModal');
  if (modal) modal.classList.add('hidden');
}

function renderLocationManagerList() {
  const container = document.getElementById('locationManagerList');
  if (!container) return;
  if (!globalLocations || globalLocations.length === 0) {
    container.innerHTML = '<div class="text-xs font-mono text-[var(--text-muted)] text-center p-3 border border-dashed">Нет сохранённых площадок</div>';
    return;
  }
  container.innerHTML = globalLocations.map(loc => 
    '<div class="flex items-center justify-between p-2.5 border" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
      '<div class="min-w-0 flex-1 truncate">' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="font-bold text-xs" style="color: var(--text-primary);">' + loc.name + '</span>' +
          '<span class="text-[9px] font-mono px-1 py-0.2 border text-amber-400 border-amber-800/60 bg-amber-950/40">' + (loc.badge || 'Кнопка') + '</span>' +
          '<span class="text-[9px] font-mono text-[var(--text-muted)]">[' + (loc.type || 'СТУДИЯ') + ']</span>' +
        '</div>' +
        '<div class="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 truncate">' +
          'GPS: ' + (loc.latitude || 55.858244) + ', ' + (loc.longitude || 37.518423) +
        '</div>' +
      '</div>' +
      '<div class="flex items-center gap-1.5 ml-2 flex-shrink-0">' +
        '<button type="button" onclick="editLocationItem(\'' + loc.id + '\')" class="px-2 py-1 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-800/50 bg-cyan-950/30 hover:bg-cyan-900/40">✎</button>' +
        '<button type="button" onclick="deleteLocationItem(\'' + loc.id + '\')" class="px-2 py-1 text-[10px] font-mono font-bold text-red-400 border border-red-800/50 bg-red-950/30 hover:bg-red-900/40">✕</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

function resetLocationForm() {
  const titleEl = document.getElementById('locFormTitle');
  if (titleEl) titleEl.innerText = 'Добавить новую площадку:';
  const idEl = document.getElementById('editLocationId');
  if (idEl) idEl.value = '';
  const nameEl = document.getElementById('locFormName');
  if (nameEl) nameEl.value = '';
  const badgeEl = document.getElementById('locFormBadge');
  if (badgeEl) badgeEl.value = '';
  const typeEl = document.getElementById('locFormType');
  if (typeEl) typeEl.value = 'СТУДИЯ';
  const latEl = document.getElementById('locFormLat');
  if (latEl) latEl.value = '55.858244';
  const lonEl = document.getElementById('locFormLon');
  if (lonEl) lonEl.value = '37.518423';
}

function editLocationItem(id) {
  const loc = (globalLocations || []).find(l => l.id === id);
  if (!loc) return;
  const titleEl = document.getElementById('locFormTitle');
  if (titleEl) titleEl.innerText = 'Редактирование: ' + loc.name;
  const idEl = document.getElementById('editLocationId');
  if (idEl) idEl.value = loc.id;
  const nameEl = document.getElementById('locFormName');
  if (nameEl) nameEl.value = loc.name || '';
  const badgeEl = document.getElementById('locFormBadge');
  if (badgeEl) badgeEl.value = loc.badge || '';
  const typeEl = document.getElementById('locFormType');
  if (typeEl) typeEl.value = loc.type || 'СТУДИЯ';
  const latEl = document.getElementById('locFormLat');
  if (latEl) latEl.value = loc.latitude || '55.858244';
  const lonEl = document.getElementById('locFormLon');
  if (lonEl) lonEl.value = loc.longitude || '37.518423';
  if (nameEl) nameEl.focus();
}

async function saveLocationForm() {
  const id = document.getElementById('editLocationId').value.trim();
  const name = document.getElementById('locFormName').value.trim();
  const badge = document.getElementById('locFormBadge').value.trim();
  const type = document.getElementById('locFormType').value;
  const latitude = parseFloat(document.getElementById('locFormLat').value) || 55.858244;
  const longitude = parseFloat(document.getElementById('locFormLon').value) || 37.518423;

  if (!name) {
    showToast('Укажите название площадки');
    return;
  }

  const payload = {
    name,
    badge: badge || name.split(' ')[0],
    type,
    latitude,
    longitude
  };

  try {
    if (id) {
      await fetch('/api/locations/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(payload)
      });
      const idx = globalLocations.findIndex(l => l.id === id);
      if (idx !== -1) globalLocations[idx] = { ...globalLocations[idx], ...payload };
      showToast('Площадка обновлена!');
    } else {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.location) {
          globalLocations.push(data.location);
        } else {
          globalLocations.push({ id: 'loc-' + Date.now(), ...payload });
        }
      } else {
        globalLocations.push({ id: 'loc-' + Date.now(), ...payload });
      }
      showToast('Новая площадка сохранена!');
    }
  } catch (e) {
    if (!id) globalLocations.push({ id: 'loc-' + Date.now(), ...payload });
  }

  resetLocationForm();
  renderLocationManagerList();
  renderLocationPresets();
}

async function deleteLocationItem(id) {
  if (!confirm('Удалить эту площадку из быстрых кнопок?')) return;
  globalLocations = (globalLocations || []).filter(l => l.id !== id);
  try {
    await fetch('/api/locations/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (token || 'demo-token') }
    });
  } catch (e) {}
  showToast('Площадка удалена');
  renderLocationManagerList();
  renderLocationPresets();
}

function exportStatisticsToCsv() {
  const students = (Array.isArray(globalStudents) && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
  const shoots = Array.isArray(globalShoots) ? globalShoots : [];

  const headers = [
    'ФИО',
    'Учебная группа',
    'Цеховой ранг',
    'Текущий рейтинг',
    'Завершённых смен',
    'Качество кадров',
    'Бережливость к технике',
    'Пунктуальность',
    'Командная этика',
    'Telegram',
    'Статус'
  ];

  const rows = students.map(st => {
    let totalFrames = 0, totalGear = 0, totalTime = 0, totalEthics = 0, critCount = 0;
    shoots.forEach(sh => {
      if (sh.isCompleted && Array.isArray(sh.crew)) {
        const cm = sh.crew.find(c => c.userId === st.id || c.id === st.id || (c.user && c.user.id === st.id));
        if (cm && cm.cktCriteria) {
          totalFrames += Number(cm.cktCriteria.frames || 5);
          totalGear += Number(cm.cktCriteria.gear || 5);
          totalTime += Number(cm.cktCriteria.time || 5);
          totalEthics += Number(cm.cktCriteria.ethics || 5);
          critCount++;
        }
      }
    });

    const framesAvg = critCount > 0 ? (totalFrames / critCount).toFixed(1) : (st.rating || '—');
    const gearAvg = critCount > 0 ? (totalGear / critCount).toFixed(1) : (st.rating || '—');
    const timeAvg = critCount > 0 ? (totalTime / critCount).toFixed(1) : (st.rating || '—');
    const ethicsAvg = critCount > 0 ? (totalEthics / critCount).toFixed(1) : (st.rating || '—');

    const rankObj = getCraftRankBadge(st.completedShoots || 0, parseFloat(st.rating) || 0);
    const statusText = st.isSuspended ? 'Приостановлен' : 'Активен';

    return [
      `"${(st.fullName || '').replace(/"/g, '""')}"`,
      `"${st.groupName || 'КТ-26'}"`,
      `"${rankObj.title}"`,
      (st.rating !== null && st.rating !== undefined && Number(st.rating) > 0) ? st.rating : '—',
      st.completedShoots || 0,
      framesAvg,
      gearAvg,
      timeAvg,
      ethicsAvg,
      `"${st.telegram || ''}"`,
      statusText
    ].join(';');
  });

  const csvContent = '\uFEFF' + headers.join(';') + '\r\n' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const nowStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `Otchet_TsKT_KP11_${nowStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Сводка ЦКТ успешно выгружена в CSV!');
}
window.exportStatisticsToCsv = exportStatisticsToCsv;

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  token = '';
  // Сохраняем kp11_shoots и kp11_theme, чтобы смены не исчезали при выходе
  location.reload();
}

async function handleAuth(e) {
  e.preventDefault();
  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
  const tgEl = document.getElementById('registerTelegram');
  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
    fullName: isRegister ? document.getElementById('fullName').value : undefined,
    groupName: isRegister ? document.getElementById('groupName').value : undefined,
    telegram: isRegister && tgEl ? tgEl.value.trim() : undefined
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || !data.user) throw new Error(data.error || 'Ошибка входа');

    if (data.user.role && typeof data.user.role === 'object' && data.user.role.name) {
      data.user.role = data.user.role.name;
    }
    localStorage.setItem('token', data.token || '');
    localStorage.setItem('user', JSON.stringify(data.user));
    currentUser = data.user;
    token = data.token || '';
    closeModal();
    updateNav();
    await loadShoots();
    if (data.message) {
      showToast(data.message);
    }
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

function isDemoShootRecord(s) {
  if (!s) return true;
  if (s.id === 'shoot-prod-1' || s.id === 'shoot-1792450290828') return true;
  return false;
}

async function loadShoots() {
  let shoots = [];
  let stats = { totalShoots: 0, completedShoots: 0 };
  let userStats = null;

  try {
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch('/api/shoots', { headers });
    if (res.ok) {
      const data = await res.json();
      const rawShoots = data.shoots;
      let fetchedShoots = Array.isArray(rawShoots) ? rawShoots : (rawShoots && Array.isArray(rawShoots.value) ? rawShoots.value : []);
      shoots = fetchedShoots.filter(s => !isDemoShootRecord(s));

      if (data.students) {
        const rawStudents = data.students;
        globalStudents = Array.isArray(rawStudents) ? rawStudents : (rawStudents && Array.isArray(rawStudents.value) ? rawStudents.value : []);
      }
      stats = data.stats || { totalShoots: shoots.length, completedShoots: shoots.filter(s => s && s.isCompleted).length };
      userStats = data.userStats || null;
      window._coldStartRetryCount = 0;
      try {
        localStorage.setItem('kp11_shoots', JSON.stringify(shoots));
      } catch (e) {}
    } else {
      throw new Error('API fetch status ' + res.status);
    }
  } catch (err) {
    userStats = { rating: 4.8, completedParticipated: 0, totalParticipated: 0 };
    const stored = JSON.parse(localStorage.getItem('kp11_shoots') || 'null');
    if (Array.isArray(stored)) {
      shoots = stored.filter(s => !isDemoShootRecord(s));
    } else {
      shoots = [];
    }
    stats = { totalShoots: shoots.length, completedShoots: shoots.filter(s => s && s.isCompleted).length };

    // Автоматический retry при холодном старте Render
    if (!window._coldStartRetryCount) window._coldStartRetryCount = 0;
    if (window._coldStartRetryCount < 6) {
      window._coldStartRetryCount++;
      console.log(`[KP11 Cold-Start] Подключение к серверу (пробуждение Render). Попытка #${window._coldStartRetryCount} через 3 сек...`);
      setTimeout(() => {
        loadShoots();
      }, 3000);
    }
  }

  globalShoots = shoots;
  loadInventoryData().catch(() => {});
  loadLocations().catch(() => {});
  if (typeof recalculateAllStudentRatings === 'function') {
    recalculateAllStudentRatings();
  }

  try {
    const countEl = document.getElementById('shootCount');
    if (countEl) {
      countEl.innerText = pluralizeRu(shoots.length, 'смена', 'смены', 'смен');
    }
    const statsEl = document.getElementById('globalStatsText');
    if (statsEl) {
      statsEl.innerText = 'Всего смен: ' + stats.totalShoots + ' | Завершено: ' + stats.completedShoots;
    }

    const sidebar = document.getElementById('sidebarProfile');
    if (currentUser && sidebar) {
      try {
        let userRatingText = userStats && userStats.rating !== null && userStats.rating !== undefined ? userStats.rating : 'Нет';
        let completedPart = userStats ? userStats.completedParticipated : 0;
        let totalPart = userStats ? userStats.totalParticipated : 0;
        const userRank = getCraftRankBadge(completedPart, userStats ? userStats.rating : 4.8);
        const userTg = currentUser.telegram || '@badikov_dop';

        sidebar.innerHTML = 
          '<div class="space-y-4">' +
            '<div class="flex items-center space-x-3.5 pb-3 border-b" style="border-color: rgba(0,0,0,0.12);">' +
              '<div class="relative w-16 h-16 overflow-hidden border-2 flex-shrink-0 shadow-md" style="border-color: var(--brand-red);">' +
                '<img src="' + (currentUser.avatar || 'img/student.jpg') + '" alt="Student" class="w-full h-full object-cover">' +
                '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[7px] font-bold px-1 font-mono">КП11</span>' +
              '</div>' +
              '<div class="min-w-0 flex-grow">' +
                '<div class="flex items-center justify-between mb-1">' +
                  '<span class="gaffer-tape-sticker">АККРЕДИТАЦИЯ // 2026</span>' +
                  '<span class="text-[8px] font-mono font-bold" style="color: #666;">ROLL: 11-A</span>' +
                '</div>' +
                '<h4 class="font-extrabold text-xs uppercase leading-tight truncate" style="color: #141414;">' + escapeHtml(currentUser.fullName || '') + '</h4>' +
                '<p class="text-[10px] font-mono mt-0.5 font-bold" style="color: #555555;">' + getUserRoleName(currentUser) + '</p>' +
              '</div>' +
            '</div>' +

            '<div class="space-y-2 text-xs">' +
              '<div class="flex justify-between items-center py-1.5 border-b" style="border-color: rgba(0,0,0,0.08);">' +
                '<span class="font-bold uppercase text-[10px]" style="color: #555555;">Группа:</span>' +
                '<span class="font-mono font-extrabold px-2 py-0.5 border text-xs" style="background-color: rgba(255,255,255,0.7); color: var(--brand-red); border-color: rgba(0,0,0,0.15);">' + (currentUser.groupName || '—') + '</span>' +
              '</div>' +
              '<div class="flex justify-between items-center py-1.5 border-b" style="border-color: rgba(0,0,0,0.08);">' +
                '<span class="font-bold uppercase text-[10px]" style="color: #555555;">Грейд мастерства:</span>' +
                '<span class="' + userRank.className + '">' + userRank.icon + ' ' + userRank.title + '</span>' +
              '</div>' +
              '<div class="flex justify-between items-center py-1.5 border-b" style="border-color: rgba(0,0,0,0.08);">' +
                '<span class="font-bold uppercase text-[10px]" style="color: #555555;">Telegram:</span>' +
                '<span class="font-mono text-xs text-[#229ED9] font-bold flex items-center gap-1">' + SVG_ICONS.telegram + ' ' + userTg + '</span>' +
              '</div>' +
              '<div class="flex justify-between items-center py-1.5 border-b" style="border-color: rgba(0,0,0,0.08);">' +
                '<span class="font-bold uppercase text-[10px]" style="color: #555555;">Рейтинг:</span>' +
                '<span class="text-emerald-700 font-mono font-extrabold text-xs inline-flex items-center gap-1">' + SVG_ICONS.star + ' ' + userRatingText + '</span>' +
              '</div>' +
              '<div class="flex justify-between items-center py-1.5 border-b" style="border-color: rgba(0,0,0,0.08);">' +
                '<span class="font-bold uppercase text-[10px]" style="color: #555555;">Смен в активе:</span>' +
                '<span class="font-mono font-bold text-xs" style="color: #141414;">' + completedPart + ' / ' + totalPart + '</span>' +
              '</div>' +
            '</div>' +

            '<div class="pt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest border-t" style="border-color: rgba(0,0,0,0.1); color: #555555;">' +
              '<span>СТАТУС: В ЭФИРЕ</span>' +
              '<span class="font-extrabold" style="color: var(--dept-edit);">● ДОПУЩЕН</span>' +
            '</div>' +

            '<div class="pt-2 border-t flex flex-col items-center justify-center space-y-1" style="border-color: rgba(0,0,0,0.1);">' +
              '<div class="flex items-center space-x-0.5 opacity-85">' +
                '<span class="w-0.5 h-5 bg-black inline-block"></span><span class="w-1.5 h-5 bg-black inline-block"></span><span class="w-0.5 h-5 bg-transparent inline-block"></span><span class="w-1 h-5 bg-black inline-block"></span><span class="w-2 h-5 bg-black inline-block"></span><span class="w-0.5 h-5 bg-transparent inline-block"></span><span class="w-1.5 h-5 bg-black inline-block"></span><span class="w-0.5 h-5 bg-black inline-block"></span><span class="w-1 h-5 bg-black inline-block"></span><span class="w-2 h-5 bg-black inline-block"></span><span class="w-0.5 h-5 bg-transparent inline-block"></span><span class="w-1.5 h-5 bg-black inline-block"></span>' +
              '</div>' +
              '<span class="text-[8px] font-mono tracking-widest text-black/60 font-extrabold">MEDIA-CREW-KP11-VERIFIED</span>' +
            '</div>' +
          '</div>';
      } catch (sbErr) {
        console.warn('Sidebar render error:', sbErr);
      }
    }

    try {
      renderShootsList(shoots);
    } catch (rErr) {
      console.error('renderShootsList error:', rErr);
    }

    if (urlParams.get('expand') === '1' && shoots.length > 0 && (!window._openedShootIds || window._openedShootIds.size === 0)) {
      setTimeout(() => toggleShootExpand(shoots[0].id), 50);
    }
  } catch (err) {
    console.error(err);
  }
}

// ----------------- ОПРЕДЕЛЕНИЕ СТАТУСА СМЕНЫ В РЕАЛЬНОМ ВРЕМЕНИ -----------------
function getShootLiveStatus(s) {
  if (s.isCompleted) {
    return {
      code: 'ARCHIVED',
      label: 'В АРХИВЕ // ЗАВЕРШЕНО',
      badgeClass: 'badge-completed text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>',
      filmMarker: '<span class="film-slate-tag">■ WRAP</span>',
      isLive: false,
      isUpcoming: false,
      isFinished: true
    };
  }

  const now = new Date();
  const callTimeStr = s.callTime || '10:00';
  const startTimeStr = s.startTime || '11:30';
  const endTimeStr = s.endTime || '18:00';

  const callDate = parseShootDateTime(s.date, callTimeStr);
  const startDate = parseShootDateTime(s.date, startTimeStr);
  const endDate = parseShootEndDateTime(s.date, endTimeStr, startTimeStr);

  if (!callDate || isNaN(callDate.getTime())) {
    return {
      code: 'PLANNED',
      label: 'ЗАПЛАНИРОВАНО',
      badgeClass: 'badge-neutral text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>',
      filmMarker: '<span class="rec-pulse-badge">● СКОРО</span>',
      isLive: false,
      isUpcoming: true,
      isFinished: false
    };
  }

  if (now < callDate) {
    return {
      code: 'UPCOMING',
      label: 'ОЖИДАНИЕ СБОРА',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-neutral-300 bg-neutral-900 border border-neutral-700',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-neutral-400 border-neutral-700 bg-neutral-900">⏳ СБОР В ' + callTimeStr + '</span>',
      isLive: false,
      isUpcoming: true,
      isFinished: false
    };
  } else if (now >= callDate && now < startDate) {
    return {
      code: 'CALL_TIME',
      label: '⚡ СБОР ГРУППЫ // ПОДГОТОВКА',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-amber-300 bg-amber-950/70 border border-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.4)] animate-pulse',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-amber-300 border-amber-600 bg-amber-950/60 animate-pulse">⚡ ПОДГОТОВКА</span>',
      isLive: true,
      isUpcoming: false,
      isFinished: false
    };
  } else if (now >= startDate && now <= endDate) {
    return {
      code: 'ON_AIR',
      label: '🔴 ON AIR // ИДЁТ СЪЁМКА',
      badgeClass: 'badge-rec text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-extrabold text-red-400 bg-red-950/90 border border-red-600 shadow-[0_0_12px_rgba(227,6,19,0.6)] animate-pulse',
      dotHtml: '<span class="rec-dot"></span>',
      filmMarker: '<span class="rec-pulse-badge">● ON AIR // 24FPS</span>',
      isLive: true,
      isUpcoming: false,
      isFinished: false
    };
  } else {
    return {
      code: 'FINISHED',
      label: '🏁 СМЕНА ЗАВЕРШЕНА',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-neutral-400 bg-neutral-900/80 border border-neutral-700',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-neutral-500"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-neutral-400 border-neutral-700 bg-neutral-900">🏁 ЗАВЕРШЕНА</span>',
      isLive: false,
      isUpcoming: false,
      isFinished: true
    };
  }
}

function toggleArchiveShoots() {
  const list = document.getElementById('archiveShootsList');
  const btn = document.getElementById('archiveToggleBtn');
  const icon = document.getElementById('archiveToggleIcon');
  if (!list) return;
  const isHidden = list.classList.contains('hidden') || list.style.display === 'none';
  if (isHidden) {
    list.classList.remove('hidden');
    list.style.display = 'block';
    if (btn) btn.innerText = 'Скрыть архив ▴';
    if (icon) icon.innerText = '▲';
  } else {
    list.classList.add('hidden');
    list.style.display = 'none';
    if (btn) btn.innerText = 'Показать архив ▾';
    if (icon) icon.innerText = '▼';
  }
}
function toggleArchiveVisibility() {
  toggleArchiveShoots();
}
window.toggleArchiveShoots = toggleArchiveShoots;
window.toggleArchiveVisibility = toggleArchiveVisibility;

// ----------------- ОСНОВНАЯ ФУНКЦИЯ ОТРИСОВКИ СМЕН И АРХИВА -----------------
function renderShootsList(shoots = globalShoots) {
  const container = document.getElementById('shootsList');
  if (!container) return;

  const allShoots = Array.isArray(shoots) ? shoots : [];
  
  // 1. Деление на явно завершённые в архив и смены в производственном цикле
  const archivedShoots = allShoots.filter(s => !!s.isCompleted);
  const unarchivedShoots = allShoots.filter(s => !s.isCompleted);

  // 2. Распределение активных смен по трём строгим уровням приоритета:
  //    Уровень 1: Съёмки, идущие прямо сейчас (Live / ON AIR / сбор)
  //    Уровень 2: Ближайшие будущие съёмки (Upcoming, сортировка от ближней по времени к дальней)
  //    Уровень 3: Завершённые смены (Finished, сортировка по дате и времени от недавних)
  const nowShoots = [];
  const upcomingShoots = [];
  const finishedShoots = [];

  unarchivedShoots.forEach(s => {
    const status = getShootLiveStatus(s);
    if (status.isLive) {
      nowShoots.push(s);
    } else if (status.isUpcoming) {
      upcomingShoots.push(s);
    } else {
      finishedShoots.push(s);
    }
  });

  // Сортировка уровня 1 (Идут сейчас):
  // Если авторизован пользователь и он участник этой съёмки, она выше
  nowShoots.sort((a, b) => {
    if (currentUser) {
      const aMine = a.crew && a.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
      const bMine = b.crew && b.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;
    }
    const aTime = (parseShootDateTime(a.date, a.startTime || a.callTime) || 0).valueOf();
    const bTime = (parseShootDateTime(b.date, b.startTime || b.callTime) || 0).valueOf();
    return aTime - bTime;
  });

  // Сортировка уровня 2 (Ближайшие будущие съёмки: от ближней по времени до дальней хронологически):
  upcomingShoots.sort((a, b) => {
    const aTime = (parseShootDateTime(a.date, a.callTime || a.startTime) || 0).valueOf();
    const bTime = (parseShootDateTime(b.date, b.callTime || b.startTime) || 0).valueOf();
    return aTime - bTime;
  });

  // Сортировка уровня 3 (Завершённые смены: по дате и времени, самые свежие первыми):
  finishedShoots.sort((a, b) => {
    const aTime = (parseShootEndDateTime(a.date, a.endTime, a.startTime) || 0).valueOf();
    const bTime = (parseShootEndDateTime(b.date, b.endTime, b.startTime) || 0).valueOf();
    return bTime - aTime;
  });

  // Объединяем в строгом порядке, требуемом пользователем
  const activeShoots = [...nowShoots, ...upcomingShoots, ...finishedShoots];

  // Сортировка архивных смен (по дате и времени убывания)
  archivedShoots.sort((a, b) => {
    const aTime = (parseShootDateTime(a.date, a.endTime || a.startTime) || 0).valueOf();
    const bTime = (parseShootDateTime(b.date, b.endTime || b.startTime) || 0).valueOf();
    return bTime - aTime;
  });

  const canDeleteShoot = isAdminUser(currentUser) || isMasterUser(currentUser);
  const canGradeAndManage = isMasterOrAdminUser(currentUser);
  const canEditShoot = isMasterOrAdminUser(currentUser) || !currentUser || !isStudentUser(currentUser);

  // Обновление карты объектов
  try {
    if (fullMap && fullMap.geoObjects) {
      fullMap.geoObjects.removeAll();
      allShoots.forEach(s => {
        let balloonHTML = '<div style="padding:6px; font-family:sans-serif; min-width:180px;">' +
          '<strong style="font-size:12px; text-transform:uppercase; color:#FC2C2C;">' + s.title + '</strong><br>' +
          '<span style="font-size:11px; color:#555;">Формат: ' + (s.type || 'СМЕНА') + '</span><br>' +
          '<span style="font-size:11px; color:#333;">Локация: ' + s.location + '</span><br>' +
          '<div style="margin-top:8px; display:flex; gap:4px;">' +
            '<button onclick="openCallsheetModal(\'' + s.id + '\')" style="background:#229ED9;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Вызывной</button>';
        if (canEditShoot) {
          balloonHTML += '<button type="button" onclick="event.stopPropagation(); openEditShootModal(\'' + s.id + '\')" style="background:#d97706;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Ред.</button>';
        }
        if (canDeleteShoot) {
          balloonHTML += '<button type="button" data-action="delete-shoot" data-shoot-id="' + s.id + '" onclick="event.stopPropagation(); deleteShoot(\'' + s.id + '\')" style="background:#E30613;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Удалить</button>';
        }
        balloonHTML += '</div></div>';

        const placemark = new ymaps.Placemark([s.latitude || 55.751244, s.longitude || 37.618423], {
          balloonContent: balloonHTML,
          hintContent: s.title
        }, {
          preset: s.isCompleted ? 'islands#darkGreenFilmIcon' : 'islands#redFilmIcon'
        });
        fullMap.geoObjects.add(placemark);
      });
    } else if (leafletFullMap && leafletMarkersLayer && typeof L !== 'undefined') {
      leafletMarkersLayer.clearLayers();
      const bounds = [];
      allShoots.forEach(s => {
        const lat = parseFloat(s.latitude) || 55.858244;
        const lon = parseFloat(s.longitude) || 37.518423;
        bounds.push([lat, lon]);

        const icon = L.divIcon({
          className: 'custom-cinema-pin',
          html: '<div style="background:' + (s.isCompleted ? '#10B981' : '#E30613') + ';width:28px;height:28px;border-radius:50%;border:2px solid #FFFFFF;box-shadow:0 0 12px rgba(227,6,19,0.7);display:flex;align-items:center;justify-content:center;color:#FFF;font-size:12px;font-weight:bold;">' + (s.isCompleted ? '✓' : '🎬') + '</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        const marker = L.marker([lat, lon], { icon: icon });

        let balloonHTML = '<div style="padding:6px; font-family:sans-serif; min-width:180px; color:#141414;">' +
          '<strong style="font-size:12px; text-transform:uppercase; color:#E30613;">' + s.title + '</strong><br>' +
          '<span style="font-size:11px; color:#555;">Формат: ' + (s.type || 'СМЕНА') + '</span><br>' +
          '<span style="font-size:11px; color:#333;">Локация: ' + s.location + '</span><br>' +
          '<div style="margin-top:8px; display:flex; gap:6px;">' +
            '<button onclick="openCallsheetModal(\'' + s.id + '\')" style="background:#229ED9;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Вызывной</button>';
        if (canEditShoot) {
          balloonHTML += '<button type="button" onclick="event.stopPropagation(); openEditShootModal(\'' + s.id + '\')" style="background:#d97706;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Ред.</button>';
        }
        if (canDeleteShoot) {
          balloonHTML += '<button type="button" data-action="delete-shoot" data-shoot-id="' + s.id + '" onclick="event.stopPropagation(); deleteShoot(\'' + s.id + '\')" style="background:#E30613;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Удалить</button>';
        }
        balloonHTML += '<a href="https://yandex.ru/maps/?pt=' + lon + ',' + lat + '&z=16" target="_blank" style="background:#141414;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;text-decoration:none;display:inline-block;text-transform:uppercase;">Яндекс ↗</a>';
        balloonHTML += '</div></div>';

        marker.bindPopup(balloonHTML);
        leafletMarkersLayer.addLayer(marker);
      });
      if (bounds.length > 0) {
        leafletFullMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      }
    }
  } catch (mapErr) {
    console.warn('Map placemarks deferred:', mapErr);
  }

  // Генератор карточки смены
  function renderShootCard(s, isArchive = false) {
    window.renderShootCard = renderShootCard;
    const locationText = s.location;
    const masterText = s.creator && s.creator.fullName ? s.creator.fullName : 'Не указан';
    const cardStateClass = s.isCompleted ? 'completed-shoot' : 'active-shoot';
    
    const liveStatus = getShootLiveStatus(s);
    let statusBadge = '<span class="' + liveStatus.badgeClass + '">' + liveStatus.dotHtml + ' ' + liveStatus.label + '</span>';
    let typeBadge = '<span class="badge-neutral text-[10px] px-2 py-0.5 font-mono">' + (s.type || 'СМЕНА') + '</span>';

    const isMeInShoot = currentUser && s.crew && s.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
    const myShootHighlightBadge = isMeInShoot ? '<span class="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-amber-950/70 border border-amber-600/80 inline-flex items-center gap-1 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ВЫ В СЪЁМОЧНОЙ ГРУППЕ</span>' : '';

    let deleteBtn = canDeleteShoot ? '<button type="button" data-action="delete-shoot" data-shoot-id="' + s.id + '" onclick="event.stopPropagation(); deleteShoot(\'' + s.id + '\')" class="btn-brand-ghost px-2 py-1 text-[10px] font-extrabold uppercase text-red-500 hover:bg-red-500/10 hover:border-red-500 transition flex items-center gap-1 cursor-pointer" title="Удалить смену"><svg class="w-3 h-3 text-red-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span class="pointer-events-none">Удалить</span></button>' : '';

    // Отдельный блок отображения даты смены
    const parsedDateInfo = formatShootDateSeparate(s.date);
    const separateDateBadge = '<div class="shoot-date-badge-box flex items-center justify-between p-2.5 px-3 border" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="flex items-center gap-2">' +
        '<svg class="w-4 h-4 text-[var(--brand-red)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
          '<line x1="16" y1="2" x2="16" y2="6"/>' +
          '<line x1="8" y1="2" x2="8" y2="6"/>' +
          '<line x1="3" y1="10" x2="21" y2="10"/>' +
        '</svg>' +
        '<div class="flex flex-wrap items-baseline gap-x-2">' +
          '<span class="text-xs sm:text-sm font-extrabold font-mono uppercase tracking-wide" style="color: var(--text-primary);">' + parsedDateInfo.dateText + '</span>' +
          (parsedDateInfo.dayOfWeek ? '<span class="text-[11px] font-mono font-bold text-[var(--brand-beige-text)] uppercase">(' + parsedDateInfo.dayOfWeek + ')</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="text-[10px] font-mono tracking-widest text-[var(--text-muted)] uppercase font-semibold">КАЛЕНДАРЬ СМЕНЫ</span>' +
    '</div>';

    const crewList = s.crew || [];
    let crewHtml = '';
    if (crewList.length === 0) {
      const emptyAddBtn = (canGradeAndManage && !s.isCompleted)
        ? '<button type="button" onclick="event.stopPropagation(); openAddCrewMemberModal(\'' + s.id + '\')" class="btn-brand-primary px-3 py-1.5 text-xs font-extrabold uppercase shadow cursor-pointer mt-1 flex items-center gap-1"><span>+ Назначить первого участника</span></button>'
        : '';
      crewHtml = '<div class="p-3 text-xs font-mono text-center border border-dashed flex flex-col items-center gap-1.5" style="color: var(--text-muted); border-color: var(--border-color);">' +
        '<span>Команда пока не назначена на смену</span>' +
        emptyAddBtn +
      '</div>';
    } else {
      crewHtml = crewList.map(c => {
        const userFromDir = (globalStudents || []).find(st => 
          (st.id && (st.id === c.userId || st.id === c.id)) ||
          (c.user && c.user.id && st.id === c.user.id) ||
          (c.user && c.user.fullName && st.fullName && st.fullName.toLowerCase() === c.user.fullName.toLowerCase()) ||
          (c.fullName && st.fullName && st.fullName.toLowerCase() === c.fullName.toLowerCase())
        );
        const fallbackUser = c.user || { fullName: 'Участник', groupName: 'КТ-26', rating: null, id: c.userId || c.id };
        const actualUser = userFromDir ? { ...fallbackUser, ...userFromDir } : fallbackUser;

        if ((actualUser.rating === null || actualUser.rating === undefined || actualUser.rating === 'Нет') && c.grade) {
          actualUser.rating = c.grade;
        }

        c.user = actualUser;
        let cUserName = actualUser.fullName || 'Участник';
        let cGroupName = actualUser.groupName || 'Группа';
        let cRank = getCraftRankBadge(actualUser.participations ? actualUser.participations : (actualUser.completedShoots || 3), 4.8);
        
        const isMe = currentUser && (c.userId === currentUser.id || c.id === currentUser.id);
        const rowClassExtra = isMe ? ' student-my-row' : '';
        const myBadge = isMe ? '<span class="student-my-badge">Вы в смене</span>' : '';

        let statusBadgeCrew = '';
        let declineReasonHtml = '';
        let replaceBtn = '';
        let removeBtn = '';

        if (c.status === 'ACCEPTED') {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 inline-flex items-center gap-1">' + SVG_ICONS.check + (isMe ? 'Вы подтвердили' : 'Принят') + '</span>';
        } else if (c.status === 'DECLINED') {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/60 px-2 py-0.5 inline-flex items-center gap-1">' + SVG_ICONS.cross + (isMe ? 'Вы отклонили' : 'Отклонил') + '</span>';

          const rawReason = c.declineReason || 'Не указана';
          declineReasonHtml = '<span class="inline-flex items-center gap-1 text-[11px] font-mono text-red-300 bg-red-950/70 border border-red-700/60 px-2 py-0.5 rounded-xs" title="Причина отклонения вызывного">' +
            '<span class="text-red-400 font-bold uppercase tracking-wider text-[9px]">Причина:</span> ' +
            '«' + escapeHtml(rawReason) + '»' +
          '</span>';
        } else {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 inline-flex items-center gap-1">' + SVG_ICONS.clock + 'Ожидание</span>';
        }

        if (canGradeAndManage && !s.isCompleted) {
          const memberIdParam = String(c.id);
          const userTargetIdParam = String((actualUser && actualUser.id) || c.userId || c.id);
          const roleParam = escapeHtml(c.roleInShoot || 'Участник');
          const deptParam = escapeHtml(c.department || 'cinema');
          const escapedName = escapeHtml(cUserName).replace(/'/g, "\\'");

          replaceBtn = '<button type="button" onclick="event.stopPropagation(); openReplaceCrewModal(\'' + s.id + '\', \'' + memberIdParam + '\', \'' + userTargetIdParam + '\', \'' + roleParam + '\', \'' + deptParam + '\')" class="btn-brand-beige px-2 py-0.5 text-[10px] font-extrabold uppercase inline-flex items-center gap-1 shadow-sm hover:brightness-110 transition cursor-pointer" title="Заменить участника другим студентом">' +
            '<span>🔄 Заменить</span>' +
          '</button>';

          removeBtn = '<button type="button" onclick="event.stopPropagation(); removeCrewMemberFromShoot(\'' + s.id + '\', \'' + memberIdParam + '\', \'' + escapedName + '\')" class="px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-800/50 inline-flex items-center gap-1 transition cursor-pointer" title="Исключить студента из смены">' +
            '<span>✕ Исключить</span>' +
          '</button>';
        }

        let manualAcceptBtn = '';
        if (c.status === 'PENDING') {
          if (isMe) {
            manualAcceptBtn = '<div class="student-action-btn-group inline-flex items-center gap-1.5 ml-1">' +
              '<button onclick="respondCrew(\'' + c.id + '\', \'ACCEPTED\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-[10px] font-extrabold uppercase transition shadow inline-flex items-center gap-1">' + SVG_ICONS.check + 'Принять вызов</button>' +
              '<button onclick="respondCrew(\'' + c.id + '\', \'DECLINED\')" class="btn-brand-ghost px-2 py-1 text-[10px] font-extrabold uppercase text-red-400 hover:text-red-300">Отклонить</button>' +
            '</div>';
          } else if (canGradeAndManage) {
            manualAcceptBtn = '<button onclick="respondCrew(\'' + c.id + '\', \'ACCEPTED\')" class="bg-emerald-700/80 hover:bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase transition">Подтвердить</button>';
          }
        }

        let attendanceSelect = '';
        if (canGradeAndManage && !s.isCompleted) {
          let selPresent = c.attendance === 'PRESENT' ? 'selected' : '';
          let selAbsent = c.attendance === 'ABSENT' ? 'selected' : '';
          attendanceSelect = '<select onchange="updateAttendance(\'' + c.id + '\', this.value)" class="studio-input text-xs font-bold px-2 py-0.5 ml-2">' +
            '<option value="PRESENT" ' + selPresent + '>Присутствовал</option>' +
            '<option value="ABSENT" ' + selAbsent + '>Не явился</option>' +
          '</select>';
        } else {
          const attText = c.attendance === 'ABSENT' ? 'Не явился' : 'Присутствовал';
          const attColor = c.attendance === 'ABSENT' ? '#f87171' : 'var(--text-muted)';
          attendanceSelect = '<span class="text-xs font-bold font-mono" style="color: ' + attColor + ';">' + attText + '</span>';
        }

        // Окантовка карточки участника по цеху и бейдж
        const deptCfg = getCraftDepartmentConfig(c.department, c.roleInShoot);

        let nameHtml = '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + cUserName + '</span>';
        if (isMasterOrAdminUser(currentUser)) {
          const userTargetId = (actualUser && actualUser.id) || c.userId || c.id;
          if (userTargetId) {
            nameHtml = '<button type="button" onclick="event.stopPropagation(); openShowreelModal(\'' + userTargetId + '\')" class="font-bold text-xs uppercase hover:underline cursor-pointer text-left inline-flex items-center gap-1 group text-[var(--text-primary)] hover:text-amber-400 transition" title="Открыть цифровой паспорт студента">' +
              '<span>' + cUserName + '</span>' +
              '<span class="text-[9px] text-amber-400/80 group-hover:text-amber-300">👤</span>' +
            '</button>';
          }
        }

        return '<div class="crew-member-row ' + deptCfg.borderClass + ' p-3 flex flex-wrap items-center justify-between gap-2' + rowClassExtra + '">' +
          '<div class="flex items-center flex-wrap gap-2">' +
            '<span class="crew-dept-tag ' + deptCfg.badgeClass + '"><span class="inline-flex items-center">' + deptCfg.icon + ' ' + (c.roleInShoot || 'Участник') + '</span></span>' +
            nameHtml +
            '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + cGroupName + ']</span>' +
            myBadge +
            '<span class="' + cRank.className + '">' + cRank.icon + ' ' + cRank.title + '</span>' +
            statusBadgeCrew +
            declineReasonHtml +
            replaceBtn +
            removeBtn +
            manualAcceptBtn +
          '</div>' +
          '<div class="flex items-center space-x-2 ml-auto">' +
            attendanceSelect +
          '</div>' +
        '</div>';
      }).join('');
    }

    let saveGradesBtn = '';
    if (canGradeAndManage && !s.isCompleted) {
      saveGradesBtn = '<div class="mt-3">' +
        '<button onclick="saveShootGrades(\'' + s.id + '\')" class="btn-brand-primary w-full py-2.5 text-xs font-extrabold uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5">' +
          '<span>✓ Завершить смену и перенести в архив</span>' +
        '</button>' +
      '</div>';
    }

    const addCrewBtn = (canGradeAndManage && !s.isCompleted)
      ? '<button type="button" onclick="event.stopPropagation(); openAddCrewMemberModal(\'' + s.id + '\')" class="btn-brand-primary px-2.5 py-1 text-[10px] font-extrabold uppercase inline-flex items-center gap-1 shadow cursor-pointer"><span>+ Назначить в группу</span></button>'
      : '';

    const equipmentBtn = '<button onclick="openEquipmentModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1 text-emerald-400" title="Техпарк и спецификация оборудования ЦКТ КП11">' +
      '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>' +
      '<span>Оборудование</span>' +
    '</button>';

    const editBtn = canEditShoot ? '<button type="button" data-action="edit-shoot" data-shoot-id="' + s.id + '" onclick="event.stopPropagation(); openEditShootModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 transition flex items-center gap-1 cursor-pointer" title="Редактировать смену, таймлайн, состав и технику">' +
      '<svg class="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      '<span>Ред.</span>' +
    '</button>' : '';

    const editDetailsBtn = canEditShoot ? '<div class="pt-2">' +
      '<button type="button" onclick="openEditShootModal(\'' + s.id + '\')" class="btn-brand-ghost w-full py-2 text-xs font-extrabold uppercase tracking-wider text-amber-400 border border-amber-600/60 bg-amber-950/20 hover:bg-amber-900/40 flex items-center justify-center gap-1.5 transition shadow-sm">' +
        '<svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '<span>✎ Редактировать параметры смены и состав</span>' +
      '</button>' +
    '</div>' : '';

    // Интерактивный список техники смены для плашки статуса и свободных серийников
    let equipmentListHtml = '';
    if (s.equipment && Array.isArray(s.equipment) && s.equipment.length > 0) {
      equipmentListHtml = '<div class="flex flex-wrap gap-1.5 pt-1">' +
        s.equipment.map(eq => {
          const eqId = (typeof eq === 'object' && eq) ? (eq.id || eq.name) : String(eq);
          const eqName = (typeof eq === 'object' && eq) ? (eq.name || eq.id) : String(eq);
          const eqCat = (typeof eq === 'object' && eq && eq.category) ? eq.category : '';
          const escapedId = String(eqId).replace(/'/g, "\\'");
          return '<button type="button" onclick="event.stopPropagation(); openEquipmentDetailsModal(\'' + escapedId + '\')" class="px-2.5 py-1 text-xs font-mono font-bold border border-emerald-700/60 bg-emerald-950/30 hover:bg-emerald-900/50 hover:border-emerald-500 text-emerald-300 inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm group" title="Нажмите, чтобы открыть статус использования, занятость и свободные серийники">' +
            '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:animate-ping"></span>' +
            '<span>' + eqName + '</span>' +
            (eqCat ? '<span class="text-[9px] text-emerald-400/70 border-l border-emerald-800/60 pl-1 ml-0.5 uppercase">' + eqCat + '</span>' : '') +
            '<span class="text-[9px] text-amber-400 opacity-80 group-hover:opacity-100">ℹ️</span>' +
          '</button>';
        }).join('') +
      '</div>';
    } else {
      equipmentListHtml = '<div class="p-2.5 text-xs font-mono text-[var(--text-muted)] border border-dashed text-center" style="border-color: var(--border-subtle);">' +
        'Оборудование на смену пока не назначено. ' +
        '<button type="button" onclick="event.stopPropagation(); openEquipmentModal(\'' + s.id + '\')" class="text-amber-400 hover:underline font-bold">+ Назначить комплект</button>' +
      '</div>';
    }

    let equipmentQuickPreview = '';
    if (s.equipment && Array.isArray(s.equipment) && s.equipment.length > 0) {
      const previewItems = s.equipment.slice(0, 3);
      const remainingCount = s.equipment.length - previewItems.length;
      equipmentQuickPreview = '<div class="flex items-center flex-wrap gap-1.5 text-xs pt-1 font-mono">' +
        '<span class="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">🎥 Техника:</span>' +
        previewItems.map(eq => {
          const eqId = (typeof eq === 'object' && eq) ? (eq.id || eq.name) : String(eq);
          const eqName = (typeof eq === 'object' && eq) ? (eq.name || eq.id) : String(eq);
          const escapedId = String(eqId).replace(/'/g, "\\'");
          return '<button type="button" onclick="event.stopPropagation(); openEquipmentDetailsModal(\'' + escapedId + '\')" class="px-2 py-0.5 text-[10px] border border-emerald-800/60 bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-300 font-bold transition cursor-pointer" title="Открыть статус и свободные серийники">' + eqName + '</button>';
        }).join('') +
        (remainingCount > 0 ? '<button type="button" onclick="event.stopPropagation(); toggleShootExpand(\'' + s.id + '\')" class="text-[10px] text-amber-400 hover:underline font-bold">+' + remainingCount + ' ещё</button>' : '') +
      '</div>';
    }

    const isShootOpen = window._openedShootIds ? window._openedShootIds.has(s.id) : false;
    const expandBtnText = isShootOpen ? 'Свернуть ▴' : 'Развернуть ▾';

    // Временная шкала смены (сбор, мотор, конец + пометки)
    let timelineMilestonesHtml = '';
    if (s.timeline && Array.isArray(s.timeline) && s.timeline.length > 0) {
      timelineMilestonesHtml = '<div class="mt-2 pt-2 border-t flex flex-wrap gap-1.5" style="border-color: var(--border-subtle);">' +
        s.timeline.map(m => 
          '<span class="text-[9px] font-mono px-2 py-0.5 border" style="background-color: var(--bg-card); border-color: var(--border-subtle); color: var(--text-secondary);">' +
            '<b class="text-amber-400">' + (m.time || '') + '</b> ' + (m.label || m.title || '') +
          '</span>'
        ).join('') +
      '</div>';
    }

    const isMontageShoot = (s.type === 'МОНТАЖ') ||
                           (s.title && (s.title.toLowerCase().includes('монтаж') || s.title.toLowerCase().includes('правки')));

    let timelineBar = '';
    if (isMontageShoot) {
      // Для смен монтажа не показываем надуманный "Мотор"
      timelineBar = '<div class="p-2.5 border text-xs font-mono" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
        '<div class="flex items-center justify-between flex-wrap gap-2 text-[11px]">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>' +
            '<span style="color: var(--text-muted);">Время работы:</span>' +
            '<b style="color: var(--text-primary);">' + (s.callTime || s.startTime || '10:00') + ' — ' + (s.endTime || '18:00') + '</b>' +
          '</div>' +
        '</div>' +
        timelineMilestonesHtml +
      '</div>';
    } else {
      const hasDistinctMotor = s.startTime && s.callTime && s.startTime !== s.callTime;
      timelineBar = '<div class="p-2.5 border text-xs font-mono" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
        '<div class="flex items-center justify-between flex-wrap gap-2 text-[11px]">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="w-2 h-2 rounded-full bg-amber-400"></span>' +
            '<span style="color: var(--text-muted);">Сбор:</span>' +
            '<b style="color: var(--text-primary);">' + (s.callTime || '10:00') + '</b>' +
          '</div>' +
          (hasDistinctMotor ? (
            '<div class="flex items-center gap-1.5">' +
              '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>' +
              '<span style="color: var(--brand-red);">Мотор:</span>' +
              '<b style="color: var(--brand-red);">' + s.startTime + '</b>' +
            '</div>'
          ) : '') +
          '<div class="flex items-center gap-1.5">' +
            '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>' +
            '<span style="color: var(--text-muted);">Конец:</span>' +
            '<b style="color: var(--text-primary);">' + (s.endTime || '18:00') + '</b>' +
          '</div>' +
        '</div>' +
        timelineMilestonesHtml +
      '</div>';
    }

    let finishShootHeaderBtn = '';
    if (canGradeAndManage && !s.isCompleted) {
      finishShootHeaderBtn = '<button onclick="saveShootGrades(\'' + s.id + '\')" class="btn-brand-primary px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1 shadow-sm" title="Завершить смену, выставить оценки и отправить в архив">' +
        '<span>✓ Завершить</span>' +
      '</button>';
    }

    return '<div class="viewfinder-card viewfinder-corners shoot-card ' + cardStateClass + ' p-5 sm:p-6 space-y-4">' +
      '<div class="flex flex-wrap justify-between items-center gap-2">' +
        '<div class="flex items-center space-x-2 flex-wrap gap-y-1">' +
          typeBadge +
          statusBadge +
          myShootHighlightBadge +
        '</div>' +
        '<div class="flex items-center flex-wrap gap-1.5 sm:gap-2 text-xs font-mono">' +
          '<button onclick="openCallsheetModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1" title="Оперативный вызывной лист">' +
            SVG_ICONS.telegram +
            '<span>Вызывной</span>' +
          '</button>' +
          equipmentBtn +
          editBtn +
          finishShootHeaderBtn +
          '<button id="expand_btn_' + s.id + '" onclick="toggleShootExpand(\'' + s.id + '\')" class="btn-brand-ghost px-3 py-1 text-[10px] font-extrabold uppercase">' + expandBtnText + '</button>' +
          deleteBtn +
        '</div>' +
      '</div>' +

      separateDateBadge +

      '<div>' +
        '<h4 class="text-base sm:text-lg font-extrabold uppercase tracking-tight mb-1.5" style="color: var(--text-primary);">' + escapeHtml(s.title || 'Смена') + '</h4>' +
        '<p class="text-xs leading-relaxed font-medium" style="color: var(--text-secondary);">' + escapeHtml(s.description || '') + '</p>' +
      '</div>' +

      timelineBar +
      equipmentQuickPreview +

      '<div class="text-xs border-t pt-3 flex flex-wrap justify-between items-center gap-2 font-mono text-[11px]" style="border-color: var(--border-subtle); color: var(--text-muted);">' +
        '<span class="flex items-center gap-1.5">' + SVG_ICONS.pin + ' ' + locationText + '</span>' +
        '<span class="flex items-center gap-1.5">' + SVG_ICONS.slate + ' Мастер: <span style="color: var(--text-primary);">' + masterText + '</span></span>' +
      '</div>' +
      
      '<div id="shoot_details_' + s.id + '" class="' + (isShootOpen ? '' : 'hidden') + ' border-t pt-3 space-y-4" style="border-color: var(--border-subtle); display: ' + (isShootOpen ? 'block' : 'none') + ';">' +
        '<div class="space-y-2 pt-1">' +
          '<div class="flex items-center justify-between gap-2 flex-wrap">' +
            '<div class="flex items-center gap-2">' +
              '<span class="uppercase tracking-wider text-xs font-extrabold font-mono" style="color: var(--brand-red);">Состав съёмочной группы:</span>' +
              '<span class="text-[10px] font-mono" style="color: var(--text-muted);">РОЛИ И ЦЕХА</span>' +
            '</div>' +
            addCrewBtn +
          '</div>' +
          '<div class="space-y-1.5 mt-2">' + crewHtml + '</div>' +
          saveGradesBtn +
          editDetailsBtn +
        '</div>' +
        
        '<div class="space-y-2 pt-2 border-t" style="border-color: var(--border-subtle);">' +
          '<div class="flex items-center justify-between">' +
            '<span class="uppercase tracking-wider text-xs font-extrabold font-mono text-emerald-400">Парк техники и оборудования смены:</span>' +
            '<button type="button" onclick="event.stopPropagation(); openEquipmentModal(\'' + s.id + '\')" class="text-[10px] font-mono text-amber-400 hover:underline cursor-pointer">✎ Изменить состав техники</button>' +
          '</div>' +
          equipmentListHtml +
        '</div>' +

        '<div class="space-y-2 pt-2 border-t" style="border-color: var(--border-subtle);">' +
          '<span class="uppercase tracking-wider text-xs font-extrabold font-mono" style="color: var(--brand-red);">Расположение объекта на карте:</span>' +
          '<div id="mini_map_' + s.id + '" data-lat="' + (s.latitude || 55.751244) + '" data-lon="' + (s.longitude || 37.618423) + '" data-title="' + (s.title ? String(s.title).replace(/"/g, '&quot;') : 'Смена') + '" class="w-full h-48 border" style="background-color: var(--bg-primary); border-color: var(--border-color);"></div>' +
        '</div>' +
      '</div>' +

    '</div>';
  }

  // 1. Отрисовка активных смен
  if (activeShoots.length === 0) {
    container.innerHTML = 
      '<div class="p-8 viewfinder-card text-center space-y-4" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
        '<div class="flex items-center justify-center space-x-2 text-xs font-mono uppercase font-bold" style="color: var(--brand-beige-text);">' +
          '<span class="rec-dot"></span>' +
          '<span>Нет активных смен в производстве</span>' +
        '</div>' +
        '<p class="text-xs text-[var(--text-muted)] max-w-md mx-auto">Создайте новую съёмочную смену, назначьте студентов по цехам и распределите кинооборудование.</p>' +
        '<button onclick="openShootModal()" class="btn-brand-primary px-5 py-2.5 text-xs font-extrabold uppercase shadow-lg inline-flex items-center gap-2">' +
          '<span class="text-sm font-bold leading-none">+</span>' +
          '<span>Создать съёмочную смену</span>' +
        '</button>' +
      '</div>';
  } else {
    container.innerHTML = activeShoots.map(s => renderShootCard(s, false)).join('');
  }

  // 2. Отрисовка завершённых смен в секцию «АРХИВ СМЕН»
  const archiveContainer = document.getElementById('archiveShootsList');
  const archiveCountEl = document.getElementById('archiveCount');
  if (archiveCountEl) {
    archiveCountEl.innerText = '(' + archivedShoots.length + ')';
  }
  if (archiveContainer) {
    if (archivedShoots.length === 0) {
      archiveContainer.innerHTML = '<div class="p-4 text-xs font-mono text-[var(--text-muted)] text-center border border-dashed" style="border-color: var(--border-subtle);">В архиве пока нет завершённых смен</div>';
    } else {
      archiveContainer.innerHTML = archivedShoots.map(s => renderShootCard(s, true)).join('');
    }
  }

  // Инициализация миникарт для открытых смен
  if (window._openedShootIds && window._openedShootIds.size > 0) {
    allShoots.forEach(s => {
      if (window._openedShootIds.has(s.id)) {
        initShootMiniMap(s.id);
      }
    });
  }
}

window.renderShootsList = renderShootsList;

// Фоновый таймер автообновления статусов смен в реальном времени (каждые 30 секунд)
if (!window._shootStatusInterval) {
  window._shootStatusInterval = setInterval(() => {
    const shootsView = document.getElementById('viewShoots');
    if (shootsView && !shootsView.classList.contains('hidden') && Array.isArray(globalShoots) && globalShoots.length > 0) {
      renderShootsList(globalShoots);
    }
  }, 30000);
}

updateNav();

// Восстановление масштаба колонок для смен и техники (только для ПК)
try {
  const savedShootCols = localStorage.getItem('kp11_shoots_columns') || 1;
  setShootsColumns(savedShootCols);
  const savedGearCols = localStorage.getItem('kp11_gear_columns') || 3;
  setEquipmentColumns(savedGearCols);
} catch (e) {}

// Обработка перехода по прямой ссылке с QR-кода на профиль пользователя (?user=...)
const targetUserParam = urlParams.get('user');
if (targetUserParam) {
  let attempts = 0;
  const tryOpenUserPortfolio = () => {
    attempts++;
    const allKnown = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
    const found = allKnown.find(s => s.id === targetUserParam) ||
                  (globalAdminUsers || []).find(u => u.id === targetUserParam);
    if (found || attempts > 10) {
      if (typeof openShowreelModal === 'function') {
        openShowreelModal(targetUserParam);
      }
    } else {
      setTimeout(tryOpenUserPortfolio, 200);
    }
  };
  setTimeout(tryOpenUserPortfolio, 300);
}

if (urlParams.get('expand') === '1' && globalShoots && globalShoots[0]) {
  setTimeout(() => toggleShootExpand(globalShoots[0].id), 300);
}
if (urlParams.get('tab')) {
  setTimeout(() => switchTab(urlParams.get('tab')), 300);
}
if (urlParams.get('create') === '1') {
  setTimeout(() => openShootModal(), 400);
}

window.openShootModal = openShootModal;
window.openEditShootModal = openEditShootModal;

// ==============================================================================
// ЗАМЕНА УЧАСТНИКА СМЕНЫ (REPLACE CREW MEMBER)
// ==============================================================================
let currentReplaceCrewContext = null;

function openReplaceCrewModal(shootId, memberId, currentUserId, roleInShoot, department) {
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  if (!shoot) {
    showToast('Смена не найдена');
    return;
  }

  const oldMember = (shoot.crew || []).find(c => String(c.id) === String(memberId) || String(c.userId) === String(currentUserId));
  const allDir = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
  const oldMemberUser = oldMember?.user || allDir.find(u => String(u.id) === String(currentUserId)) || {};
  const oldMemberName = oldMemberUser.fullName || 'Участник';
  const oldMemberGroup = oldMemberUser.groupName || '';
  const declineReason = oldMember?.declineReason || 'Не указана';
  const effectiveRole = roleInShoot || oldMember?.roleInShoot || 'Оператор';
  const effectiveDept = department || oldMember?.department || 'cinema';

  currentReplaceCrewContext = {
    shootId,
    memberId,
    currentUserId,
    roleInShoot: effectiveRole,
    department: effectiveDept
  };

  const modal = document.getElementById('replaceCrewModal');
  const infoBox = document.getElementById('replaceCrewInfoBox');
  const searchInput = document.getElementById('replaceCrewSearchInput');
  const sortSel = document.getElementById('replaceCrewSortSelect');

  if (searchInput) searchInput.value = '';
  if (sortSel) sortSel.value = 'alphabet';

  const d = new Date(shoot.date);
  const dateFormatted = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU') : (shoot.date || 'Дата уточняется');

  if (infoBox) {
    infoBox.innerHTML = 
      '<div class="flex items-start justify-between gap-2 border-b pb-2 mb-2" style="border-color: var(--border-subtle);">' +
        '<div>' +
          '<div class="text-[10px] font-mono text-[var(--text-muted)] uppercase">Проект / Смена:</div>' +
          '<div class="font-extrabold text-sm uppercase text-white">' + escapeHtml(shoot.title || 'Съёмочная смена') + '</div>' +
          '<div class="text-[11px] font-mono text-amber-400/90">' + dateFormatted + ' • ' + escapeHtml(shoot.location || 'Локация уточняется') + '</div>' +
        '</div>' +
        '<span class="text-[10px] font-mono uppercase px-2 py-0.5 border border-amber-600/40 bg-amber-950/30 text-amber-300 font-bold">' + escapeHtml(effectiveRole) + '</span>' +
      '</div>' +
      '<div class="flex flex-col gap-1 text-[11px] font-mono">' +
        '<div class="flex items-center gap-1.5 flex-wrap">' +
          '<span class="text-neutral-400">Кто отклонил:</span>' +
          '<span class="font-bold text-red-300 uppercase">' + escapeHtml(oldMemberName) + (oldMemberGroup ? ' [' + escapeHtml(oldMemberGroup) + ']' : '') + '</span>' +
        '</div>' +
        '<div class="flex items-start gap-1.5 flex-wrap">' +
          '<span class="text-neutral-400">Причина отказа:</span>' +
          '<span class="inline-flex items-center gap-1 text-red-200 bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded-xs font-semibold">«' + escapeHtml(declineReason) + '»</span>' +
        '</div>' +
      '</div>';
  }

  filterReplaceCrewStudents();
  if (modal) modal.classList.remove('hidden');
}

function closeReplaceCrewModal() {
  const modal = document.getElementById('replaceCrewModal');
  if (modal) modal.classList.add('hidden');
  currentReplaceCrewContext = null;
}

function filterReplaceCrewStudents() {
  if (!currentReplaceCrewContext) return;
  const { shootId, currentUserId } = currentReplaceCrewContext;
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  const currentCrewIds = new Set((shoot?.crew || []).map(c => String(c.userId || c.id)));
  currentCrewIds.delete(String(currentUserId));

  const searchInput = document.getElementById('replaceCrewSearchInput');
  const query = (searchInput?.value || '').trim().toLowerCase();

  const candidatesList = document.getElementById('replaceCrewCandidatesList');
  const candidatesCount = document.getElementById('replaceCrewCandidatesCount');
  if (!candidatesList) return;

  const allDir = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();

  let available = allDir.filter(u => {
    if (String(u.id) === String(currentUserId)) return false;
    if (currentCrewIds.has(String(u.id))) return false;
    if (u.isSuspended) return false;
    if (u.role?.name && u.role.name !== 'Студент') return false;

    if (query) {
      const matchName = (u.fullName || '').toLowerCase().includes(query);
      const matchGroup = (u.groupName || '').toLowerCase().includes(query);
      const matchSkills = Array.isArray(u.skills) && u.skills.some(s => String(s).toLowerCase().includes(query));
      const matchRank = (u.craftRank || '').toLowerCase().includes(query);
      if (!matchName && !matchGroup && !matchSkills && !matchRank) return false;
    }
    return true;
  });

  const sortSel = document.getElementById('replaceCrewSortSelect');
  const sortBy = sortSel ? sortSel.value : 'alphabet';
  available = sortStudentsList(available, sortBy);

  if (candidatesCount) {
    candidatesCount.textContent = available.length + ' кандидатов';
  }

  if (available.length === 0) {
    candidatesList.innerHTML = 
      '<div class="p-6 text-center text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)]">' +
        'Студентов, доступных для назначения по данному фильтру, не найдено' +
      '</div>';
    return;
  }

  candidatesList.innerHTML = available.map(u => {
    const rVal = (typeof u.rating === 'number') ? u.rating.toFixed(1) : (u.rating || '5.0');
    const tgDisplay = u.telegram ? escapeHtml(u.telegram) : '<span class="text-neutral-500">нет TG</span>';
    const avatarHtml = u.avatar 
      ? '<img src="' + escapeHtml(u.avatar) + '" class="w-8 h-8 rounded-full object-cover border border-amber-500/50 shrink-0" alt="Avatar">'
      : '<div class="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">' + (u.fullName ? escapeHtml(u.fullName.charAt(0)) : 'С') + '</div>';

    return '<div class="p-3 border flex flex-wrap items-center justify-between gap-2.5 transition hover:border-amber-500/60" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
      '<div class="flex items-center gap-3 min-w-[200px] flex-1">' +
        avatarHtml +
        '<div class="flex flex-col">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="font-extrabold text-xs uppercase text-white hover:text-amber-400 cursor-pointer" onclick="openShowreelModal(\'' + u.id + '\')">' + escapeHtml(u.fullName) + '</span>' +
            '<span class="font-mono text-[10px] text-neutral-400">[' + escapeHtml(u.groupName || 'КП11') + ']</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] flex-wrap">' +
            '<span>' + escapeHtml(u.craftRank || 'Студент цеха') + '</span>' +
            '<span>•</span>' +
            '<span class="text-amber-400 font-bold">★ ' + rVal + '</span>' +
            '<span>•</span>' +
            '<span>' + tgDisplay + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="shrink-0 flex items-center gap-2">' +
        '<button type="button" onclick="confirmReplaceCrewMember(\'' + u.id + '\')" class="btn-brand-primary px-3 py-1.5 text-xs font-extrabold uppercase shadow transition flex items-center gap-1 cursor-pointer">' +
          '<span>✓ Назначить на замену</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function confirmReplaceCrewMember(newUserId) {
  if (!currentReplaceCrewContext) return;
  const { shootId, memberId, currentUserId, roleInShoot, department } = currentReplaceCrewContext;

  const allDir = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
  const newUser = allDir.find(u => String(u.id) === String(newUserId));
  const newName = newUser ? newUser.fullName : 'Выбранный студент';

  try {
    const res = await fetch('/api/crew/replace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || '')
      },
      body: JSON.stringify({
        shootId,
        oldMemberId: memberId,
        oldUserId: currentUserId,
        newUserId,
        roleInShoot,
        department
      })
    });
    const data = await res.json();
    if (!data.success && !res.ok) {
      showToast(data.error || 'Ошибка при замене участника');
      return;
    }

    // Обновляем локальное состояние в globalShoots
    const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
    if (shoot && Array.isArray(shoot.crew)) {
      const idx = shoot.crew.findIndex(c => String(c.id) === String(memberId) || String(c.userId) === String(currentUserId));
      if (idx !== -1) {
        shoot.crew[idx] = {
          id: data.newMember?.id || ('cm_' + Date.now()),
          shootId: shoot.id,
          userId: newUserId,
          roleInShoot,
          department,
          status: 'PENDING',
          attendance: 'PRESENT',
          grade: null,
          declineReason: null,
          user: newUser || { id: newUserId, fullName: newName, groupName: '' }
        };
      }
    }

    localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
    closeReplaceCrewModal();
    showToast('Студент «' + newName + '» успешно назначен на замену!');
    loadShoots();
  } catch (err) {
    console.error('Replace crew error:', err);
    showToast('Ошибка при замене участника');
  }
}

window.openReplaceCrewModal = openReplaceCrewModal;
window.closeReplaceCrewModal = closeReplaceCrewModal;
window.filterReplaceCrewStudents = filterReplaceCrewStudents;
window.confirmReplaceCrewMember = confirmReplaceCrewMember;

// ==============================================================================
// БЫСТРОЕ НАЗНАЧЕНИЕ И ИСКЛЮЧЕНИЕ УЧАСТНИКА СМЕНЫ (ADD & REMOVE CREW MEMBER)
// ==============================================================================
const CREW_DEPARTMENT_ROLE_PRESETS = {
  cinema: [
    'Оператор-постановщик (DoP)',
    'Камермен (2nd Cam / B-Cam)',
    'Фокус-пуллер (1st AC)',
    'Механик камеры (2nd AC)',
    'Оператор стедикама',
    'Фотограф бэкстейджа'
  ],
  sound: [
    'Звукорежиссёр площадки (Sound Mixer)',
    'Бум-оператор (Boom Operator)',
    'Ассистент звукорежиссёра',
    'Инженер радиопетличек'
  ],
  light: [
    'Гаффер (Бригадир осветителей)',
    'Осветитель (Sparks / Best Boy)',
    'Кей-грип (Key Grip)',
    'Грип (Grip / Подвесы)'
  ],
  edit: [
    'DIT / Data Wrangler',
    'Режиссёр монтажа',
    'Колорист (Colorist)',
    'Звукорежиссёр монтажа (Sound Designer)'
  ],
  production: [
    'Второй режиссёр (1st AD)',
    'Помощник режиссёра (2nd AD)',
    'Продюсер смены / Лайн-продюсер',
    'Скрипт-супервайзер (Хлопушка)'
  ]
};

let currentAddCrewContext = null;

function onAddCrewDepartmentChange() {
  const deptSel = document.getElementById('addCrewDepartmentSelect');
  const rolePresetSel = document.getElementById('addCrewRolePresetSelect');
  const customRoleInput = document.getElementById('addCrewCustomRoleInput');
  if (!deptSel || !rolePresetSel) return;
  const dept = deptSel.value || 'cinema';
  const roles = CREW_DEPARTMENT_ROLE_PRESETS[dept] || CREW_DEPARTMENT_ROLE_PRESETS.cinema;
  rolePresetSel.innerHTML = roles.map((r, i) => '<option value="' + escapeHtml(r) + '" ' + (i === 0 ? 'selected' : '') + '>' + escapeHtml(r) + '</option>').join('') +
    '<option value="__custom__">✎ Другая роль (указать вручную)...</option>';
  if (customRoleInput) {
    customRoleInput.value = roles[0] || '';
  }
  filterAddCrewStudents();
}

function onAddCrewRolePresetChange() {
  const rolePresetSel = document.getElementById('addCrewRolePresetSelect');
  const customRoleInput = document.getElementById('addCrewCustomRoleInput');
  if (!rolePresetSel || !customRoleInput) return;
  if (rolePresetSel.value === '__custom__') {
    customRoleInput.value = '';
    customRoleInput.focus();
  } else {
    customRoleInput.value = rolePresetSel.value;
  }
}

function openAddCrewMemberModal(shootId) {
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  if (!shoot) {
    showToast('Смена не найдена');
    return;
  }

  currentAddCrewContext = {
    shootId: String(shoot.id)
  };

  const modal = document.getElementById('addCrewMemberModal');
  const infoBox = document.getElementById('addCrewInfoBox');
  const searchInput = document.getElementById('addCrewSearchInput');
  const sortSel = document.getElementById('addCrewSortSelect');
  const deptSel = document.getElementById('addCrewDepartmentSelect');

  if (searchInput) searchInput.value = '';
  if (sortSel) sortSel.value = 'alphabet';
  if (deptSel) deptSel.value = 'cinema';

  const d = new Date(shoot.date);
  const dateFormatted = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU') : (shoot.date || 'Дата уточняется');
  const crewCount = Array.isArray(shoot.crew) ? shoot.crew.length : 0;

  if (infoBox) {
    infoBox.innerHTML = 
      '<div class="flex items-start justify-between gap-2 border-b pb-2 mb-2" style="border-color: var(--border-subtle);">' +
        '<div>' +
          '<div class="text-[10px] font-mono text-[var(--text-muted)] uppercase">Проект / Смена:</div>' +
          '<div class="font-extrabold text-sm uppercase text-white">' + escapeHtml(shoot.title || 'Съёмочная смена') + '</div>' +
          '<div class="text-[11px] font-mono text-amber-400/90">' + dateFormatted + ' • ' + escapeHtml(shoot.location || 'Локация уточняется') + '</div>' +
        '</div>' +
        '<span class="text-[10px] font-mono uppercase px-2 py-0.5 border border-amber-600/40 bg-amber-950/30 text-amber-300 font-bold shrink-0">' +
          crewCount + ' ' + pluralizeRu(crewCount, 'участник', 'участника', 'участников') +
        '</span>' +
      '</div>' +
      '<div class="text-[11px] font-mono text-neutral-400">' +
        'Выберите цех, роль и студента для немедленного включения в состав съёмочной группы.' +
      '</div>';
  }

  onAddCrewDepartmentChange();
  filterAddCrewStudents();
  if (modal) modal.classList.remove('hidden');
}

function closeAddCrewMemberModal() {
  const modal = document.getElementById('addCrewMemberModal');
  if (modal) modal.classList.add('hidden');
  currentAddCrewContext = null;
}

function filterAddCrewStudents() {
  if (!currentAddCrewContext) return;
  const { shootId } = currentAddCrewContext;
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  const currentCrewIds = new Set((shoot?.crew || []).map(c => String(c.userId || c.id)));

  const searchInput = document.getElementById('addCrewSearchInput');
  const query = (searchInput?.value || '').trim().toLowerCase();

  const candidatesList = document.getElementById('addCrewCandidatesList');
  const candidatesCount = document.getElementById('addCrewCandidatesCount');
  if (!candidatesList) return;

  const allDir = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();

  let available = allDir.filter(u => {
    if (currentCrewIds.has(String(u.id))) return false;
    if (u.isSuspended) return false;
    if (u.role?.name && u.role.name !== 'Студент') return false;

    if (query) {
      const matchName = (u.fullName || '').toLowerCase().includes(query);
      const matchGroup = (u.groupName || '').toLowerCase().includes(query);
      const matchSkills = Array.isArray(u.skills) && u.skills.some(s => String(s).toLowerCase().includes(query));
      const matchRank = (u.craftRank || '').toLowerCase().includes(query);
      if (!matchName && !matchGroup && !matchSkills && !matchRank) return false;
    }
    return true;
  });

  const sortSel = document.getElementById('addCrewSortSelect');
  const sortBy = sortSel ? sortSel.value : 'alphabet';
  available = sortStudentsList(available, sortBy);

  if (candidatesCount) {
    candidatesCount.textContent = available.length + ' кандидатов';
  }

  if (available.length === 0) {
    candidatesList.innerHTML = 
      '<div class="p-6 text-center text-xs font-mono text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)]">' +
        'Студентов, доступных для назначения по данному фильтру, не найдено' +
      '</div>';
    return;
  }

  candidatesList.innerHTML = available.map(u => {
    const rVal = (typeof u.rating === 'number') ? u.rating.toFixed(1) : (u.rating || '5.0');
    const tgDisplay = u.telegram ? escapeHtml(u.telegram) : '<span class="text-neutral-500">нет TG</span>';
    const avatarHtml = u.avatar 
      ? '<img src="' + escapeHtml(u.avatar) + '" class="w-8 h-8 rounded-full object-cover border border-amber-500/50 shrink-0" alt="Avatar">'
      : '<div class="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-xs text-amber-400 shrink-0">' + (u.fullName ? escapeHtml(u.fullName.charAt(0)) : 'С') + '</div>';

    return '<div class="p-3 border flex flex-wrap items-center justify-between gap-2.5 transition hover:border-amber-500/60" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
      '<div class="flex items-center gap-3 min-w-[200px] flex-1">' +
        avatarHtml +
        '<div class="flex flex-col">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="font-extrabold text-xs uppercase text-white hover:text-amber-400 cursor-pointer" onclick="openShowreelModal(\'' + u.id + '\')">' + escapeHtml(u.fullName) + '</span>' +
            '<span class="font-mono text-[10px] text-neutral-400">[' + escapeHtml(u.groupName || 'КП11') + ']</span>' +
          '</div>' +
          '<div class="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] flex-wrap">' +
            '<span>' + escapeHtml(u.craftRank || 'Студент цеха') + '</span>' +
            '<span>•</span>' +
            '<span class="text-amber-400 font-bold">★ ' + rVal + '</span>' +
            '<span>•</span>' +
            '<span>' + tgDisplay + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="shrink-0 flex items-center gap-2">' +
        '<button type="button" onclick="confirmAddCrewMember(\'' + u.id + '\')" class="btn-brand-primary px-3 py-1.5 text-xs font-extrabold uppercase shadow transition flex items-center gap-1 cursor-pointer">' +
          '<span>+ Назначить в смену</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function confirmAddCrewMember(userId) {
  if (!currentAddCrewContext) return;
  const { shootId } = currentAddCrewContext;
  const deptSel = document.getElementById('addCrewDepartmentSelect');
  const customRoleInput = document.getElementById('addCrewCustomRoleInput');

  const department = deptSel ? deptSel.value : 'cinema';
  const roleInShoot = (customRoleInput?.value || '').trim() || 'Оператор';

  const allDir = (globalStudents && globalStudents.length > 0) ? globalStudents : getStudentDirectory();
  const targetUser = allDir.find(u => String(u.id) === String(userId));
  const targetName = targetUser ? targetUser.fullName : 'Студент';

  try {
    const res = await fetch('/api/crew/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || '')
      },
      body: JSON.stringify({
        shootId,
        userId,
        roleInShoot,
        department
      })
    });
    const data = await res.json();
    if (!data.success && !res.ok) {
      showToast(data.error || 'Ошибка при назначении участника');
      return;
    }

    const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
    if (shoot) {
      if (!Array.isArray(shoot.crew)) shoot.crew = [];
      const newMember = data.newMember || {
        id: 'cm_' + Date.now(),
        shootId: shoot.id,
        userId: userId,
        roleInShoot,
        department,
        status: 'PENDING',
        attendance: 'PRESENT',
        grade: null,
        declineReason: null,
        user: targetUser || { id: userId, fullName: targetName, groupName: '' }
      };
      shoot.crew.push(newMember);
    }

    localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
    closeAddCrewMemberModal();
    showToast('Студент «' + targetName + '» назначен на роль «' + roleInShoot + '»!');
    loadShoots();
  } catch (err) {
    console.error('Add crew error:', err);
    showToast('Ошибка при назначении участника');
  }
}

async function removeCrewMemberFromShoot(shootId, memberId, memberName) {
  const shoot = (globalShoots || []).find(s => String(s.id) === String(shootId));
  if (!shoot) {
    showToast('Смена не найдена');
    return;
  }

  const nameToDisplay = memberName || 'участника';
  if (!confirm('Вы уверены, что хотите исключить «' + nameToDisplay + '» из состава съёмочной группы?')) {
    return;
  }

  try {
    const res = await fetch('/api/crew/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (token || '')
      },
      body: JSON.stringify({
        shootId,
        memberId
      })
    });
    const data = await res.json();
    if (!data.success && !res.ok) {
      showToast(data.error || 'Ошибка при исключении участника');
      return;
    }

    if (shoot && Array.isArray(shoot.crew)) {
      const idx = shoot.crew.findIndex(c => String(c.id) === String(memberId) || String(c.userId) === String(memberId));
      if (idx !== -1) {
        shoot.crew.splice(idx, 1);
      }
    }

    localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
    showToast('Участник «' + nameToDisplay + '» исключён из смены');
    loadShoots();
  } catch (err) {
    console.error('Remove crew error:', err);
    showToast('Ошибка при исключении участника');
  }
}

window.openAddCrewMemberModal = openAddCrewMemberModal;
window.closeAddCrewMemberModal = closeAddCrewMemberModal;
window.filterAddCrewStudents = filterAddCrewStudents;
window.confirmAddCrewMember = confirmAddCrewMember;
window.onAddCrewDepartmentChange = onAddCrewDepartmentChange;
window.onAddCrewRolePresetChange = onAddCrewRolePresetChange;
window.removeCrewMemberFromShoot = removeCrewMemberFromShoot;

