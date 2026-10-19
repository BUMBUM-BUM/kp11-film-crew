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


function getUserRoleName(user) {
  if (!user) return 'Гость';
  if (typeof user.role === 'string') return user.role;
  if (user.role && user.role.name) return user.role.name;
  return 'Студент';
}

function isAdminUser(user) {
  if (!user) return false;
  const r = getUserRoleName(user);
  return r === 'Администратор' || r.includes('Админ');
}

function isMasterUser(user) {
  if (!user) return false;
  const r = getUserRoleName(user);
  return r === 'Мастер / Преподаватель' || r.includes('Мастер') || r.includes('Преподаватель');
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
  matrix: '<svg class="w-3.5 h-3.5 inline-block -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>'
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
  const tabEquipmentBtn = document.getElementById('tabEquipmentBtn');
  const actionContainer = document.getElementById('actionButtonContainer');

  updateThemeButton(document.documentElement.getAttribute('data-theme') || 'dark');

  if (tabPortfolioBtn) {
    tabPortfolioBtn.classList.toggle('hidden', !currentUser);
  }
  if (tabEquipmentBtn) {
    tabEquipmentBtn.classList.toggle('hidden', !isMasterOrAdminUser(currentUser));
  }

  if (currentUser) {
    if (nav) {
      nav.innerHTML = 
        '<div class="flex items-center space-x-2 flex-shrink-0">' +
          '<div class="flex items-center space-x-1.5 px-2.5 py-1.5 border max-w-[190px] sm:max-w-[260px]" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
            '<span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981] flex-shrink-0"></span>' +
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
          '<button onclick="switchTab(\'admin\')" class="btn-brand-beige px-4 py-2 text-xs flex items-center space-x-2 shadow-lg">' +
            '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
            '<span>Панель администрирования</span>' +
          '</button>';
      }
      if (tabAdminBtn) {
        tabAdminBtn.classList.remove('hidden');
        loadAdminPanel();
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

    loadNotifications();
    loadShoots();
    loadCinemaBoard();
    registerPushNotifications();
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
    loadShoots();
    loadCinemaBoard();
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
        'Войдите со своим корпоративным аккаунтом для подтверждения вызовов цехов, оценивания работы на площадке и получения рейтинговых баллов.' +
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
  const isPortfolio = tab === 'portfolio';
  const isEquipment = tab === 'equipment';
  const isAdmin = tab === 'admin';
  const isStats = tab === 'stats';

  if (isPortfolio && !currentUser) {
    showToast('Войдите в систему для просмотра личного портфолио');
    openModal('login');
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

  document.getElementById('tabShootsBtn').className = isShoots ? activeTabClass : baseTabClass;
  document.getElementById('tabMapBtn').className = isMap ? activeTabClass : baseTabClass;
  
  const tabPortBtn = document.getElementById('tabPortfolioBtn');
  if (tabPortBtn) tabPortBtn.className = isPortfolio ? activeTabClass : baseTabClass;

  const tabEqBtn = document.getElementById('tabEquipmentBtn');
  if (tabEqBtn) tabEqBtn.className = isEquipment ? activeTabClass : baseTabClass;

  if (document.getElementById('tabStatsBtn')) {
    document.getElementById('tabStatsBtn').className = isStats ? activeTabClass : baseTabClass;
  }

  const tabAdminBtn = document.getElementById('tabAdminBtn');
  if (tabAdminBtn && !tabAdminBtn.classList.contains('hidden')) {
    tabAdminBtn.className = isAdmin ? activeTabClass : baseTabClass;
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

async function loadInventoryData() {
  try {
    const res = await fetch('/api/inventory');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.inventory)) {
        globalInventory = data.inventory;
      }
    }
  } catch (err) {
    console.warn('Inventory fetch offline, using fallback:', err.message);
  }
  if (!globalInventory || !Array.isArray(globalInventory) || globalInventory.length === 0) {
    try {
      const stored = JSON.parse(localStorage.getItem('kp11_inventory') || '[]');
      globalInventory = Array.isArray(stored) ? stored : [];
    } catch (e) {
      globalInventory = [];
    }
  }
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
let currentShootMilestones = [
  { title: 'Сбор съёмочной группы', time: '10:00' },
  { title: 'Монтаж площадки и света', time: '10:30' },
  { title: 'Мотор / Первый дубль', time: '11:30' },
  { title: 'Шапка / Окончание смены', time: '18:00' }
];

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

// ----------------- УПРАВЛЕНИЕ ТЕХНИКОЙ В МОДАЛЬНОМ ОКНЕ СОЗДАНИЯ СМЕНЫ -----------------
function renderModalEquipment(items = globalInventory, preserveChecks = true) {
  const container = document.getElementById('equipmentCheckboxes');
  if (!container) return;

  const currentChecked = new Set();
  if (preserveChecks) {
    container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
      const id = cb.getAttribute('data-eq-id');
      if (id) currentChecked.add(id);
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

  container.innerHTML = items.map(eq => {
    const avail = hasTiming ? checkEquipmentAvailability(eq.id, targetDate, targetCallTime, targetEndTime) : { status: 'AVAILABLE' };
    const isConflict = avail.status === 'CONFLICT';
    const isReserved = avail.status === 'RESERVED';

    let isChecked = currentChecked.has(eq.id);
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

  const editId = editIdEl ? editIdEl.value.trim() : '';
  const name = nameEl ? nameEl.value.trim() : '';
  const serialNumber = snEl ? snEl.value.trim() : '';
  const category = catEl ? catEl.value : 'Камеры';
  const notes = notesEl ? notesEl.value.trim() : '';

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
    // Создание новой единицы
    const newId = 'eq-' + Date.now();
    const newItem = {
      id: newId,
      name,
      category,
      serialNumber: serialNumber || ('SN-' + Math.floor(100000 + Math.random() * 900000)),
      location: 'Склад техники ЦКТ КП11',
      notes,
      status: 'AVAILABLE',
      signedBy: signer
    };
    globalInventory = [newItem, ...(globalInventory || [])];
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(newItem)
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.inventory)) globalInventory = data.inventory;
      }
    } catch (e) {}
    showToast('Единица техники «' + name + '» добавлена в парк!');
  }

  try {
    localStorage.setItem('kp11_inventory', JSON.stringify(globalInventory));
  } catch (e) {}

  cancelInlineEquipmentForm();
  renderModalEquipment(globalInventory, true);
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
  if (activeEquipmentShootId) {
    renderEquipmentModalTabs(activeEquipmentShootId);
  }
}

function closeEquipmentModal() {
  const modal = document.getElementById('equipmentCheckoutModal');
  if (modal) modal.classList.add('hidden');
}

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
      rating: 4.8,
      completedShoots: 6,
      telegram: '@badikov_dop',
      competencies: { camera: 96, sound: 98, light: 92, edit: 94 },
      skills: ['Log-C', 'Shure SM7B', 'Aputure 300D', 'Sound Design', 'DaVinci Resolve'],
      projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'СПОРТИВНЫЙ РЕПОРТАЖ']
    },
    {
      id: 'u1',
      fullName: 'Ковалев Михаил Алексеевич',
      groupName: 'ФВТ-22',
      rating: 4.7,
      completedShoots: 5,
      telegram: '@mikhail_cam',
      competencies: { camera: 95, sound: 82, light: 88, edit: 96 },
      skills: ['ARRI Master Prime', 'Цветокоррекция', 'Стедикам', 'LUT Pipeline'],
      projects: ['ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'СПОРТИВНЫЙ РЕПОРТАЖ', 'КИНОПРОБЫ']
    },
    {
      id: 'u2',
      fullName: 'Демидов Тимофей Дмитриевич',
      groupName: 'ФВТ-22',
      rating: 4.5,
      completedShoots: 4,
      telegram: '@timofey_light',
      competencies: { camera: 88, sound: 78, light: 94, edit: 80 },
      skills: ['Dedolight', 'Светотеневой рисунок', 'Вольфрам 3200K', 'Электробезопасность'],
      projects: ['ДИПЛОМНЫЙ ПРОЕКТ: КОРОТКИЙ МЕТР «ЭХО»', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
    },
    {
      id: 'u3',
      fullName: 'Гусев Андрей Алексеевич',
      groupName: 'КТ-25',
      rating: 3.5,
      completedShoots: 2,
      telegram: '@andrey_gaffer',
      competencies: { camera: 75, sound: 70, light: 85, edit: 68 },
      skills: ['Гаффер-сетап', 'Рассеиватели', 'Штативы C-Stand'],
      projects: ['ДИПЛОМНЫЙ ПРОЕКТ: КОРОТКИЙ МЕТР «ЭХО»', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
    },
    {
      id: 'u4',
      fullName: 'Соколова Анна Алексеевна',
      groupName: 'КТ-15',
      rating: 4.0,
      completedShoots: 3,
      telegram: '@anna_sound',
      competencies: { camera: 84, sound: 92, light: 75, edit: 86 },
      skills: ['Радиопетлички Sennheiser', 'Микрофонный бум', 'Синхронизация'],
      projects: ['ПОДКАСТ МЕДИАЦЕНТРА КП11 #03']
    },
    {
      id: 'u5',
      fullName: 'Жемчужников Ярослав Станиславович',
      groupName: 'КТ-25',
      rating: 4.5,
      completedShoots: 7,
      telegram: '@yaroslav_dop',
      competencies: { camera: 97, sound: 85, light: 90, edit: 92 },
      skills: ['Оператор-постановщик', 'Фокус-пуллинг', 'ARRI RAW', 'Стедикам'],
      projects: ['ДИПЛОМНЫЙ ПРОЕКТ: КОРОТКИЙ МЕТР «ЭХО»', 'СПОРТИВНЫЙ РЕПОРТАЖ', 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03']
    },
    {
      id: 'u6',
      fullName: 'Шальнева Любовь Игоревна',
      groupName: 'ФТ-21-25',
      rating: 4.7,
      completedShoots: 4,
      telegram: '@lyubov_photo',
      competencies: { camera: 92, sound: 76, light: 89, edit: 90 },
      skills: ['Canon R5', 'Студийный свет', 'Репортаж', 'Lightroom'],
      projects: ['ДИПЛОМНЫЙ ПРОЕКТ: КОРОТКИЙ МЕТР «ЭХО»', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
    },
    {
      id: 'u7',
      fullName: 'Хамуд Юлий Мохамедович',
      groupName: 'КТ-26',
      rating: 4.6,
      completedShoots: 3,
      telegram: '@yuliy_cam',
      competencies: { camera: 91, sound: 80, light: 84, edit: 88 },
      skills: ['Canon C200', 'Стедикам', 'Оптика Prime', 'Полевая съёмка'],
      projects: ['ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
    },
    {
      id: 'u8',
      fullName: 'Журавлев Никита Дмитриевич',
      groupName: 'КТ-21',
      rating: 4.5,
      completedShoots: 3,
      telegram: '@nikita_sound',
      competencies: { camera: 80, sound: 95, light: 75, edit: 85 },
      skills: ['Рекордер Zoom', 'Радиопетлички', 'Шумоподавление', 'Чистовой звук'],
      projects: ['ДИПЛОМНЫЙ ПРОЕКТ: КОРОТКИЙ МЕТР «ЭХО»', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
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

// ----------------- ДОСЬЕ / ШОУРИЛ УЧАСТНИКА (ДЛЯ АДМИНИСТРАТОРА) -----------------
function openShowreelModal(userId) {
  const modal = document.getElementById('showreelModal');
  const container = document.getElementById('showreelContent');
  if (!modal || !container) return;

  const userFromAdmin = (globalAdminUsers || []).find(u => u.id === userId);
  const userFromStudents = (globalStudents || []).find(u => u.id === userId);
  const userFromDir = getStudentDirectory().find(u => u.id === userId);
  const student = userFromAdmin || userFromStudents || userFromDir || (globalStudents && globalStudents[0]) || getStudentDirectory()[0];

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
        '<img src="img/student.jpg" alt="Student" class="w-full h-full object-cover">' +
        '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[7px] font-bold px-1 font-mono">КП11</span>' +
      '</div>' +
      '<div class="min-w-0 flex-grow">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="gaffer-tape-sticker">ДОСЬЕ УЧАСТНИКА // АДМИН-ПАНЕЛЬ</span>' +
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
      '<button onclick="openAdminUserFullEditModal(\'' + student.id + '\'); closeShowreelModal();" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-beige">' +
        '✎ Редактировать профиль' +
      '</button>' +
      '<button onclick="closeShowreelModal()" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-primary">' +
        'Закрыть' +
      '</button>' +
    '</div>';

  modal.classList.remove('hidden');
}

function closeShowreelModal() {
  const modal = document.getElementById('showreelModal');
  if (modal) modal.classList.add('hidden');
}

function openAdminUserDossier(userId) {
  openShowreelModal(userId);
}

// ----------------- ЛИЧНОЕ ПОРТФОЛИО СТУДЕНТА (ВКЛАДКА «МОЁ ПОРТФОЛИО») -----------------
async function loadMyPortfolio() {
  if (!currentUser) return;

  const header = document.getElementById('myPortfolioHeader');
  const radarContainer = document.getElementById('skillsRadarChartContainer');
  const metersContainer = document.getElementById('skillsCompetencyMeters');
  const standardsContainer = document.getElementById('myCktStandardsGrid');
  const filmographyContainer = document.getElementById('myFilmographyList');
  const shootsCountEl = document.getElementById('myShootsCount');
  const qrPreview = document.getElementById('qrPassPreviewContainer');
  const qrInfo = document.getElementById('qrPassInfo');

  const comp = currentUser.competencies || { camera: 95, sound: 92, light: 88, edit: 94 };
  const userRank = getCraftRankBadge(currentUser.completedShoots || 4, currentUser.rating || 4.8);
  const userRating = currentUser.rating !== null && currentUser.rating !== undefined ? currentUser.rating : '4.8';

  if (header) {
    header.innerHTML = '<div class="flex items-center space-x-4">' +
      '<div class="relative w-16 h-16 sm:w-20 sm:h-20 border-2 border-[var(--brand-red)] overflow-hidden shadow-md flex-shrink-0">' +
        '<img src="img/student.jpg" alt="Student" class="w-full h-full object-cover">' +
        '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[8px] font-mono font-bold px-1.5">КП11</span>' +
      '</div>' +
      '<div>' +
        '<div class="flex items-center flex-wrap gap-2 mb-1">' +
          '<span class="gaffer-tape-sticker">ЦИФРОВОЙ ПАСПОРТ СТУДЕНТА // 2026</span>' +
          '<span class="text-[10px] font-mono text-[#229ED9] font-bold">' + (currentUser.telegram || '@student') + '</span>' +
        '</div>' +
        '<h2 class="text-base sm:text-xl font-extrabold uppercase leading-tight" style="color: var(--text-primary);">' + currentUser.fullName + '</h2>' +
        '<div class="flex items-center flex-wrap gap-2 mt-1.5">' +
          '<span class="font-mono text-xs font-bold px-2 py-0.5 border" style="background-color: var(--bg-elevated); border-color: var(--border-color); color: var(--brand-beige-text);">' + (currentUser.groupName || 'КТ-26') + '</span>' +
          '<span class="' + userRank.className + '">' + userRank.icon + ' ' + userRank.title + '</span>' +
          '<span class="text-emerald-400 font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + ' ' + userRating + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="text-left sm:text-right font-mono text-xs text-[var(--text-muted)]">' +
      '<div>ID: <span class="text-[var(--text-primary)] font-bold">' + currentUser.id + '</span></div>' +
      '<div>СТАТУС: <span class="text-emerald-400 font-bold">АКТИВНЫЙ ПРОДАКШН</span></div>' +
    '</div>';
  }

  if (radarContainer) {
    radarContainer.innerHTML = renderSkillsRadarSvg(comp);
  }

  if (metersContainer) {
    metersContainer.innerHTML = '<div class="space-y-1">' +
      '<div class="flex justify-between text-[11px] font-mono font-bold">' +
        '<span>' + SVG_ICONS.camera + ' Операторский цех</span>' +
        '<span class="text-[var(--brand-red)]">' + comp.camera + '%</span>' +
      '</div>' +
      '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + comp.camera + '%;"></div></div>' +
    '</div>' +
    '<div class="space-y-1">' +
      '<div class="flex justify-between text-[11px] font-mono font-bold">' +
        '<span>' + SVG_ICONS.mic + ' Звуковой цех</span>' +
        '<span class="text-amber-400">' + comp.sound + '%</span>' +
      '</div>' +
      '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + comp.sound + '%;"></div></div>' +
    '</div>' +
    '<div class="space-y-1">' +
      '<div class="flex justify-between text-[11px] font-mono font-bold">' +
        '<span>' + SVG_ICONS.light + ' Осветительский цех</span>' +
        '<span class="text-amber-400">' + comp.light + '%</span>' +
      '</div>' +
      '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + comp.light + '%;"></div></div>' +
    '</div>' +
    '<div class="space-y-1">' +
      '<div class="flex justify-between text-[11px] font-mono font-bold">' +
        '<span>' + SVG_ICONS.scissors + ' Монтаж & Цветокоррекция</span>' +
        '<span class="text-emerald-400">' + comp.edit + '%</span>' +
      '</div>' +
      '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + comp.edit + '%;"></div></div>' +
    '</div>';
  }

  let totalFrames = 0, totalGear = 0, totalTime = 0, totalEthics = 0, critCount = 0;
  (globalShoots || []).forEach(sh => {
    if (sh.isCompleted && Array.isArray(sh.crew)) {
      const cm = sh.crew.find(c => c.userId === currentUser.id || c.id === currentUser.id);
      if (cm && cm.cktCriteria) {
        totalFrames += Number(cm.cktCriteria.frames || 5);
        totalGear += Number(cm.cktCriteria.gear || 5);
        totalTime += Number(cm.cktCriteria.time || 5);
        totalEthics += Number(cm.cktCriteria.ethics || 5);
        critCount++;
      }
    }
  });

  const fAvg = critCount > 0 ? (totalFrames / critCount).toFixed(1) : (currentUser.rating || '5.0');
  const gAvg = critCount > 0 ? (totalGear / critCount).toFixed(1) : (currentUser.rating || '5.0');
  const tAvg = critCount > 0 ? (totalTime / critCount).toFixed(1) : (currentUser.rating || '5.0');
  const eAvg = critCount > 0 ? (totalEthics / critCount).toFixed(1) : (currentUser.rating || '5.0');

  if (standardsContainer) {
    standardsContainer.innerHTML = 
      '<div class="p-3 border text-center" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)] block">🎞️ КАДРЫ</span>' +
        '<span class="text-lg font-mono font-extrabold text-amber-400">' + fAvg + '</span>' +
        '<span class="text-[9px] font-mono text-[var(--text-muted)] block">Композиция & фокус</span>' +
      '</div>' +
      '<div class="p-3 border text-center" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)] block">🛡️ ТЕХНИКА</span>' +
        '<span class="text-lg font-mono font-extrabold text-amber-400">' + gAvg + '</span>' +
        '<span class="text-[9px] font-mono text-[var(--text-muted)] block">Бережный чек-аут</span>' +
      '</div>' +
      '<div class="p-3 border text-center" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)] block">⏱️ ВРЕМЯ</span>' +
        '<span class="text-lg font-mono font-extrabold text-amber-400">' + tAvg + '</span>' +
        '<span class="text-[9px] font-mono text-[var(--text-muted)] block">Пунктуальность</span>' +
      '</div>' +
      '<div class="p-3 border text-center" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<span class="text-[10px] font-mono text-[var(--text-muted)] block">🤝 ЭТИКА</span>' +
        '<span class="text-lg font-mono font-extrabold text-amber-400">' + eAvg + '</span>' +
        '<span class="text-[9px] font-mono text-[var(--text-muted)] block">Командный дух</span>' +
      '</div>';
  }

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

  const qrData = 'KP11-PASS:' + currentUser.id + ':' + currentUser.fullName;
  if (qrPreview) {
    qrPreview.innerHTML = renderOfflineQrSvg(qrData, 160);
  }
  if (qrInfo) {
    qrInfo.innerHTML = '<div class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + currentUser.fullName + '</div>' +
      '<div class="text-[11px] text-[var(--brand-beige-text)]">' + (currentUser.groupName || 'КТ-26') + '</div>' +
      '<div class="text-[10px] text-[var(--text-muted)]">ID: KP11-STUDENT-' + currentUser.id + '</div>';
  }
}

function openQrPassModal() {
  if (!currentUser) return;
  const modal = document.getElementById('qrPassModal');
  const nameEl = document.getElementById('qrModalStudentName');
  const groupEl = document.getElementById('qrModalStudentGroup');
  const qrContainer = document.getElementById('qrModalCodeContainer');
  const codeIdEl = document.getElementById('qrModalCodeId');

  if (nameEl) nameEl.innerText = currentUser.fullName;
  if (groupEl) groupEl.innerText = currentUser.groupName || 'КТ-26';
  if (codeIdEl) codeIdEl.innerText = 'ID: KP11-STUDENT-' + currentUser.id;
  if (qrContainer) {
    qrContainer.innerHTML = renderOfflineQrSvg('KP11-PASS:' + currentUser.id + ':' + currentUser.fullName, 240);
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
      statusCardHtml = '<div class="mt-2 p-2 border border-red-800/60 bg-red-950/60 text-[10px] font-mono space-y-1">' +
        '<div class="flex items-center justify-between">' +
          '<span class="text-red-400 font-extrabold animate-pulse">🔴 В ЭФИРЕ (ON AIR)</span>' +
          '<span class="text-white font-bold">' + (currentShoot.callTime || '10:00') + ' - ' + (currentShoot.endTime || '18:00') + '</span>' +
        '</div>' +
        '<div class="truncate text-white font-bold">' + currentShoot.title + '</div>' +
        '<div class="text-[var(--text-muted)] truncate">📍 ' + currentShoot.location + '</div>' +
        (camOperator ? '<div class="text-amber-300 truncate">Ответственный: ' + (camOperator.user ? camOperator.user.fullName : 'Оператор') + '</div>' : '') +
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

    return '<div class="p-3.5 border transition hover:border-[var(--brand-red)]" style="' + borderStyle + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0 flex-1">' +
          '<span class="text-xs font-bold uppercase truncate block" style="color: var(--text-primary);">' + eq.name + '</span>' +
          '<div class="flex items-center gap-1.5 mt-0.5">' +
            '<span class="text-[9px] font-mono px-1 py-0.2 bg-neutral-900 border text-amber-400 font-bold border-neutral-700">S/N: ' + (eq.serialNumber || '—') + '</span>' +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">' + (eq.category || 'Техника') + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" onclick="editInlineEquipmentItem(\'' + eq.id + '\'); switchTab(\'shoots\'); openShootModal();" class="px-2 py-1 text-[10px] font-mono font-bold text-cyan-400 border border-cyan-800/40 bg-cyan-950/20 hover:bg-cyan-900/40 shrink-0">✎ Ред.</button>' +
      '</div>' +
      statusCardHtml +
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
  const ratingEl = document.getElementById('fullEditRating');
  const shootsEl = document.getElementById('fullEditCompletedShoots');
  const camEl = document.getElementById('fullEditCompCamera');
  const sndEl = document.getElementById('fullEditCompSound');
  const ligEl = document.getElementById('fullEditCompLight');
  const edtEl = document.getElementById('fullEditCompEdit');
  const suspEl = document.getElementById('fullEditSuspended');

  if (idEl) idEl.value = user.id;
  if (nameEl) nameEl.value = user.fullName || '';
  if (groupEl) groupEl.value = user.groupName || '';
  if (emailEl) emailEl.value = user.email || '';
  if (roleEl) roleEl.value = (user.role && user.role.name) ? user.role.name : (user.role || 'Студент');
  if (rankEl) rankEl.value = user.craftRank || '';
  if (tgEl) tgEl.value = user.telegram || '';
  if (chatEl) chatEl.value = user.telegramChatId || '';
  if (ratingEl) ratingEl.value = user.rating !== null && user.rating !== undefined ? user.rating : '4.5';
  if (shootsEl) shootsEl.value = user.completedShoots !== undefined ? user.completedShoots : (user.participations || 0);

  const comp = user.competencies || { camera: 85, sound: 85, light: 85, edit: 85 };
  if (camEl) camEl.value = comp.camera || 85;
  if (sndEl) sndEl.value = comp.sound || 85;
  if (ligEl) ligEl.value = comp.light || 85;
  if (edtEl) edtEl.value = comp.edit || 85;
  if (suspEl) suspEl.checked = !!user.isSuspended;

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
  const rating = parseFloat(document.getElementById('fullEditRating').value) || 4.5;
  const completedShoots = parseInt(document.getElementById('fullEditCompletedShoots').value, 10) || 0;
  const competencies = {
    camera: parseInt(document.getElementById('fullEditCompCamera').value, 10) || 85,
    sound: parseInt(document.getElementById('fullEditCompSound').value, 10) || 85,
    light: parseInt(document.getElementById('fullEditCompLight').value, 10) || 85,
    edit: parseInt(document.getElementById('fullEditCompEdit').value, 10) || 85
  };
  const isSuspended = document.getElementById('fullEditSuspended').checked;

  const payload = {
    fullName,
    groupName,
    email,
    role: { name: roleName },
    craftRank,
    telegram: telegram.startsWith('@') ? telegram : ('@' + telegram),
    telegramChatId,
    rating,
    completedShoots,
    competencies,
    isSuspended
  };

  try {
    const res = await fetch('/api/admin/users/' + userId + '/full', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      await fetch('/api/admin/users/' + userId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {}

  const idx = (globalAdminUsers || []).findIndex(u => u.id === userId);
  if (idx !== -1) {
    globalAdminUsers[idx] = { ...globalAdminUsers[idx], ...payload };
  }
  const stIdx = (globalStudents || []).findIndex(s => s.id === userId);
  if (stIdx !== -1) {
    globalStudents[stIdx] = { ...globalStudents[stIdx], ...payload };
  }

  showToast('Профиль участника «' + fullName + '» успешно обновлен!');
  closeAdminUserFullEditModal();
  renderAdminUsers(globalAdminUsers);
}

// ----------------- QR ЧЕК-ИН НА ПЛОЩАДКЕ (ДЛЯ МАСТЕРОВ) -----------------
let activeQrCheckinShootId = null;

function openQrCheckinModal(shootId) {
  activeQrCheckinShootId = shootId;
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  if (!shoot) return;

  const modal = document.getElementById('qrCheckinModal');
  const titleEl = document.getElementById('qrCheckinShootTitle');
  const crewList = document.getElementById('qrCheckinCrewList');
  const inputEl = document.getElementById('qrCheckinInput');

  if (titleEl) titleEl.innerText = shoot.title + ' // ' + shoot.location;
  if (inputEl) inputEl.value = '';

  if (crewList) {
    const crew = shoot.crew || [];
    if (crew.length === 0) {
      crewList.innerHTML = '<div class="text-[11px] font-mono text-[var(--text-muted)] text-center p-2">В смене нет участников</div>';
    } else {
      crewList.innerHTML = crew.map(c => {
        const u = c.user || (globalStudents || []).find(s => s.id === c.userId || s.id === c.id) || { fullName: 'Участник', id: c.userId || c.id };
        const isPresent = c.attendance === 'PRESENT';
        return '<div class="flex items-center justify-between p-2 border" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
          '<div>' +
            '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + u.fullName + '</span>' +
            '<div class="text-[10px] font-mono text-[var(--text-muted)]">' + c.roleInShoot + ' // ID: ' + (u.id || c.id) + '</div>' +
          '</div>' +
          '<button type="button" onclick="handleQrCheckinDirect(\'' + shoot.id + '\', \'' + (u.id || c.id || c.userId) + '\')" class="px-2.5 py-1 text-[10px] font-mono font-bold uppercase transition ' + (isPresent ? 'bg-emerald-600 text-white' : 'btn-brand-ghost text-amber-400') + '">' +
            (isPresent ? '✓ Прибыл' : 'Отметить') +
          '</button>' +
        '</div>';
      }).join('');
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function closeQrCheckinModal() {
  const modal = document.getElementById('qrCheckinModal');
  if (modal) modal.classList.add('hidden');
}

async function handleQrCheckinDirect(shootId, studentId) {
  const shoot = (globalShoots || []).find(s => s.id === shootId);
  if (!shoot) return;

  try {
    await fetch('/api/shoots/' + shootId + '/qr-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ studentId })
    });
  } catch (e) {}

  if (Array.isArray(shoot.crew)) {
    const member = shoot.crew.find(c => c.userId === studentId || c.id === studentId || (c.user && c.user.id === studentId));
    if (member) {
      member.attendance = 'PRESENT';
      member.status = 'ACCEPTED';
      showToast('Участник ' + (member.user ? member.user.fullName : studentId) + ' отмечен на площадке!');
    }
  }
  openQrCheckinModal(shootId);
  renderShootsList(globalShoots);
}

function handleQrCheckinSubmit() {
  const input = document.getElementById('qrCheckinInput');
  const code = input ? input.value.trim() : '';
  if (!code) {
    showToast('Введите ID или отсканируйте QR-пропуск');
    return;
  }
  let studentId = code;
  if (code.startsWith('KP11-PASS:')) {
    const parts = code.split(':');
    studentId = parts[1];
  }
  if (activeQrCheckinShootId) {
    handleQrCheckinDirect(activeQrCheckinShootId, studentId);
  }
}

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
      .filter(s => s.rating !== null && s.rating !== undefined && !s.isSuspended)
      .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
      .slice(0, 10);

    const groupMap = {};
    studentsList.forEach(st => {
      const g = st.groupName || 'КТ-26';
      if (!groupMap[g]) groupMap[g] = { sum: 0, count: 0, participations: 0 };
      if (st.rating) {
        groupMap[g].sum += parseFloat(st.rating);
        groupMap[g].count++;
      }
      groupMap[g].participations += (st.completedShoots || 1);
    });

    const groupsRating = Object.keys(groupMap).map(g => ({
      groupName: g,
      avgRating: groupMap[g].count > 0 ? parseFloat((groupMap[g].sum / groupMap[g].count).toFixed(1)) : 4.5,
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
      totalShoots: Math.max(localShoots.length, (data && data.totalShoots) || 0),
      totalCompleted: Math.max(localCompleted.length, (data && data.totalCompleted) || 0),
      leaders: (data && data.leaders && data.leaders.length >= studentLeaders.length) ? data.leaders : studentLeaders,
      groupsRating: (data && data.groupsRating && data.groupsRating.length >= groupsRating.length) ? data.groupsRating : groupsRating,
      frequentShoots: (data && data.frequentShoots && data.frequentShoots.length > 0) ? data.frequentShoots : frequentShoots
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
      }).join('') || '<p class="text-xs" style="color: var(--text-muted);">Нет данных о лидерах.</p>';
    }

    if (document.getElementById('statCompletedCount')) {
      document.getElementById('statCompletedCount').innerText = data.totalCompleted + ' из ' + data.totalShoots;
    }

    const groupsContainer = document.getElementById('statsGroupsList');
    if (groupsContainer) {
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
      }).join('') || '<p class="text-xs" style="color: var(--text-muted);">Нет данных по группам.</p>';
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
      const localToken = localStorage.getItem('kp11_tg_token') || '';
      const localChat = localStorage.getItem('kp11_tg_chat') || '';

      const effectiveToken = serverToken || localToken;
      const effectiveChat = serverChat || localChat;

      if (document.getElementById('adminBotToken')) {
        document.getElementById('adminBotToken').value = effectiveToken;
      }
      if (document.getElementById('adminDefaultChatId')) {
        document.getElementById('adminDefaultChatId').value = effectiveChat;
      }

      // Если на сервере токен ещё не сохранён, но есть локальный — фоново синхронизируем
      if (!serverToken && localToken) {
        fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
          body: JSON.stringify({ telegramBotToken: localToken, defaultChatId: effectiveChat })
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

  renderAdminUsers(globalAdminUsers);
}

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
  const suspendedCount = allList.filter(u => u.isSuspended).length;

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
      '<div onclick="setAdminRoleFilter(\'SUSPENDED\')" class="cursor-pointer p-3 border transition hover:border-red-500 ' + (currentAdminRoleFilter === 'SUSPENDED' ? 'border-red-500 bg-red-950/20' : 'border-[var(--border-color)] bg-[var(--bg-elevated)]') + '">' +
        '<div class="text-[10px] font-mono uppercase text-red-400">Отстранены</div>' +
        '<div class="text-xl font-extrabold font-mono text-red-500 mt-0.5">' + suspendedCount + '</div>' +
      '</div>' +
    '</div>' +

    '<!-- Фильтр-пилюли и сброс рейтинга -->' +
    '<div class="flex flex-wrap items-center justify-between gap-2.5 p-2.5 border" style="background-color: var(--bg-card); border-color: var(--border-color);">' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
        '<button onclick="setAdminRoleFilter(\'ALL\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'ALL' ? btnActiveClass : btnInactiveClass) + '">Все (' + totalCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'STUDENT\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'STUDENT' ? btnActiveClass : btnInactiveClass) + '">Студенты (' + studentsCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'MASTER\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'MASTER' ? btnActiveClass : btnInactiveClass) + '">Мастера (' + mastersCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'ADMIN\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'ADMIN' ? btnActiveClass : btnInactiveClass) + '">Админы (' + adminsCount + ')</button>' +
        '<button onclick="setAdminRoleFilter(\'SUSPENDED\')" class="px-2.5 py-1 text-[11px] uppercase transition ' + (currentAdminRoleFilter === 'SUSPENDED' ? 'bg-red-700 text-white font-extrabold' : btnInactiveClass) + '">Отстранены (' + suspendedCount + ')</button>' +
      '</div>' +
      '<button onclick="resetAllRatings()" class="px-3 py-1.5 text-[11px] font-extrabold uppercase btn-brand-primary shrink-0" title="Обнулить звёздные оценки всех пользователей">Сбросить весь рейтинг</button>' +
    '</div>' +
  '</div>';

  if (!users || users.length === 0) {
    container.innerHTML = adminTopBar + '<div class="p-8 text-center text-xs font-mono border" style="color: var(--text-muted); border-color: var(--border-subtle);">Пользователи по выбранному фильтру не найдены</div>';
    return;
  }

  container.innerHTML = adminTopBar + users.map(u => {
    const currentRole = u.role && u.role.name ? u.role.name : 'Студент';
    const isMe = currentUser && currentUser.id === u.id;
    const ratingText = u.rating !== null && u.rating !== undefined ? u.rating : '';
    const colorClass = getRatingBadgeColor(u.rating);
    const suspendedText = u.isSuspended ? '<span class="text-red-500 font-extrabold ml-1.5 px-1.5 py-0.5 border border-red-600/50 bg-red-950/30 text-[10px] uppercase font-mono">[ОТСТРАНЁН]</span>' : '';
    const borderClass = u.isSuspended ? 'border-red-600/60 bg-red-950/20' : 'border';
    const rowBg = u.isSuspended ? '' : 'style="background-color: var(--bg-card); border-color: var(--border-color);"';
    
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
      ? '<a href="https://t.me/' + cleanTg.replace(/^@/, '') + '" target="_blank" class="font-mono text-[11px] font-bold px-1.5 py-0.5 border border-[#229ED9]/50 bg-[#229ED9]/10 text-[#229ED9] inline-flex items-center gap-1 hover:underline" title="Открыть профиль Telegram">' + SVG_ICONS.telegram + '<span id="display_tg_' + u.id + '">' + cleanTg + '</span></a>'
      : '<span class="font-mono text-[10px] text-amber-400 border border-amber-500/30 px-1 py-0.5" id="display_tg_' + u.id + '">[TG не указан]</span>';

    let deleteBtn = '';
    if (!isMe) {
      deleteBtn = '<button onclick="deleteUser(\'' + u.id + '\')" class="px-2.5 py-1 text-xs font-extrabold uppercase bg-red-700/80 hover:bg-red-600 text-white transition">Удалить</button>';
    }

    return '<div id="user_row_' + u.id + '" class="flex flex-col md:flex-row md:items-center justify-between p-3.5 gap-3 border ' + borderClass + ' transition" ' + rowBg + '>' +
      '<div id="user_info_' + u.id + '" class="flex-grow">' +
        '<div class="flex items-center flex-wrap gap-x-2 gap-y-1.5">' +
          '<span id="display_name_' + u.id + '" onclick="openAdminUserDossier(\'' + u.id + '\')" class="font-bold text-xs uppercase cursor-pointer hover:underline hover:text-[var(--brand-red)] transition" title="Открыть цифровой паспорт / досье участника">' + u.fullName + '</span> ' +
          roleBadgeTag + ' ' +
          '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[Группа: <span id="display_group_' + u.id + '" style="color: var(--text-secondary);">' + (u.groupName || '—') + '</span>]</span> ' +
          tgBadge + ' ' +
          '<span class="' + colorClass + ' font-mono text-xs inline-flex items-center gap-1">' + SVG_ICONS.star + '<span id="display_rating_' + u.id + '">' + (ratingText !== '' ? ratingText : 'Нет') + '</span></span> ' +
          suspendedText +
        '</div>' +
        '<p class="text-[11px] font-mono mt-1" style="color: var(--text-muted);">' + u.email + (isMe ? ' <span class="text-[var(--brand-beige-text)] font-bold ml-1">(Вы)</span>' : '') + '</p>' +
      '</div>' +
      '<div id="user_edit_form_' + u.id + '" class="hidden flex items-center space-x-2 flex-grow flex-wrap gap-y-2">' +
        '<input type="text" id="edit_name_' + u.id + '" value="' + u.fullName.replace(/"/g, '&quot;') + '" class="studio-input px-2 py-1 text-xs" placeholder="ФИО">' +
        '<input type="text" id="edit_group_' + u.id + '" value="' + (u.groupName || '') + '" class="studio-input px-2 py-1 text-xs w-24" placeholder="Группа">' +
        '<div class="flex items-center gap-1">' +
          '<span class="text-[#229ED9] text-xs font-mono font-bold">@</span>' +
          '<input type="text" id="edit_tg_' + u.id + '" value="' + (cleanTg.replace(/^@/, '')) + '" class="studio-input px-2 py-1 text-xs w-36 font-mono text-[#229ED9]" placeholder="username">' +
        '</div>' +
        '<input type="number" min="0" max="5" step="0.1" id="edit_rating_' + u.id + '" value="' + (ratingText !== '' ? ratingText : '') + '" class="studio-input px-2 py-1 text-xs w-20 font-mono" placeholder="Рейтинг">' +
        '<button onclick="saveUserProfile(\'' + u.id + '\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-xs font-extrabold uppercase transition">Сохранить</button>' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', false)" class="btn-brand-ghost px-2 py-1 text-xs font-extrabold uppercase">Отмена</button>' +
      '</div>' +
      '<div class="flex items-center space-x-2 flex-wrap gap-y-2" id="user_actions_' + u.id + '">' +
        '<button onclick="openAdminUserDossier(\'' + u.id + '\')" class="px-2 py-1 text-xs font-extrabold uppercase btn-brand-ghost" title="Посмотреть досье и радар компетенций">Досье</button>' +
        '<button onclick="openAdminUserFullEditModal(\'' + u.id + '\')" class="px-2.5 py-1 text-xs font-extrabold uppercase btn-brand-beige" title="Полное редактирование всех параметров и компетенций">✎ Все поля</button>' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', true)" class="px-2.5 py-1 text-xs font-extrabold uppercase btn-brand-ghost">Изменить</button>' +
        '<select onchange="changeUserRole(\'' + u.id + '\', this.value)" class="studio-input px-2 py-1 text-xs font-bold">' +
          '<option value="Студент" ' + (currentRole === 'Студент' ? 'selected' : '') + '>Студент</option>' +
          '<option value="Мастер / Преподаватель" ' + (currentRole === 'Мастер / Преподаватель' ? 'selected' : '') + '>Мастер</option>' +
          '<option value="Администратор" ' + (currentRole === 'Администратор' ? 'selected' : '') + '>Администратор</option>' +
        '</select>' +
        (!isMe ? '<button onclick="toggleSuspend(\'' + u.id + '\', ' + (!u.isSuspended) + ')" class="px-2.5 py-1 text-xs font-extrabold uppercase transition ' + (u.isSuspended ? 'bg-emerald-600 text-white' : 'btn-brand-primary') + '">' +
          (u.isSuspended ? 'Восстановить' : 'Отстранить') +
        '</button>' : '') +
        deleteBtn +
      '</div>' +
    '</div>';
  }).join('');
}

function toggleUserEdit(userId, show) {
  const infoBlock = document.getElementById('user_info_' + userId);
  const editBlock = document.getElementById('user_edit_form_' + userId);
  const actionsBlock = document.getElementById('user_actions_' + userId);
  if (infoBlock && editBlock && actionsBlock) {
    infoBlock.classList.toggle('hidden', show);
    editBlock.classList.toggle('hidden', !show);
    actionsBlock.classList.toggle('hidden', show);
  }
}

async function saveUserProfile(userId) {
  const newName = document.getElementById('edit_name_' + userId).value;
  const newGroup = document.getElementById('edit_group_' + userId).value;
  const newRating = document.getElementById('edit_rating_' + userId).value;
  const tgInput = document.getElementById('edit_tg_' + userId) ? document.getElementById('edit_tg_' + userId).value.trim() : '';
  const newTg = tgInput ? (tgInput.startsWith('@') ? tgInput : '@' + tgInput) : '';

  try {
    await fetch('/api/admin/users/' + userId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ 
        fullName: newName, 
        groupName: newGroup, 
        rating: newRating !== '' ? parseFloat(newRating) : null,
        telegram: newTg
      })
    });
  } catch (err) {}

  const user = (globalAdminUsers || []).find(u => u.id === userId);
  if (user) {
    user.fullName = newName;
    user.groupName = newGroup;
    user.rating = newRating !== '' ? parseFloat(newRating) : null;
    user.telegram = newTg;
  }
  const student = (globalStudents || []).find(s => s.id === userId);
  if (student) {
    student.telegram = newTg;
    student.fullName = newName;
    student.groupName = newGroup;
  }
  localStorage.setItem('kp11_admin_users', JSON.stringify(globalAdminUsers));
  showToast('Профиль ' + newName + ' успешно обновлен (Telegram: ' + (newTg || 'не указан') + ')!');
  renderAdminUsers(globalAdminUsers);
}

async function saveTelegramSettings() {
  const tokenInput = document.getElementById('adminBotToken');
  const chatInput = document.getElementById('adminDefaultChatId');
  const botToken = tokenInput ? tokenInput.value.trim() : '';
  const defaultChatId = chatInput ? chatInput.value.trim() : '';

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ telegramBotToken: botToken, defaultChatId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Настройки Telegram-бота успешно сохранены!');
      localStorage.setItem('kp11_tg_token', botToken);
      localStorage.setItem('kp11_tg_chat', defaultChatId);
    } else {
      showToast('Ошибка: ' + (data.error || 'Сбой сохранения'));
    }
  } catch (err) {
    localStorage.setItem('kp11_tg_token', botToken);
    localStorage.setItem('kp11_tg_chat', defaultChatId);
    showToast('Настройки сохранены локально!');
  }
}

async function testTelegramConnection() {
  const statusEl = document.getElementById('tgTestStatus');
  const tokenInput = document.getElementById('adminBotToken');
  const chatInput = document.getElementById('adminDefaultChatId');
  const botToken = tokenInput ? tokenInput.value.trim() : '';
  const chatId = chatInput ? chatInput.value.trim() : '';

  const effectiveToken = botToken || localStorage.getItem('kp11_tg_token');
  const effectiveChat = chatId || localStorage.getItem('kp11_tg_chat');

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
      body: JSON.stringify({ chatId: effectiveChat, token: effectiveToken })
    });
    const data = await res.json();
    if (data.success) {
      statusEl.className = 'text-xs font-mono font-bold text-emerald-400';
      statusEl.innerText = 'Связь установлена! Сообщение доставлено в Telegram.';
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
          const tgRes = await fetch('https://api.telegram.org/bot' + effectiveToken + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: c,
              text: '<b>МЕДИАЦЕНТР КП11 // ТЕСТ СВЯЗИ</b>\n════════════════════════════════════\nТестовое сообщение успешно получено из панели управления киноцеха!',
              parse_mode: 'HTML'
            })
          });
          const tgData = await tgRes.json();
          if (tgData.ok) okCount++;
        } catch (clientErr) {}
      }
      if (okCount > 0) {
        statusEl.className = 'text-xs font-mono font-bold text-emerald-400';
        statusEl.innerText = 'Успешно доставлено в ' + okCount + ' из ' + chats.length + ' чатов!';
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
  
  let filtered = (globalAdminUsers || []).filter(u => {
    const roleName = (u.role && u.role.name) ? u.role.name : 'Студент';
    let matchRole = true;
    if (currentAdminRoleFilter === 'STUDENT') {
      matchRole = roleName === 'Студент';
    } else if (currentAdminRoleFilter === 'MASTER') {
      matchRole = roleName === 'Мастер / Преподаватель';
    } else if (currentAdminRoleFilter === 'ADMIN') {
      matchRole = roleName === 'Администратор';
    } else if (currentAdminRoleFilter === 'SUSPENDED') {
      matchRole = !!u.isSuspended;
    }
    
    if (!matchRole) return false;
    if (!query) return true;
    return (u.fullName && u.fullName.toLowerCase().includes(query)) ||
           (u.email && u.email.toLowerCase().includes(query)) ||
           (u.groupName && u.groupName.toLowerCase().includes(query)) ||
           (u.telegram && u.telegram.toLowerCase().includes(query));
  });

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

async function respondCrew(crewMemberId, status) {
  try {
    await fetch('/api/crew/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ crewMemberId, status })
    });
  } catch (err) {}

  // Fallback update in-memory
  (globalShoots || []).forEach(s => {
    (s.crew || []).forEach(c => {
      if (c.id === crewMemberId) c.status = status;
    });
  });
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
  showToast(status === 'ACCEPTED' ? 'Вызов на смену принят!' : 'Вызов на смену отклонен');
  loadNotifications();
  loadShoots();
}

function getSelectedCrewMap() {
  const map = {};
  const checkboxes = document.querySelectorAll('input[name="studentSelect"]:checked');
  checkboxes.forEach(cb => {
    const select = document.querySelector('select[name="craftRole_' + cb.value + '"]');
    map[cb.value] = select ? select.value : 'Оператор';
  });
  return map;
}

async function openShootModal() {
  const modal = document.getElementById('shootModal');
  if (modal) modal.classList.remove('hidden');

  const todayStr = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('shootDate');
  if (dateEl && !dateEl.value) dateEl.value = todayStr;

  const callEl = document.getElementById('shootCallTime');
  if (callEl && !callEl.value) callEl.value = '10:00';
  const startEl = document.getElementById('shootStartTime');
  if (startEl && !startEl.value) startEl.value = '11:30';
  const endEl = document.getElementById('shootEndTime');
  if (endEl && !endEl.value) endEl.value = '18:00';

  currentShootMilestones = [
    { title: 'Сбор съёмочной группы', time: callEl ? callEl.value : '10:00' },
    { title: 'Монтаж площадки и света', time: '10:30' },
    { title: 'Мотор / Первый дубль', time: startEl ? startEl.value : '11:30' },
    { title: 'Шапка / Окончание смены', time: endEl ? endEl.value : '18:00' }
  ];
  renderShootMilestones();
  await loadLocations();

  const searchInput = document.getElementById('studentSearchModal');
  if (searchInput) searchInput.value = '';
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
  renderModalStudents(globalStudents, false);

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

function renderModalStudents(students, preserveSelections = true) {
  const box = document.getElementById('studentsCheckboxes');
  if (!box) return;

  const currentSelections = preserveSelections ? getSelectedCrewMap() : {};
  const list = Array.isArray(students) ? students : (students && Array.isArray(students.value) ? students.value : []);

  if (list.length === 0) {
    box.innerHTML = '<div class="p-4 text-xs font-mono text-center border border-dashed" style="color: var(--text-muted); border-color: var(--border-color);">Студенты не найдены по запросу</div>';
    return;
  }

  box.innerHTML = list.map(s => {
    const ratingText = s.rating !== null && s.rating !== undefined ? s.rating : 'Нет';
    const colorClass = getRatingBadgeColor(s.rating);
    const isSuspended = !!s.isSuspended;
    const isChecked = currentSelections[s.id] !== undefined;
    const currentRole = currentSelections[s.id] || 'Оператор';

    return '<div class="flex items-center justify-between p-2.5 border text-xs transition ' + (isSuspended ? 'opacity-50' : '') + '" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
      '<label class="flex items-center space-x-2.5 cursor-pointer flex-grow select-none">' +
        '<input type="checkbox" name="studentSelect" value="' + s.id + '" ' + (isChecked ? 'checked' : '') + ' ' + (isSuspended ? 'disabled' : '') + ' class="accent-[var(--brand-red)] w-4 h-4 cursor-pointer">' +
        '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + 
          (s.fullName || 'Без имени') + 
          ' <span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + (s.groupName || 'Группа') + ']</span> ' + 
          '<span class="' + colorClass + ' font-mono inline-flex items-center gap-1">' + (SVG_ICONS?.star || '★') + ' ' + ratingText + '</span>' +
          (isSuspended ? ' <span class="text-red-500 font-mono text-[10px]">[ОТСТРАНЁН]</span>' : '') +
        '</span>' +
      '</label>' +
      '<select name="craftRole_' + s.id + '" class="studio-input text-xs font-bold px-2 py-1 ml-2">' +
        '<option value="Оператор"' + (currentRole === 'Оператор' ? ' selected' : '') + '>Оператор</option>' +
        '<option value="Звукорежиссёр"' + (currentRole === 'Звукорежиссёр' ? ' selected' : '') + '>Звукорежиссёр</option>' +
        '<option value="Осветитель"' + (currentRole === 'Осветитель' ? ' selected' : '') + '>Осветитель</option>' +
        '<option value="Монтажёр"' + (currentRole === 'Монтажёр' ? ' selected' : '') + '>Монтажёр</option>' +
        '<option value="Гаффер"' + (currentRole === 'Гаффер' ? ' selected' : '') + '>Гаффер</option>' +
        '<option value="Режиссёр"' + (currentRole === 'Режиссёр' ? ' selected' : '') + '>Режиссёр</option>' +
        '<option value="Продюсер"' + (currentRole === 'Продюсер' ? ' selected' : '') + '>Продюсер</option>' +
      '</select>' +
    '</div>';
  }).join('');
}

function filterModalStudents() {
  const searchInput = document.getElementById('studentSearchModal');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const list = Array.isArray(globalStudents) ? globalStudents : [];
  if (!query) {
    renderModalStudents(list, true);
    return;
  }
  const filtered = list.filter(s => 
    (s.fullName && s.fullName.toLowerCase().includes(query)) || 
    (s.groupName && s.groupName.toLowerCase().includes(query)) ||
    (s.telegram && s.telegram.toLowerCase().includes(query))
  );
  renderModalStudents(filtered, true);
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
}

async function handleCreateShoot(e) {
  e.preventDefault();
  const checkboxes = document.querySelectorAll('input[name="studentSelect"]:checked');
  const crewAssignments = Array.from(checkboxes).map(cb => {
    const userId = cb.value;
    const select = document.querySelector('select[name="craftRole_' + userId + '"]');
    return { userId, craftRole: select ? select.value : 'Оператор' };
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
  const description = descEl ? descEl.value.trim() : '';
  const type = typeEl ? typeEl.value : 'СТУДИЯ';
  const date = dateEl ? dateEl.value : '';
  const callTime = callEl ? callEl.value : '10:00';
  const startTime = startEl ? startEl.value : '11:30';
  const endTime = endEl ? endEl.value : '18:00';
  const location = locEl ? locEl.value.trim() : '';
  const latitude = parseFloat(latEl ? latEl.value : '55.751244') || 55.751244;
  const longitude = parseFloat(lonEl ? lonEl.value : '37.618423') || 37.618423;

  if (!title) {
    showToast('Укажите название проекта');
    return;
  }
  if (!date) {
    showToast('Укажите дату смены');
    return;
  }
  if (!location) {
    showToast('Укажите адрес или локацию объекта');
    return;
  }

  // Проверка конфликтов техники перед созданием смены
  const selectedEqCheckboxes = Array.from(document.querySelectorAll('#equipmentCheckboxes input[type="checkbox"]:checked'));
  for (const cb of selectedEqCheckboxes) {
    const eqId = cb.getAttribute('data-eq-id');
    const avail = checkEquipmentAvailability(eqId, date, callTime, endTime);
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
    }
  } catch (err) {}

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

  // Дополнительный вызов диспетчеризации вызывного листа в Telegram
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

  showToast('Смена «' + title + '» создана! Вызывной разослан в Telegram');
  closeShootModal();
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

async function saveShootGrades(shootId, crewMemberIds) {
  const target = (globalShoots || []).find(s => s.id === shootId);
  const targetCrew = (target && Array.isArray(target.crew)) ? target.crew : [];
  const memberList = (Array.isArray(crewMemberIds) && crewMemberIds.length > 0) ? crewMemberIds : targetCrew.map(c => c.id);

  const grades = {};
  for (const memberId of memberList) {
    const inputEl = document.getElementById('grade_input_' + memberId);
    if (inputEl) {
      grades[memberId] = parseFloat(inputEl.value) || 5;
    }
  }

  if (target) {
    target.isCompleted = true;
    if (target.crew) {
      target.crew.forEach(m => {
        if (grades[m.id] !== undefined) {
          m.grade = grades[m.id];
        } else if (grades[m.userId] !== undefined) {
          m.grade = grades[m.userId];
        } else if (!m.grade) {
          m.grade = 5;
        }
      });
    }
  }

  try {
    const res = await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token || 'demo-token') },
      body: JSON.stringify({ shootId, grades, shoot: target })
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

  if (typeof recalculateAllStudentRatings === 'function') {
    recalculateAllStudentRatings();
  }

  showToast('Смена завершена! Все оценки утверждены в производственный журнал.');
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

    const framesAvg = critCount > 0 ? (totalFrames / critCount).toFixed(1) : (st.rating || '5.0');
    const gearAvg = critCount > 0 ? (totalGear / critCount).toFixed(1) : (st.rating || '5.0');
    const timeAvg = critCount > 0 ? (totalTime / critCount).toFixed(1) : (st.rating || '5.0');
    const ethicsAvg = critCount > 0 ? (totalEthics / critCount).toFixed(1) : (st.rating || '5.0');

    const rankObj = getCraftRankBadge(st.completedShoots || 0, parseFloat(st.rating) || 5.0);
    const statusText = st.isSuspended ? 'Приостановлен' : 'Активен';

    return [
      `"${(st.fullName || '').replace(/"/g, '""')}"`,
      `"${st.groupName || 'КТ-26'}"`,
      `"${rankObj.title}"`,
      (st.rating !== null && st.rating !== undefined) ? st.rating : '5.0',
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
  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
    fullName: isRegister ? document.getElementById('fullName').value : undefined,
    groupName: isRegister ? document.getElementById('groupName').value : undefined,
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
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

function getDefaultShoots() {
  return [];
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
      shoots = Array.isArray(rawShoots) ? rawShoots : (rawShoots && Array.isArray(rawShoots.value) ? rawShoots.value : []);
      
      if (data.students) {
        const rawStudents = data.students;
        globalStudents = Array.isArray(rawStudents) ? rawStudents : (rawStudents && Array.isArray(rawStudents.value) ? rawStudents.value : []);
      }
      stats = data.stats || { totalShoots: shoots.length, completedShoots: shoots.filter(s => s.isCompleted).length };
      userStats = data.userStats || null;
      try {
        localStorage.setItem('kp11_shoots', JSON.stringify(shoots));
      } catch (e) {}
    } else {
      throw new Error('API fetch status ' + res.status);
    }
  } catch (err) {
    userStats = { rating: 4.8, completedParticipated: 4, totalParticipated: 5 };
    const stored = JSON.parse(localStorage.getItem('kp11_shoots') || 'null');
    if (Array.isArray(stored)) {
      shoots = stored;
    } else {
      shoots = [];
    }
    stats = { totalShoots: shoots.length, completedShoots: shoots.filter(s => s.isCompleted).length };
  }

  globalShoots = shoots;
  loadInventoryData().catch(() => {});
  loadLocations().catch(() => {});
  if (typeof recalculateAllStudentRatings === 'function') {
    recalculateAllStudentRatings();
  }

  try {
    if (document.getElementById('shootCount')) {
      document.getElementById('shootCount').innerText = pluralizeRu(shoots.length, 'смена', 'смены', 'смен');
    }
    if (document.getElementById('globalStatsText')) {
      document.getElementById('globalStatsText').innerText = 'Всего смен: ' + stats.totalShoots + ' | Завершено: ' + stats.completedShoots;
    }

    const sidebar = document.getElementById('sidebarProfile');
    if (currentUser && sidebar) {
      let userRatingText = userStats && userStats.rating !== null && userStats.rating !== undefined ? userStats.rating : 'Нет';
      let completedPart = userStats ? userStats.completedParticipated : 4;
      let totalPart = userStats ? userStats.totalParticipated : 5;
      const userRank = getCraftRankBadge(completedPart, userStats ? userStats.rating : 4.8);
      const userTg = currentUser.telegram || '@badikov_dop';

      sidebar.innerHTML = 
        '<div class="space-y-4">' +
          '<div class="flex items-center space-x-3.5 pb-3 border-b" style="border-color: rgba(0,0,0,0.12);">' +
            '<div class="relative w-16 h-16 overflow-hidden border-2 flex-shrink-0 shadow-md" style="border-color: var(--brand-red);">' +
              '<img src="img/student.jpg" alt="Student" class="w-full h-full object-cover">' +
              '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[7px] font-bold px-1 font-mono">КП11</span>' +
            '</div>' +
            '<div class="min-w-0 flex-grow">' +
              '<div class="flex items-center justify-between mb-1">' +
                '<span class="gaffer-tape-sticker">АККРЕДИТАЦИЯ // 2026</span>' +
                '<span class="text-[8px] font-mono font-bold" style="color: #666;">ROLL: 11-A</span>' +
              '</div>' +
              '<h4 class="font-extrabold text-xs uppercase leading-tight truncate" style="color: #141414;">' + currentUser.fullName + '</h4>' +
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
    }

    renderShootsList(shoots);
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
      badgeClass: 'badge-completed text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>',
      filmMarker: '<span class="film-slate-tag">■ WRAP</span>',
      isLive: false
    };
  }

  const now = new Date();
  const dateStr = (s.date && s.date.includes('T')) ? s.date.split('T')[0] : s.date;
  const callTimeStr = s.callTime || '10:00';
  const startTimeStr = s.startTime || '11:30';
  const endTimeStr = s.endTime || '18:00';

  const callDate = new Date(dateStr + 'T' + callTimeStr + ':00');
  const startDate = new Date(dateStr + 'T' + startTimeStr + ':00');
  const endDate = new Date(dateStr + 'T' + endTimeStr + ':00');

  if (isNaN(callDate.getTime())) {
    return {
      code: 'PLANNED',
      label: 'ЗАПЛАНИРОВАНО',
      badgeClass: 'badge-neutral text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>',
      filmMarker: '<span class="rec-pulse-badge">● СКОРО</span>',
      isLive: false
    };
  }

  if (now < callDate) {
    return {
      code: 'UPCOMING',
      label: 'ОЖИДАНИЕ СБОРА',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-neutral-300 bg-neutral-900 border border-neutral-700',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-neutral-400 border-neutral-700 bg-neutral-900">⏳ СБОР В ' + callTimeStr + '</span>',
      isLive: false
    };
  } else if (now >= callDate && now < startDate) {
    return {
      code: 'CALL_TIME',
      label: 'СБОР ГРУППЫ // ПОДГОТОВКА',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-amber-300 bg-amber-950/70 border border-amber-600',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-amber-300 border-amber-600 bg-amber-950/60 animate-pulse">⚡ ПОДГОТОВКА</span>',
      isLive: false
    };
  } else if (now >= startDate && now <= endDate) {
    return {
      code: 'ON_AIR',
      label: '🔴 ON AIR // ИДЁТ СЪЁМКА',
      badgeClass: 'badge-rec text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-extrabold text-red-400 bg-red-950/90 border border-red-600 shadow-[0_0_12px_rgba(227,6,19,0.6)] animate-pulse',
      dotHtml: '<span class="rec-dot"></span>',
      filmMarker: '<span class="rec-pulse-badge">● ON AIR // 24FPS</span>',
      isLive: true
    };
  } else {
    return {
      code: 'FINISHED_PENDING',
      label: 'ЗАКОНЧЕНА // ОЖИДАЕТ ОЦЕНОК',
      badgeClass: 'text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5 font-mono font-bold text-yellow-300 bg-yellow-950/60 border border-yellow-600',
      dotHtml: '<span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>',
      filmMarker: '<span class="text-[9px] font-mono px-1.5 py-0.5 border text-yellow-300 border-yellow-600 bg-yellow-950/60">🏁 ЗАКОНЧЕНА</span>',
      isLive: false
    };
  }
}

function toggleArchiveShoots() {
  const list = document.getElementById('archiveShootsList');
  const btn = document.getElementById('archiveToggleBtn');
  if (!list) return;
  const isHidden = list.classList.contains('hidden') || list.style.display === 'none';
  if (isHidden) {
    list.classList.remove('hidden');
    list.style.display = 'block';
    if (btn) btn.innerText = 'Скрыть архив ▴';
  } else {
    list.classList.add('hidden');
    list.style.display = 'none';
    if (btn) btn.innerText = 'Показать архив ▾';
  }
}
window.toggleArchiveShoots = toggleArchiveShoots;

// ----------------- ОСНОВНАЯ ФУНКЦИЯ ОТРИСОВКИ СМЕН И АРХИВА -----------------
function renderShootsList(shoots = globalShoots) {
  const container = document.getElementById('shootsList');
  if (!container) return;

  const allShoots = Array.isArray(shoots) ? shoots : [];
  const activeShoots = allShoots.filter(s => !s.isCompleted);
  const archivedShoots = allShoots.filter(s => s.isCompleted);

  // Сортировка для текущего студента: смены, в которых он участвует, идут В САМОМ ВЕРХУ
  if (currentUser) {
    activeShoots.sort((a, b) => {
      const aMine = a.crew && a.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
      const bMine = b.crew && b.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
      if (aMine && !bMine) return -1;
      if (!aMine && bMine) return 1;
      return new Date(a.date) - new Date(b.date);
    });
  }

  const canDeleteShoot = isAdminUser(currentUser) || isMasterUser(currentUser);
  const canGradeAndManage = isMasterUser(currentUser);

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
    const formattedDate = safeFormatDate(s.date);
    const locationText = s.location;
    const masterText = s.creator && s.creator.fullName ? s.creator.fullName : 'Не указан';
    const cardStateClass = s.isCompleted ? 'completed-shoot' : 'active-shoot';
    
    const liveStatus = getShootLiveStatus(s);
    let statusBadge = '<span class="' + liveStatus.badgeClass + '">' + liveStatus.dotHtml + ' ' + liveStatus.label + '</span>';
    let typeBadge = '<span class="badge-neutral text-[10px] px-2 py-0.5 font-mono">' + (s.type || 'СМЕНА') + '</span>';

    const isMeInShoot = currentUser && s.crew && s.crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
    const myShootHighlightBadge = isMeInShoot ? '<span class="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-amber-950/70 border border-amber-600/80 inline-flex items-center gap-1 shadow-sm"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ВЫ В СЪЁМОЧНОЙ ГРУППЕ</span>' : '';

    let deleteBtn = canDeleteShoot ? '<button type="button" data-action="delete-shoot" data-shoot-id="' + s.id + '" onclick="event.stopPropagation(); deleteShoot(\'' + s.id + '\')" class="btn-brand-ghost px-2 py-1 text-[10px] font-extrabold uppercase text-red-500 hover:bg-red-500/10 hover:border-red-500 transition flex items-center gap-1 cursor-pointer" title="Удалить смену"><svg class="w-3 h-3 text-red-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span class="pointer-events-none">Удалить</span></button>' : '';

    // Кнопка QR Чек-ина для мастера/админа
    let qrCheckinBtn = (isMasterOrAdminUser(currentUser) && !s.isCompleted) 
      ? '<button onclick="openQrCheckinModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1 text-cyan-400" title="QR Чек-ин участников на площадке"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M7 17h.01"/><path d="M17 17h.01"/></svg><span>QR Чек-ин</span></button>'
      : '';

    const crewList = s.crew || [];
    let crewHtml = '';
    if (crewList.length === 0) {
      crewHtml = '<div class="p-3 text-xs font-mono text-center border border-dashed" style="color: var(--text-muted); border-color: var(--border-color);">Команда пока не назначена на смену</div>';
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
        let cRating = (actualUser.rating !== null && actualUser.rating !== undefined && actualUser.rating !== 'Нет') ? actualUser.rating : (c.grade ? c.grade : 'Нет');
        let cRatingColor = getRatingBadgeColor(cRating !== 'Нет' ? cRating : null);
        let cRank = getCraftRankBadge(actualUser.participations ? actualUser.participations : (actualUser.completedShoots || 3), typeof cRating === 'number' ? cRating : 4.5);
        
        const isMe = currentUser && (c.userId === currentUser.id || c.id === currentUser.id);
        const rowClassExtra = isMe ? ' student-my-row' : '';
        const myBadge = isMe ? '<span class="student-my-badge">Вы в смене</span>' : '';

        let statusBadgeCrew = '';
        if (c.status === 'ACCEPTED') {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.check + (isMe ? 'Вы подтвердили' : 'Принят') + '</span>';
        } else if (c.status === 'DECLINED') {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.cross + (isMe ? 'Вы отклонили' : 'Отклонил') + '</span>';
        } else {
          statusBadgeCrew = '<span class="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.clock + 'Ожидание</span>';
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

        let competencyMatrixBtn = '';
        if (canGradeAndManage && !s.isCompleted) {
          competencyMatrixBtn = '<button onclick="openCompetencyModal(\'' + s.id + '\', \'' + c.id + '\', \'' + c.roleInShoot + '\', \'' + cUserName.replace(/'/g, "\\'") + '\')" class="btn-brand-ghost px-2 py-0.5 text-[9px] font-extrabold uppercase" title="Оценить по цеховой матрице">Матрица цеха</button>';
        }

        let attendanceSelect = '';
        let starsBlock = '';
        const currentGrade = c.grade !== undefined && c.grade !== null ? c.grade : 5;

        if (canGradeAndManage && !s.isCompleted) {
          let selPresent = c.attendance === 'PRESENT' ? 'selected' : '';
          let selAbsent = c.attendance === 'ABSENT' ? 'selected' : '';
          attendanceSelect = '<select onchange="updateAttendance(\'' + c.id + '\', this.value)" class="studio-input text-xs font-bold px-2 py-0.5 ml-2">' +
            '<option value="PRESENT" ' + selPresent + '>Присутствовал</option>' +
            '<option value="ABSENT" ' + selAbsent + '>Прогул (-0.3 балла)</option>' +
          '</select>';

          if (c.status === 'ACCEPTED') {
            let starsHTML = '';
            for (let i = 1; i <= 5; i++) {
              let isFilled = i <= currentGrade;
              starsHTML += '<span data-star-idx="' + i + '" onclick="setStarRating(\'' + c.id + '\', ' + i + ')" class="rating-star-btn cursor-pointer inline-flex items-center p-0.5 hover:scale-125 transition ' + (isFilled ? 'golden-star-glow opacity-100' : 'opacity-40') + '">' + (isFilled ? SVG_ICONS.star : SVG_ICONS.starEmpty) + '</span>';
            }
            starsBlock = '<div class="flex items-center space-x-1 ml-auto" id="stars_container_' + c.id + '">' +
              '<span class="text-[10px] uppercase font-bold mr-1 font-mono" style="color: var(--text-muted);">Оценка:</span>' +
              starsHTML +
              '<input type="hidden" id="grade_input_' + c.id + '" value="' + currentGrade + '">' +
            '</div>';
          }
        } else {
          const attText = c.attendance === 'ABSENT' ? 'Прогул' : 'Присутствовал';
          const attColor = c.attendance === 'ABSENT' ? '#f87171' : 'var(--text-muted)';
          attendanceSelect = '<span class="text-xs font-bold font-mono" style="color: ' + attColor + ';">' + attText + '</span>';
          if (s.isCompleted || c.grade !== undefined) {
            starsBlock = '<span class="text-xs font-mono font-bold golden-star-glow">★ ' + currentGrade + '</span>';
          }
        }

        let roleClass = 'dept-badge-art';
        let roleSvg = SVG_ICONS.art;
        const rUpper = (c.roleInShoot || '').toUpperCase();
        if (rUpper.includes('ОПЕРАТОР') || rUpper.includes('КИНО') || rUpper.includes('РЕЖИСС')) {
          roleClass = 'dept-badge-cinema';
          roleSvg = SVG_ICONS.camera;
        } else if (rUpper.includes('ЗВУК')) {
          roleClass = 'dept-badge-sound';
          roleSvg = SVG_ICONS.mic;
        } else if (rUpper.includes('ГАФФЕР') || rUpper.includes('СВЕТ') || rUpper.includes('ОСВЕТ')) {
          roleClass = 'dept-badge-light';
          roleSvg = SVG_ICONS.light;
        } else if (rUpper.includes('МОНТАЖ')) {
          roleClass = 'dept-badge-edit';
          roleSvg = SVG_ICONS.scissors;
        }

        // Внимание: имя отображается обычным текстом БЕЗ открытия своего профиля (по указанию пользователя)
        return '<div class="crew-member-row p-3 flex flex-wrap items-center justify-between gap-2' + rowClassExtra + '">' +
          '<div class="flex items-center flex-wrap gap-2">' +
            '<span class="crew-dept-tag ' + roleClass + '"><span class="inline-flex items-center">' + roleSvg + c.roleInShoot + '</span></span>' +
            '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + cUserName + '</span>' +
            '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + cGroupName + ']</span>' +
            myBadge +
            '<span class="' + cRank.className + '">' + cRank.icon + ' ' + cRank.title + '</span>' +
            '<span id="member_rating_' + c.id + '" class="' + cRatingColor + ' font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + cRating + '</span>' +
            statusBadgeCrew +
            manualAcceptBtn +
            competencyMatrixBtn +
          '</div>' +
          '<div class="flex items-center space-x-2 ml-auto">' +
            attendanceSelect +
            starsBlock +
          '</div>' +
        '</div>';
      }).join('');
    }

    let globalGradeControl = '';
    let saveGradesBtn = '';
    if (canGradeAndManage && !s.isCompleted) {
      let globalStarsHTML = '';
      for (let i = 1; i <= 5; i++) {
        globalStarsHTML += '<span onclick="applyGlobalGrade(\'' + s.id + '\', ' + i + ')" class="rating-star-btn golden-star-glow cursor-pointer inline-flex items-center p-1 hover:scale-125 transition" title="Оценить всех на ' + i + '">' + SVG_ICONS.star + '</span>';
      }

      globalGradeControl = '<div class="flex flex-wrap items-center justify-between p-3 border gap-2 mb-2" style="background-color: var(--bg-elevated); border-color: var(--border-color);">' +
        '<span class="text-xs uppercase font-extrabold font-mono" style="color: var(--text-primary);">Быстрая оценка для всех участников:</span>' +
        '<div class="flex space-x-1">' + globalStarsHTML + '</div>' +
      '</div>';
      
      const allMemberIds = crewList.map(c => '\'' + c.id + '\'').join(', ');
      saveGradesBtn = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">' +
        '<button onclick="openCktGradingModal(\'' + s.id + '\')" class="btn-brand-primary py-2.5 text-xs font-extrabold uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5">' +
          '<span>⭐ Оценить по 4 стандартам ЦКТ</span>' +
        '</button>' +
        '<button onclick="saveShootGrades(\'' + s.id + '\', [' + allMemberIds + '])" class="btn-brand-beige py-2.5 text-xs font-extrabold uppercase tracking-wider shadow-md">' +
          'Быстро завершить смену' +
        '</button>' +
      '</div>';
    }

    const equipmentBtn = '<button onclick="openEquipmentModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1 text-emerald-400" title="Техпарк и спецификация оборудования ЦКТ КП11">' +
      '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>' +
      '<span>Оборудование</span>' +
    '</button>';

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

    const timelineBar = '<div class="p-2.5 border text-xs font-mono" style="background-color: var(--bg-primary); border-color: var(--border-subtle);">' +
      '<div class="flex items-center justify-between flex-wrap gap-2 text-[11px]">' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="w-2 h-2 rounded-full bg-amber-400"></span>' +
          '<span style="color: var(--text-muted);">Сбор:</span>' +
          '<b style="color: var(--text-primary);">' + (s.callTime || '10:00') + '</b>' +
        '</div>' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>' +
          '<span style="color: var(--brand-red);">Мотор:</span>' +
          '<b style="color: var(--brand-red);">' + (s.startTime || '11:30') + '</b>' +
        '</div>' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="w-2 h-2 rounded-full bg-emerald-400"></span>' +
          '<span style="color: var(--text-muted);">Конец:</span>' +
          '<b style="color: var(--text-primary);">' + (s.endTime || '18:00') + '</b>' +
        '</div>' +
      '</div>' +
      timelineMilestonesHtml +
    '</div>';

    return '<div class="viewfinder-card viewfinder-corners shoot-card ' + cardStateClass + ' p-5 sm:p-6 space-y-4">' +
      '<div class="flex flex-wrap justify-between items-center gap-2">' +
        '<div class="flex items-center space-x-2 flex-wrap gap-y-1">' +
          typeBadge +
          statusBadge +
          myShootHighlightBadge +
        '</div>' +
        '<div class="flex items-center flex-wrap gap-1.5 sm:gap-2 text-xs font-mono">' +
          '<span class="font-semibold hidden sm:inline" style="color: var(--text-muted);">' + formattedDate + '</span>' +
          '<button onclick="openCallsheetModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1" title="Оперативный вызывной лист">' +
            SVG_ICONS.telegram +
            '<span>Вызывной</span>' +
          '</button>' +
          qrCheckinBtn +
          equipmentBtn +
          '<button id="expand_btn_' + s.id + '" onclick="toggleShootExpand(\'' + s.id + '\')" class="btn-brand-ghost px-3 py-1 text-[10px] font-extrabold uppercase">' + expandBtnText + '</button>' +
          deleteBtn +
        '</div>' +
      '</div>' +

      '<div>' +
        '<h4 class="text-base sm:text-lg font-extrabold uppercase tracking-tight mb-1.5" style="color: var(--text-primary);">' + s.title + '</h4>' +
        '<p class="text-xs leading-relaxed font-medium" style="color: var(--text-secondary);">' + s.description + '</p>' +
      '</div>' +

      timelineBar +

      '<div class="text-xs border-t pt-3 flex flex-wrap justify-between items-center gap-2 font-mono text-[11px]" style="border-color: var(--border-subtle); color: var(--text-muted);">' +
        '<span class="flex items-center gap-1.5">' + SVG_ICONS.pin + ' ' + locationText + '</span>' +
        '<span class="flex items-center gap-1.5">' + SVG_ICONS.slate + ' Мастер: <span style="color: var(--text-primary);">' + masterText + '</span></span>' +
      '</div>' +
      
      '<div id="shoot_details_' + s.id + '" class="' + (isShootOpen ? '' : 'hidden') + ' border-t pt-3 space-y-4" style="border-color: var(--border-subtle); display: ' + (isShootOpen ? 'block' : 'none') + ';">' +
        '<div class="space-y-2 pt-1">' +
          '<div class="flex items-center justify-between">' +
            '<span class="uppercase tracking-wider text-xs font-extrabold font-mono" style="color: var(--brand-red);">Состав съёмочной группы:</span>' +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">ОЦЕНКИ И ПОСЕЩАЕМОСТЬ</span>' +
          '</div>' +
          globalGradeControl +
          '<div class="space-y-1.5 mt-2">' + crewHtml + '</div>' +
          saveGradesBtn +
        '</div>' +
        
        '<div class="space-y-2 pt-2 border-t" style="border-color: var(--border-subtle);">' +
          '<span class="uppercase tracking-wider text-xs font-extrabold font-mono" style="color: var(--brand-red);">Расположение объекта на карте:</span>' +
          '<div id="mini_map_' + s.id + '" data-lat="' + (s.latitude || 55.751244) + '" data-lon="' + (s.longitude || 37.618423) + '" data-title="' + s.title.replace(/"/g, '&quot;') + '" class="w-full h-48 border" style="background-color: var(--bg-primary); border-color: var(--border-color);"></div>' +
        '</div>' +
      '</div>' +

    '</div>';
  }

  // 1. Отрисовка активных смен
  if (activeShoots.length === 0) {
    container.innerHTML = '<div class="p-8 viewfinder-card text-center text-xs uppercase font-mono font-bold" style="color: var(--text-muted);">Нет активных смен в производстве. Все проекты завершены или в архиве.</div>';
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

updateNav();

if (urlParams.get('expand') === '1' && globalShoots && globalShoots[0]) {
  setTimeout(() => toggleShootExpand(globalShoots[0].id), 300);
}
if (urlParams.get('tab')) {
  setTimeout(() => switchTab(urlParams.get('tab')), 300);
}
if (urlParams.get('create') === '1') {
  setTimeout(() => openShootModal(), 400);
}
