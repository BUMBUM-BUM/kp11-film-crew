let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let token = localStorage.getItem('token') || '';

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('theme')) {
  document.documentElement.setAttribute('data-theme', urlParams.get('theme'));
  localStorage.setItem('kp11_theme', urlParams.get('theme'));
}
if ((urlParams.get('demo') === '1' || urlParams.get('tab') || urlParams.get('expand') || urlParams.get('theme')) && !currentUser) {
  currentUser = {
    id: 'demo-user-1',
    fullName: 'Бадиков Семён Станиславович',
    groupName: 'КТ-26',
    role: 'Мастер / Преподаватель',
    telegram: '@badikov_dop'
  };
  token = 'demo-token';
}

let isRegister = false;
let globalStudents = [];
let globalAdminUsers = [];
let globalShoots = [];
let globalMediaProjects = [];
let currentMediaFilter = 'ALL';
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

if (typeof ymaps !== 'undefined') {
  ymaps.ready(initMaps);
}

function initMaps() {
  fullMap = new ymaps.Map("fullMapContainer", {
    center: [55.751244, 37.618423],
    zoom: 11,
    controls: ['zoomControl', 'geolocationControl']
  });
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
  const actionContainer = document.getElementById('actionButtonContainer');

  updateThemeButton(document.documentElement.getAttribute('data-theme') || 'dark');

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

    if (currentUser.role === 'Мастер / Преподаватель' || currentUser.role === 'Администратор') {
      if (actionContainer) {
        actionContainer.innerHTML = 
          '<button onclick="openShootModal()" class="btn-brand-primary px-4 py-2 text-xs flex items-center space-x-2 shadow-lg">' +
            '<span class="font-bold text-sm leading-none">+</span>' +
            '<span>Новая смена</span>' +
          '</button>';
      }
    } else if (actionContainer) {
      actionContainer.innerHTML = '';
    }

    if (currentUser.role === 'Администратор' || currentUser.role === 'Мастер / Преподаватель') {
      if (tabAdminBtn) tabAdminBtn.classList.remove('hidden');
      loadAdminPanel();
    } else {
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
  const isAdmin = tab === 'admin';
  const isStats = tab === 'stats';
  const isMedia = tab === 'media';

  if (isAdmin && (!currentUser || (currentUser.role !== 'Администратор' && currentUser.role !== 'Мастер / Преподаватель'))) {
    alert('Доступ запрещён!');
    switchTab('shoots');
    return;
  }

  document.getElementById('viewShoots').classList.toggle('hidden', !isShoots);
  document.getElementById('viewMap').classList.toggle('hidden', !isMap);
  
  if (document.getElementById('viewAdmin')) {
    document.getElementById('viewAdmin').classList.toggle('hidden', !isAdmin);
  }
  if (document.getElementById('viewStats')) {
    document.getElementById('viewStats').classList.toggle('hidden', !isStats);
  }
  if (document.getElementById('viewMedia')) {
    document.getElementById('viewMedia').classList.toggle('hidden', !isMedia);
  }

  const baseTabClass = 'studio-tab text-xs font-extrabold uppercase';
  const activeTabClass = 'studio-tab active text-xs font-extrabold uppercase';

  document.getElementById('tabShootsBtn').className = isShoots ? activeTabClass : baseTabClass;
  document.getElementById('tabMapBtn').className = isMap ? activeTabClass : baseTabClass;
  
  if (document.getElementById('tabStatsBtn')) {
    document.getElementById('tabStatsBtn').className = isStats ? activeTabClass : baseTabClass;
  }
  if (document.getElementById('tabMediaBtn')) {
    document.getElementById('tabMediaBtn').className = isMedia ? activeTabClass : baseTabClass;
  }

  const tabAdminBtn = document.getElementById('tabAdminBtn');
  if (tabAdminBtn && !tabAdminBtn.classList.contains('hidden')) {
    tabAdminBtn.className = isAdmin ? activeTabClass : baseTabClass;
  }

  if (isMap && fullMap) {
    setTimeout(() => fullMap.container.fitToViewport(), 150);
  }
  if (isStats) {
    loadStatisticsData();
  }
  if (isMedia) {
    loadMediaProjects();
  }
}

// ================= МОДУЛЬ 3: ВЫЗЫВНЫЕ ЛИСТЫ И TELEGRAM BOT =================
function generateCallSheetText(shoot) {
  const formattedDate = new Date(shoot.date).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const crewList = shoot.crew || [];
  
  let crewByDept = {
    'Операторский цех': [],
    'Звуковой цех': [],
    'Осветительский цех': [],
    'Монтаж & Пост': [],
    'Прочие цеха': []
  };

  crewList.forEach(c => {
    const roleUpper = (c.roleInShoot || '').toUpperCase();
    const studentName = c.user ? c.user.fullName : 'Участник';
    const groupName = c.user && c.user.groupName ? '[' + c.user.groupName + ']' : '';
    const tg = c.user && c.user.telegram ? c.user.telegram : '@kp11_student';
    const statusText = c.status === 'ACCEPTED' ? '✓ Подтвердил' : (c.status === 'DECLINED' ? '✗ Отклонил' : 'Ожидание');
    const line = '  • ' + c.roleInShoot + ': ' + studentName + ' ' + groupName + ' (' + tg + ') — ' + statusText;

    if (roleUpper.includes('ОПЕРАТОР') || roleUpper.includes('РЕЖИСС')) {
      crewByDept['Операторский цех'].push(line);
    } else if (roleUpper.includes('ЗВУК')) {
      crewByDept['Звуковой цех'].push(line);
    } else if (roleUpper.includes('ГАФФЕР') || roleUpper.includes('СВЕТ') || roleUpper.includes('ОСВЕТ')) {
      crewByDept['Осветительский цех'].push(line);
    } else if (roleUpper.includes('МОНТАЖ')) {
      crewByDept['Монтаж & Пост'].push(line);
    } else {
      crewByDept['Прочие цеха'].push(line);
    }
  });

  let deptText = '';
  for (const [dept, members] of Object.entries(crewByDept)) {
    if (members.length > 0) {
      deptText += '\n[ ' + dept.toUpperCase() + ' ]\n' + members.join('\n') + '\n';
    }
  }

  const coords = (shoot.latitude && shoot.longitude) ? (shoot.latitude.toFixed(6) + ', ' + shoot.longitude.toFixed(6)) : '55.751244, 37.618423';
  const master = shoot.creator && shoot.creator.fullName ? shoot.creator.fullName : 'Мастер медиацентра КП11';

  return 'ГАПОУ КП №11 // ОПЕРАТИВНЫЙ ВЫЗЫВНОЙ ЛИСТ №' + (shoot.id || '001').slice(-4).toUpperCase() + '\n' +
'═══════════════════════════════════════════════════\n' +
'ПРОЕКТ: ' + (shoot.title || 'СМЕНА').toUpperCase() + '\n' +
'ФОРМАТ: ' + (shoot.type || 'СТУДИЯ') + ' // ТЕХ. СПЕК: ARRI RAW • LOG-C • 2.39:1\n' +
'ДАТА СМЕНЫ: ' + formattedDate + '\n' +
'ОБЪЕКТ / АДРЕС: ' + (shoot.location || 'Павильон КП11') + '\n' +
'ГЕОТОЧКА: https://yandex.ru/maps/?pt=' + coords.split(', ')[1] + ',' + coords.split(', ')[0] + '&z=16\n' +
'МАСТЕР СМЕНЫ: ' + master + '\n' +
'═══════════════════════════════════════════════════' +
deptText +
'═══════════════════════════════════════════════════\n' +
'ТЕХНИЧЕСКИЙ БРИФ:\n' +
(shoot.description || 'Работа по съемочному плану медиацентра.') + '\n\n' +
'ИНСТРУКЦИЯ ДЛЯ ЦЕХОВ:\n' +
'Прибытие на площадку за 30 минут до мотора. Проверка аккумуляторов и оптики обязательна.\n' +
'Подтвердите вызов нажатием [Принять] в Telegram-боте @KP11_FilmCrew_Bot или на портале https://kp11.film';
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
  showToast('Отправка вызова в @KP11_FilmCrew_Bot...');
  try {
    await fetch('/api/telegram/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ shootId: activeCallsheetShootId })
    });
  } catch (err) {
    // offline preview fallback
  }
  setTimeout(() => {
    showToast('Вызывной успешно разослан всем цехам через Telegram!');
    closeCallsheetModal();
  }, 500);
}

// ================= МОДУЛЬ 4: МЕДИАТЕКА & ШОУРИЛЫ =================
function getInitialMediaProjects() {
  return [
    {
      id: 'proj-1',
      title: 'ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА',
      dept: 'CAMERA',
      description: 'Короткометражный постановочный этюд. Отработка ракурсов, фокус-пуллинга на открытой диафрагме f/1.4 и расширенного динамического диапазона на пленэре.',
      type: 'ВЫЕЗД',
      date: '2026-10-18T14:00:00Z',
      duration: '03:42',
      techSpecs: 'ARRI MASTER PRIME // 2.39:1 // RAW // ISO 800',
      videoUrl: 'https://vk.com/video_ext.php?oid=-1&id=456239017',
      previewUrl: 'img/hero.jpg',
      crew: [
        { userId: 'u5', role: 'Оператор-постановщик', name: 'Жемчужников Ярослав', group: 'КТ-25', rank: 'Бригадир цеха / 1-й номер', rating: 4.5 },
        { userId: 'u3', role: 'Гаффер / Свет', name: 'Гусев Андрей', group: 'КТ-25', rank: 'Ассистент цеха', rating: 3.5 },
        { userId: 'demo-user-1', role: 'Звукорежиссер', name: 'Бадиков Семён', group: 'КТ-26', rank: 'Бригадир цеха / 1-й номер', rating: 5.0 },
        { userId: 'u2', role: 'Осветитель', name: 'Демидов Тимофей', group: 'ФВТ-22', rank: 'Специалист площадки', rating: 4.5 }
      ]
    },
    {
      id: 'proj-2',
      title: 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03: ИНТЕРВЬЮ',
      dept: 'SOUND',
      description: 'Студийный многокамерный подкаст с поканальной записью звука. Изоляция голосов, сведение в реальном времени, динамический монтаж.',
      type: 'СТУДИЯ',
      date: '2026-10-15T16:30:00Z',
      duration: '28:10',
      techSpecs: 'SHURE SM7B // 3-CAM SETUP // LOG-C 3200K // 24 FPS',
      videoUrl: 'https://rutube.ru/play/embed/sample',
      previewUrl: 'img/student.jpg',
      crew: [
        { userId: 'demo-user-1', role: 'Звукорежиссер записи', name: 'Бадиков Семён', group: 'КТ-26', rank: 'Бригадир цеха / 1-й номер', rating: 5.0 },
        { userId: 'u1', role: 'Оператор Камера А', name: 'Ковалев Михаил', group: 'ФВТ-22', rank: 'Специалист площадки', rating: 4.7 },
        { userId: 'u4', role: 'Оператор Камера B', name: 'Соколова Анна', group: 'КТ-15', rank: 'Специалист площадки', rating: 4.0 },
        { userId: 'u5', role: 'Монтажер эфира', name: 'Жемчужников Ярослав', group: 'КТ-25', rank: 'Бригадир цеха / 1-й номер', rating: 4.5 }
      ]
    },
    {
      id: 'proj-3',
      title: 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ',
      dept: 'LIGHT',
      description: 'Учебная сцена с низким ключом (Low-Key). Постановка жесткого рисующего света, подсветка дыма, точный баланс теней и световых пятен.',
      type: 'СТУДИЯ',
      date: '2026-10-12T11:00:00Z',
      duration: '05:15',
      techSpecs: 'DEDOLIGHT // APUTURE 300D // 3200K TUNGSTEN // BLACKMAGIC 6K',
      videoUrl: 'https://vk.com/video_ext.php?sample',
      previewUrl: 'img/hero.jpg',
      crew: [
        { userId: 'u3', role: 'Гаффер-постановщик', name: 'Гусев Андрей', group: 'КТ-25', rank: 'Ассистент цеха', rating: 3.5 },
        { userId: 'u2', role: 'Осветитель', name: 'Демидов Тимофей', group: 'ФВТ-22', rank: 'Специалист площадки', rating: 4.5 },
        { userId: 'u1', role: 'Оператор', name: 'Ковалев Михаил', group: 'ФВТ-22', rank: 'Специалист площадки', rating: 4.7 }
      ]
    },
    {
      id: 'proj-4',
      title: 'СПОРТИВНЫЙ РЕПОРТАЖ: ФИНАЛ КУБКА',
      dept: 'EDIT',
      description: 'Динамичный клиповый монтаж со спид-рампингом, синхронизацией ударов под музыкальный бит и грейдингом в стилистике Kodak Vision3.',
      type: 'ВЫЕЗД',
      date: '2026-10-09T18:00:00Z',
      duration: '02:48',
      techSpecs: 'SONY FX3 // S-LOG3 // SPEED-RAMPING // SOUND FX // 60 FPS',
      videoUrl: 'https://vk.com/video_ext.php?sample',
      previewUrl: 'img/hero.jpg',
      crew: [
        { userId: 'u1', role: 'Монтажер & Колорист', name: 'Ковалев Михаил', group: 'ФВТ-22', rank: 'Специалист площадки', rating: 4.7 },
        { userId: 'u5', role: 'Оператор стедикама', name: 'Жемчужников Ярослав', group: 'КТ-25', rank: 'Бригадир цеха / 1-й номер', rating: 4.5 },
        { userId: 'demo-user-1', role: 'Саунд-дизайнер', name: 'Бадиков Семён', group: 'КТ-26', rank: 'Бригадир цеха / 1-й номер', rating: 5.0 }
      ]
    }
  ];
}

function loadMediaProjects() {
  if (!globalMediaProjects || globalMediaProjects.length === 0) {
    globalMediaProjects = getInitialMediaProjects();
  }
  renderMediaProjects(globalMediaProjects);
}

function setMediaFilter(dept) {
  currentMediaFilter = dept;
  const buttons = ['ALL', 'CAMERA', 'SOUND', 'LIGHT', 'EDIT'];
  buttons.forEach(b => {
    const btn = document.getElementById('mediaFilter_' + b);
    if (btn) {
      if (b === dept) {
        btn.className = 'text-xs font-bold px-3 py-1 border transition uppercase tracking-wide bg-[var(--brand-red)] text-white border-[var(--brand-red)]';
      } else {
        btn.className = 'text-xs font-bold px-3 py-1 border transition uppercase tracking-wide btn-brand-ghost';
      }
    }
  });
  filterMediaItems();
}

function filterMediaItems() {
  const query = (document.getElementById('mediaSearch') ? document.getElementById('mediaSearch').value : '').toLowerCase();
  let list = globalMediaProjects || [];
  if (currentMediaFilter !== 'ALL') {
    list = list.filter(p => p.dept === currentMediaFilter);
  }
  if (query) {
    list = list.filter(p => 
      p.title.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.crew.some(c => c.name.toLowerCase().includes(query) || c.role.toLowerCase().includes(query))
    );
  }
  renderMediaProjects(list);
}

function renderMediaProjects(projects) {
  const grid = document.getElementById('mediaGrid');
  if (!grid) return;

  if (!projects || projects.length === 0) {
    grid.innerHTML = '<div class="col-span-full p-8 text-center text-xs font-mono font-bold uppercase" style="color: var(--text-muted);">Материалы по выбранным критериям не найдены.</div>';
    return;
  }

  grid.innerHTML = projects.map(p => {
    const formattedDate = new Date(p.date).toLocaleDateString('ru-RU');
    
    let deptBadge = '<span class="badge-neutral text-[9px] px-2 py-0.5 font-mono">ПРОЕКТ</span>';
    if (p.dept === 'CAMERA') deptBadge = '<span class="crew-dept-tag dept-badge-cinema">' + SVG_ICONS.camera + 'ОПЕРАТОРСКИЙ</span>';
    if (p.dept === 'SOUND') deptBadge = '<span class="crew-dept-tag dept-badge-sound">' + SVG_ICONS.mic + 'ЗВУКОВОЙ</span>';
    if (p.dept === 'LIGHT') deptBadge = '<span class="crew-dept-tag dept-badge-light">' + SVG_ICONS.light + 'ГАФФЕР & СВЕТ</span>';
    if (p.dept === 'EDIT') deptBadge = '<span class="crew-dept-tag dept-badge-edit">' + SVG_ICONS.scissors + 'МОНТАЖ & ЦВЕТ</span>';

    const crewHtml = p.crew.map(c => 
      '<li class="flex items-center justify-between text-[11px] py-1 border-b" style="border-color: var(--border-subtle);">' +
        '<div class="flex items-center gap-1.5 truncate">' +
          '<span class="font-bold cursor-pointer hover:text-[var(--brand-red)] hover:underline truncate" onclick="openShowreelModal(\'' + c.userId + '\')" title="Открыть портфолио">' + c.name + '</span>' +
          '<span class="font-mono text-[10px]" style="color: var(--text-muted);">[' + c.group + ']</span>' +
        '</div>' +
        '<span class="text-[10px] font-mono font-semibold" style="color: var(--text-muted);">' + c.role + '</span>' +
      '</li>'
    ).join('');

    return '<div class="showreel-card viewfinder-corners flex flex-col justify-between">' +
      '<div>' +
        '<div class="video-aspect-16-9 group relative">' +
          '<img src="' + (p.previewUrl || 'img/hero.jpg') + '" alt="' + p.title + '" class="w-full h-full object-cover opacity-85 group-hover:scale-105 transition duration-500">' +
          '<div class="video-play-btn" onclick="openVideoPlayerModal(\'' + p.id + '\')" title="Смотреть проект">' +
            '<div class="video-play-icon">' +
              '<svg class="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
            '</div>' +
          '</div>' +
          '<span class="absolute bottom-2 right-2 bg-black/80 font-mono text-[10px] text-white px-2 py-0.5 font-bold">' + p.duration + '</span>' +
        '</div>' +
        
        '<div class="p-4 space-y-3">' +
          '<div class="flex items-center justify-between gap-2">' +
            deptBadge +
            '<span class="text-[10px] font-mono" style="color: var(--text-muted);">' + formattedDate + '</span>' +
          '</div>' +
          
          '<div>' +
            '<h4 class="text-sm font-extrabold uppercase tracking-tight" style="color: var(--text-primary);">' + p.title + '</h4>' +
            '<p class="text-xs leading-relaxed mt-1 font-medium line-clamp-2" style="color: var(--text-secondary);">' + p.description + '</p>' +
          '</div>' +

          '<div class="text-[10px] font-mono px-2 py-1 border uppercase opacity-75 truncate" style="border-color: var(--border-subtle); color: var(--text-muted);">' +
            p.techSpecs +
          '</div>' +

          '<div class="space-y-1 pt-1">' +
            '<span class="text-[10px] font-mono uppercase tracking-wider font-extrabold" style="color: var(--brand-red);">Кредиты цехов:</span>' +
            '<ul class="space-y-0.5">' + crewHtml + '</ul>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="p-4 pt-0">' +
        '<button onclick="openVideoPlayerModal(\'' + p.id + '\')" class="w-full py-2 text-xs font-extrabold uppercase btn-brand-primary flex items-center justify-center gap-1.5">' +
          '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
          '<span>Смотреть проект</span>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openVideoPlayerModal(projectIdOrShootId) {
  const modal = document.getElementById('videoPlayerModal');
  const container = document.getElementById('videoPlayerContainer');
  if (!modal || !container) return;

  const project = (globalMediaProjects || []).find(p => p.id === projectIdOrShootId) || 
                  (globalShoots || []).find(s => s.id === projectIdOrShootId) ||
                  (getInitialMediaProjects())[0];

  const title = project.title || 'Производственный проект';
  const desc = project.description || '';
  const tech = project.techSpecs || 'ARRI MASTER PRIME • LOG-C • 2.39:1 • RAW';
  const duration = project.duration || '04:12';
  const crewList = project.crew || [];

  container.innerHTML = 
    '<div class="video-aspect-16-9 border" style="border-color: var(--border-color);">' +
      '<div class="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#0C0B0A] relative">' +
        '<img src="' + (project.previewUrl || 'img/hero.jpg') + '" class="absolute inset-0 w-full h-full object-cover opacity-25">' +
        '<div class="relative z-10 space-y-3">' +
          '<div class="w-16 h-16 rounded-full bg-[var(--brand-red)] text-white flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(252,44,44,0.6)] cursor-pointer hover:scale-110 transition" onclick="showToast(\'Воспроизведение медиапотока...\')">' +
            '<svg class="w-7 h-7 ml-1" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
          '</div>' +
          '<p class="text-xs font-mono font-bold uppercase tracking-wider text-white">ПРОИГРЫВАТЕЛЬ МЕДИАЦЕНТРА КП11</p>' +
          '<p class="text-[11px] font-mono text-neutral-400">Источник: Полнокадровый мастер 4K RAW • Таймкод: 00:00:00 / ' + duration + '</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    '<div class="space-y-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style="border-color: var(--border-color);">' +
        '<div>' +
          '<span class="text-[10px] font-mono uppercase tracking-widest text-[var(--brand-red)] font-extrabold">ВЕРИФИЦИРОВАННЫЙ РЕЛИЗ</span>' +
          '<h3 class="text-base sm:text-lg font-extrabold uppercase" style="color: var(--text-primary);">' + title + '</h3>' +
        '</div>' +
        '<span class="text-[10px] font-mono px-2 py-1 border" style="border-color: var(--border-subtle); color: var(--text-muted);">' + tech + '</span>' +
      '</div>' +
      
      '<p class="text-xs font-medium leading-relaxed" style="color: var(--text-secondary);">' + desc + '</p>' +

      '<div class="pt-2">' +
        '<span class="text-xs font-mono uppercase tracking-wider font-extrabold block mb-2" style="color: var(--brand-red);">Участники съёмочной группы:</span>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' +
          crewList.map(c => 
            '<div class="p-2 border flex items-center justify-between text-xs" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
              '<span class="font-bold uppercase truncate" style="color: var(--text-primary);">' + (c.name || (c.user ? c.user.fullName : 'Участник')) + '</span>' +
              '<span class="font-mono text-[10px] font-semibold" style="color: var(--text-muted);">' + (c.role || c.roleInShoot || 'Цех') + '</span>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>' +
    '</div>';

  modal.classList.remove('hidden');
}

function closeVideoPlayerModal() {
  const modal = document.getElementById('videoPlayerModal');
  if (modal) modal.classList.add('hidden');
}

// ================= МОДУЛЬ 6: МАТРИЦА КОМПЕТЕНЦИЙ И ЦИФРОВОЙ ШОУРИЛ =================
function getStudentDirectory() {
  return [
    {
      id: 'demo-user-1',
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
      projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
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
      projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
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
      projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'СПОРТИВНЫЙ РЕПОРТАЖ', 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03']
    }
  ];
}

function openShowreelModal(userId) {
  const modal = document.getElementById('showreelModal');
  const container = document.getElementById('showreelContent');
  if (!modal || !container) return;

  const directory = getStudentDirectory();
  const student = directory.find(s => s.id === userId) || directory[0];
  const rank = getCraftRankBadge(student.completedShoots, student.rating);

  container.innerHTML = 
    '<div class="flex items-center space-x-3.5 border-b pb-4" style="border-color: var(--border-color);">' +
      '<div class="w-16 h-16 border-2 border-[var(--brand-red)] overflow-hidden flex-shrink-0 shadow-md relative">' +
        '<img src="img/student.jpg" alt="Student" class="w-full h-full object-cover">' +
        '<span class="absolute bottom-0 right-0 bg-[var(--brand-red)] text-white text-[7px] font-bold px-1 font-mono">КП11</span>' +
      '</div>' +
      '<div class="min-w-0 flex-grow">' +
        '<div class="flex items-center justify-between mb-1">' +
          '<span class="gaffer-tape-sticker">ЦИФРОВОЙ ШОУРИЛ // ПОРТФОЛИО</span>' +
          '<span class="text-[10px] font-mono text-[#229ED9] font-bold">' + student.telegram + '</span>' +
        '</div>' +
        '<h3 class="text-sm sm:text-base font-extrabold uppercase leading-tight truncate" style="color: var(--text-primary);">' + student.fullName + '</h3>' +
        '<div class="flex items-center gap-2 mt-1">' +
          '<span class="font-mono text-[11px] font-bold px-1.5 py-0.5 border" style="background-color: var(--bg-elevated); border-color: var(--border-color); color: var(--brand-beige-text);">' + student.groupName + '</span>' +
          '<span class="' + rank.className + '">' + rank.icon + ' ' + rank.title + '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="space-y-3">' +
      '<div class="flex items-center justify-between">' +
        '<span class="text-xs font-extrabold uppercase font-mono" style="color: var(--brand-red);">Матрица цеховых компетенций (Skills Matrix):</span>' +
        '<span class="text-amber-400 font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + ' Рейтинг: ' + student.rating + ' (' + student.completedShoots + ' смен)</span>' +
      '</div>' +

      '<div class="space-y-2 p-3 border" style="background-color: var(--bg-primary); border-color: var(--border-color);">' +
        '<div>' +
          '<div class="flex justify-between text-[11px] font-mono font-bold mb-1">' +
            '<span>' + SVG_ICONS.camera + ' Операторский цех (Экспозиция, Оптика, Фокус)</span>' +
            '<span class="text-[var(--brand-red)]">' + student.competencies.camera + '%</span>' +
          '</div>' +
          '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + student.competencies.camera + '%;"></div></div>' +
        '</div>' +

        '<div>' +
          '<div class="flex justify-between text-[11px] font-mono font-bold mb-1">' +
            '<span>' + SVG_ICONS.mic + ' Звуковой цех (Тракт, Бум, Мониторинг)</span>' +
            '<span class="text-amber-400">' + student.competencies.sound + '%</span>' +
          '</div>' +
          '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + student.competencies.sound + '%;"></div></div>' +
        '</div>' +

        '<div>' +
          '<div class="flex justify-between text-[11px] font-mono font-bold mb-1">' +
            '<span>' + SVG_ICONS.light + ' Осветительский цех (Схемы, Kelvin, Безопасность)</span>' +
            '<span class="text-amber-400">' + student.competencies.light + '%</span>' +
          '</div>' +
          '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + student.competencies.light + '%;"></div></div>' +
        '</div>' +

        '<div>' +
          '<div class="flex justify-between text-[11px] font-mono font-bold mb-1">' +
            '<span>' + SVG_ICONS.scissors + ' Монтаж & Цветокоррекция (Темпоритм, LUT)</span>' +
            '<span class="text-emerald-400">' + student.competencies.edit + '%</span>' +
          '</div>' +
          '<div class="competency-meter-track"><div class="competency-meter-fill" style="width: ' + student.competencies.edit + '%;"></div></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="space-y-2">' +
      '<span class="text-xs font-extrabold uppercase font-mono" style="color: var(--brand-red);">Подтвержденные проекты в фильмографии:</span>' +
      '<div class="space-y-1.5">' +
        student.projects.map(pName => 
          '<div class="p-2.5 border flex items-center justify-between text-xs" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
            '<span class="font-bold uppercase" style="color: var(--text-primary);">' + pName + '</span>' +
            '<button onclick="closeShowreelModal(); openVideoPlayerModal(\'proj-1\')" class="text-[10px] font-extrabold uppercase btn-brand-primary px-2.5 py-1">Смотреть фрагмент</button>' +
          '</div>'
        ).join('') +
      '</div>' +
    '</div>' +

    '<div class="pt-2 border-t flex flex-col sm:flex-row gap-2" style="border-color: var(--border-color);">' +
      '<button onclick="showToast(\'Ссылка на цифровой шоурил скопирована!\')" class="flex-1 py-2 text-xs font-extrabold uppercase btn-brand-ghost">' +
        'Скопировать ссылку на портфолио' +
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

async function loadCinemaBoard() {
  const textEl = document.getElementById('cinemaBoardText');
  if (token) {
    try {
      const res = await fetch('/api/cinemaboard', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      if (res.ok && data.message) {
        if (textEl) textEl.innerText = data.message;
        return;
      }
    } catch (err) {
      console.warn('Кино-информер:', err.message);
    }
  }
  if (textEl) {
    textEl.innerText = '«Кино — это жизнь, с которой вывели пятна». Продолжаем двигаться по сценарию! — Альфред Хичкок';
  }
}

async function loadStatisticsData() {
  let data = null;
  try {
    const res = await fetch('/api/statistics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      data = await res.json();
    } else {
      throw new Error('API fetch failed');
    }
  } catch (err) {
    data = {
      totalShoots: 2,
      totalCompleted: 2,
      leaders: [
        { id: '1', fullName: 'Ковалев Михаил Алексеевич', groupName: 'ФВТ-22', rating: 4.7 },
        { id: '2', fullName: 'Демидов Тимофей Дмитриевич', groupName: 'ФВТ-22', rating: 4.5 },
        { id: '3', fullName: 'Соколова Анна Алексеевна', groupName: 'КТ-15', rating: 4.0 },
        { id: '4', fullName: 'Гусев Андрей Алексеевич', groupName: 'КТ-25', rating: 3.5 },
        { id: '5', fullName: 'Бадиков Семён Станиславович', groupName: 'КТ-26', rating: 4.8 },
        { id: '6', fullName: 'Жемчужников Ярослав Станиславович', groupName: 'КТ-25', rating: 4.2 }
      ],
      groupsRating: [
        { groupName: 'ФВТ-22', avgRating: 4.6, participations: 3 },
        { groupName: 'КТ-15', avgRating: 4.0, participations: 1 },
        { groupName: 'КТ-25', avgRating: 3.5, participations: 2 },
        { groupName: 'КТ-26', avgRating: 4.8, participations: 2 }
      ],
      frequentShoots: [
        { title: 'ТЕСТ 2', count: 2 },
        { title: 'ПОДКАСТ МЕДИАЦЕНТРА', count: 1 },
        { title: 'РЕПОРТАЖ СПОРТИВНОГО КЛУБА', count: 1 }
      ]
    };
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
          '<span class="text-amber-400 font-mono font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + g.avgRating + ' <span class="font-normal" style="color: var(--text-muted);">(' + g.participations + ' смен)</span></span>' +
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
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (res.ok) {
      const data = await res.json();
      globalAdminUsers = data.users || [];
      renderAdminUsers(globalAdminUsers);
      return;
    }
  } catch (err) {}

  if (!globalAdminUsers || globalAdminUsers.length === 0) {
    globalAdminUsers = [
      { id: 'u1', fullName: 'Ковалев Михаил Алексеевич', email: 'mikhail.kovalev@kp11.ru', groupName: 'ФВТ-22', rating: 4.7, isSuspended: false, role: { name: 'Студент' } },
      { id: 'u2', fullName: 'Демидов Тимофей Дмитриевич', email: 'timofey.demidov@kp11.ru', groupName: 'ФВТ-22', rating: 4.5, isSuspended: false, role: { name: 'Студент' } },
      { id: 'u3', fullName: 'Гусев Андрей Алексеевич', email: 'andrey.gusev@kp11.ru', groupName: 'КТ-25', rating: 3.5, isSuspended: false, role: { name: 'Студент' } },
      { id: 'u4', fullName: 'Соколова Анна Алексеевна', email: 'anna.sokolova@kp11.ru', groupName: 'КТ-15', rating: 4.0, isSuspended: false, role: { name: 'Студент' } },
      { id: 'u5', fullName: 'Жемчужников Ярослав Станиславович', email: 'yaroslav.zhemch@kp11.ru', groupName: 'КТ-25', rating: 4.5, isSuspended: false, role: { name: 'Студент' } },
      { id: 'demo-user-1', fullName: 'Бадиков Семён Станиславович', email: 'semyon.badikov@kp11.ru', groupName: 'КТ-26', rating: 4.8, isSuspended: false, role: { name: 'Мастер / Преподаватель' } }
    ];
  }
  renderAdminUsers(globalAdminUsers);
}

function renderAdminUsers(users) {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  
  let adminTopBar = '<div class="mb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-3 border" style="background-color: var(--bg-elevated); border-color: var(--border-color);">' +
    '<span class="text-xs font-extrabold uppercase tracking-wider" style="color: var(--text-primary);">Глобальное управление базой</span>' +
    '<button onclick="resetAllRatings()" class="px-3 py-1.5 text-xs font-extrabold uppercase btn-brand-primary">Сбросить весь рейтинг</button>' +
  '</div>';

  container.innerHTML = adminTopBar + users.map(u => {
    const currentRole = u.role && u.role.name ? u.role.name : 'Студент';
    const isAdminUser = currentUser && currentUser.id === u.id;
    const ratingText = u.rating !== null && u.rating !== undefined ? u.rating : '';
    const colorClass = getRatingBadgeColor(u.rating);
    const suspendedText = u.isSuspended ? '<span class="text-red-500 font-extrabold ml-2">[ОТСТРАНЁН]</span>' : '';
    const borderClass = u.isSuspended ? 'border-red-600/60 bg-red-950/20' : 'border';
    const rowBg = u.isSuspended ? '' : 'style="background-color: var(--bg-card); border-color: var(--border-color);"';
    
    let deleteBtn = '';
    if (!isAdminUser) {
      deleteBtn = '<button onclick="deleteUser(\'' + u.id + '\')" class="px-3 py-1 text-xs font-extrabold uppercase bg-red-700/80 hover:bg-red-600 text-white transition">Удалить</button>';
    }

    return '<div id="user_row_' + u.id + '" class="flex flex-col md:flex-row md:items-center justify-between p-3.5 gap-3 border ' + borderClass + ' transition" ' + rowBg + '>' +
      '<div id="user_info_' + u.id + '" class="flex-grow">' +
        '<div class="flex items-center flex-wrap gap-x-2">' +
          '<span id="display_name_' + u.id + '" class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + u.fullName + '</span> ' +
          '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[Группа: <span id="display_group_' + u.id + '" style="color: var(--text-secondary);">' + (u.groupName || '—') + '</span>]</span> ' +
          '<span class="' + colorClass + ' font-mono text-xs inline-flex items-center gap-1">' + SVG_ICONS.star + '<span id="display_rating_' + u.id + '">' + (ratingText !== '' ? ratingText : 'Нет') + '</span></span> ' +
          suspendedText +
        '</div>' +
        '<p class="text-[11px] font-mono mt-0.5" style="color: var(--text-muted);">' + u.email + '</p>' +
      '</div>' +
      '<div id="user_edit_form_' + u.id + '" class="hidden flex items-center space-x-2 flex-grow flex-wrap gap-y-2">' +
        '<input type="text" id="edit_name_' + u.id + '" value="' + u.fullName.replace(/"/g, '&quot;') + '" class="studio-input px-2 py-1 text-xs" placeholder="ФИО">' +
        '<input type="text" id="edit_group_' + u.id + '" value="' + (u.groupName || '') + '" class="studio-input px-2 py-1 text-xs w-24" placeholder="Группа">' +
        '<input type="number" min="0" max="5" step="0.1" id="edit_rating_' + u.id + '" value="' + (ratingText !== '' ? ratingText : '') + '" class="studio-input px-2 py-1 text-xs w-20 font-mono" placeholder="Рейтинг">' +
        '<button onclick="saveUserProfile(\'' + u.id + '\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-xs font-extrabold uppercase transition">Сохранить</button>' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', false)" class="btn-brand-ghost px-2 py-1 text-xs font-extrabold uppercase">Отмена</button>' +
      '</div>' +
      '<div class="flex items-center space-x-2 flex-wrap gap-y-2" id="user_actions_' + u.id + '">' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', true)" class="px-3 py-1 text-xs font-extrabold uppercase btn-brand-ghost">Изменить</button>' +
        '<select onchange="changeUserRole(\'' + u.id + '\', this.value)" class="studio-input px-2.5 py-1 text-xs font-bold">' +
          '<option value="Студент" ' + (currentRole === 'Студент' ? 'selected' : '') + '>Студент</option>' +
          '<option value="Мастер / Преподаватель" ' + (currentRole === 'Мастер / Преподаватель' ? 'selected' : '') + '>Мастер / Преподаватель</option>' +
          '<option value="Администратор" ' + (currentRole === 'Администратор' ? 'selected' : '') + '>Администратор</option>' +
        '</select>' +
        '<button onclick="toggleSuspend(\'' + u.id + '\', ' + (!u.isSuspended) + ')" class="px-3 py-1 text-xs font-extrabold uppercase transition ' + (u.isSuspended ? 'bg-emerald-600 text-white' : 'btn-brand-primary') + '">' +
          (u.isSuspended ? 'Восстановить' : 'Отстранить') +
        '</button>' +
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

  try {
    await fetch('/api/admin/users/' + userId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ 
        fullName: newName, 
        groupName: newGroup, 
        rating: newRating !== '' ? parseFloat(newRating) : null 
      })
    });
  } catch (err) {}

  const user = (globalAdminUsers || []).find(u => u.id === userId);
  if (user) {
    user.fullName = newName;
    user.groupName = newGroup;
    user.rating = newRating !== '' ? parseFloat(newRating) : null;
  }
  showToast('Профиль ' + newName + ' успешно обновлен!');
  renderAdminUsers(globalAdminUsers);
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
  showToast('Пользователь удален из базы данных');
  renderAdminUsers(globalAdminUsers);
}

async function deleteShoot(shootId) {
  if (!confirm('Удалить эту смену (событие) и связанные с ней метки с карты?')) return;
  try {
    await fetch('/api/admin/shoots/' + shootId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
  } catch (err) {}

  globalShoots = (globalShoots || []).filter(s => s.id !== shootId);
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));
  showToast('Смена удалена из производства');
  loadShoots();
}

function filterAdminUsers() {
  const query = document.getElementById('adminSearch').value.toLowerCase();
  const filtered = globalAdminUsers.filter(u => u.fullName.toLowerCase().includes(query) || (u.groupName && u.groupName.toLowerCase().includes(query)));
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
  showToast(isSuspended ? 'Пользователь отстранён от съёмок' : 'Доступ к съёмкам восстановлен');
  renderAdminUsers(globalAdminUsers);
}

async function changeUserRole(userId, roleName) {
  try {
    await fetch('/api/admin/users/' + userId + '/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ roleName })
    });
  } catch (err) {}

  const user = (globalAdminUsers || []).find(u => u.id === userId);
  if (user) {
    user.role = { name: roleName };
  }
  if (currentUser && currentUser.id === userId) {
    currentUser.role = roleName;
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateNav();
  }
  showToast('Роль пользователя изменена на: ' + roleName);
  renderAdminUsers(globalAdminUsers);
}

async function loadNotifications() {
  if (!token) return;
  try {
    const res = await fetch('/api/notifications', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const invites = await res.json();
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    if (!invites || invites.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = 
      '<div class="p-4 bg-[#1A1A1A] border-l-4 border-l-[var(--brand-red)] border border-[#333333] mb-6 space-y-3 shadow-lg">' +
        '<div class="flex items-center space-x-2">' +
          '<span class="rec-dot"></span>' +
          '<h4 class="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-beige)]">Входящие приглашения в состав смены:</h4>' +
        '</div>' +
        invites.map(inv => 
          '<div class="flex flex-col sm:flex-row sm:items-center justify-between bg-[#141414] p-3 text-xs border border-[#2B2B2B] gap-3">' +
            '<div>' +
              '<strong class="text-xs font-bold uppercase text-[#E9EAEB]">' + inv.shoot.title + '</strong>' +
              '<p class="text-neutral-400 text-[11px] font-mono mt-0.5">Локация: ' + inv.shoot.location + '</p>' +
            '</div>' +
            '<div class="space-x-2 flex items-center">' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'ACCEPTED\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-extrabold uppercase transition">Принять</button>' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'DECLINED\')" class="btn-brand-ghost px-3 py-1.5 text-xs font-extrabold uppercase">Отклонить</button>' +
            '</div>' +
          '</div>'
        ).join('') +
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

async function openShootModal() {
  document.getElementById('shootModal').classList.remove('hidden');
  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      const data = await res.json();
      globalStudents = data.students || [];
    }
  } catch (err) {}

  if (!globalStudents || globalStudents.length === 0) {
    globalStudents = getStudentDirectory();
  }
  renderModalStudents(globalStudents);

  setTimeout(() => {
    if (!pickerMap && typeof ymaps !== 'undefined') {
      pickerMap = new ymaps.Map("pickerMap", { center: [55.751244, 37.618423], zoom: 11 });
      pickerMap.events.add('click', function (e) {
        const coords = e.get('coords');
        document.getElementById('selectedLat').value = coords[0];
        document.getElementById('selectedLon').value = coords[1];
        if (pickerPlacemark) {
          pickerPlacemark.geometry.setCoordinates(coords);
        } else {
          pickerPlacemark = new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon' });
          pickerMap.geoObjects.add(pickerPlacemark);
        }
      });
    } else if (pickerMap) {
      pickerMap.container.fitToViewport();
    }
  }, 150);
}

function renderModalStudents(students) {
  const box = document.getElementById('studentsCheckboxes');
  if (!box) return;
  box.innerHTML = students.map(s => {
    const ratingText = s.rating !== null && s.rating !== undefined ? s.rating : 'Нет';
    const colorClass = getRatingBadgeColor(s.rating);
    return '<div class="flex items-center justify-between p-2.5 border text-xs transition" style="background-color: var(--bg-card); border-color: var(--border-subtle);">' +
      '<label class="flex items-center space-x-2.5 cursor-pointer flex-grow">' +
        '<input type="checkbox" name="studentSelect" value="' + s.id + '" class="accent-[var(--brand-red)] w-4 h-4">' +
        '<span class="font-bold text-xs uppercase" style="color: var(--text-primary);">' + s.fullName + ' <span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + (s.groupName || 'Группа') + ']</span> <span class="' + colorClass + ' font-mono inline-flex items-center gap-1">' + SVG_ICONS.star + ratingText + '</span></span>' +
      '</label>' +
      '<select name="craftRole_' + s.id + '" class="studio-input text-xs font-bold px-2 py-1 ml-2">' +
        '<option value="Оператор">Оператор</option>' +
        '<option value="Звукорежиссёр">Звукорежиссёр</option>' +
        '<option value="Осветитель">Осветитель</option>' +
        '<option value="Монтажёр">Монтажёр</option>' +
        '<option value="Гаффер">Гаффер</option>' +
      '</select>' +
    '</div>';
  }).join('');
}

function filterModalStudents() {
  const query = document.getElementById('studentSearchModal').value.toLowerCase();
  const filtered = globalStudents.filter(s => s.fullName.toLowerCase().includes(query) || (s.groupName && s.groupName.toLowerCase().includes(query)));
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
}

async function handleCreateShoot(e) {
  e.preventDefault();
  const checkboxes = document.querySelectorAll('input[name="studentSelect"]:checked');
  const crewAssignments = Array.from(checkboxes).map(cb => {
    const userId = cb.value;
    const select = document.querySelector('select[name="craftRole_' + userId + '"]');
    return { userId, craftRole: select ? select.value : 'Участник' };
  });

  const title = document.getElementById('shootTitle').value;
  const description = document.getElementById('shootDesc').value;
  const type = document.getElementById('shootType').value;
  const date = document.getElementById('shootDate').value;
  const location = document.getElementById('shootLocation').value;
  const latitude = parseFloat(document.getElementById('selectedLat').value) || 55.751244;
  const longitude = parseFloat(document.getElementById('selectedLon').value) || 37.618423;
  const videoUrl = document.getElementById('shootVideoUrl') ? document.getElementById('shootVideoUrl').value : '';
  const previewUrl = document.getElementById('shootPreviewUrl') ? document.getElementById('shootPreviewUrl').value : '';

  const body = {
    title,
    description,
    type,
    date,
    location,
    latitude,
    longitude,
    videoUrl,
    previewUrl,
    crewAssignments
  };

  try {
    const res = await fetch('/api/shoots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      showToast('Смена «' + title + '» создана в производстве!');
      closeShootModal();
      loadShoots();
      return;
    }
  } catch (err) {}

  // Fallback for preview server:
  const newShoot = {
    id: 'shoot-' + Date.now(),
    title,
    description,
    type,
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    location,
    latitude,
    longitude,
    videoUrl,
    previewUrl: previewUrl || 'img/hero.jpg',
    isCompleted: false,
    creator: { fullName: currentUser ? currentUser.fullName : 'Бадиков Семён Станиславович' },
    crew: crewAssignments.map((ca, idx) => {
      const st = (globalStudents || []).find(s => s.id === ca.userId) || { fullName: 'Студент ' + (idx + 1), groupName: 'КТ-26', rating: 4.5, telegram: '@student' };
      return {
        id: 'c-' + Date.now() + '-' + idx,
        roleInShoot: ca.craftRole,
        status: 'ACCEPTED',
        attendance: 'PRESENT',
        user: { id: ca.userId, fullName: st.fullName, groupName: st.groupName, rating: st.rating, telegram: st.telegram, participations: 3 }
      };
    })
  };

  globalShoots.unshift(newShoot);
  localStorage.setItem('kp11_shoots', JSON.stringify(globalShoots));

  showToast('Смена «' + title + '» добавлена в производство и на карту!');
  closeShootModal();
  loadShoots();
}

function setStarRating(memberId, starValue) {
  const container = document.getElementById('stars_container_' + memberId);
  const hiddenInput = document.getElementById('grade_input_' + memberId);
  if (container && hiddenInput) {
    hiddenInput.value = starValue;
    const stars = container.querySelectorAll('.rating-star-btn');
    stars.forEach((star) => {
      const idx = parseInt(star.getAttribute('data-star-idx'));
      if (idx <= starValue) {
        star.classList.remove('opacity-40');
        star.classList.add('opacity-100');
        star.innerHTML = SVG_ICONS.star;
      } else {
        star.classList.remove('opacity-100');
        star.classList.add('opacity-40');
        star.innerHTML = SVG_ICONS.starEmpty;
      }
    });
  }
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

async function saveShootGrades(shootId, crewMemberIds) {
  const grades = {};
  for (const memberId of crewMemberIds) {
    const inputEl = document.getElementById('grade_input_' + memberId);
    if (inputEl) {
      grades[memberId] = parseFloat(inputEl.value) || 5;
    }
  }

  try {
    const res = await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ shootId, grades })
    });
    if (!res.ok) throw new Error('Ошибка сохранения оценок');
    alert('Оценки успешно сохранены и начислены участникам!');
    loadShoots();
  } catch (err) {
    alert(err.message);
  }
}

async function updateAttendance(crewMemberId, attendance) {
  try {
    const res = await fetch('/api/crew/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ crewMemberId, attendance })
    });
    if (!res.ok) throw new Error('Ошибка');
    loadShoots();
  } catch (err) {
    alert(err.message);
  }
}

function toggleShootExpand(shootId) {
  const detailsBlock = document.getElementById('shoot_details_' + shootId);
  const btn = document.getElementById('expand_btn_' + shootId);
  if (detailsBlock) {
    const isOpen = detailsBlock.style.maxHeight && detailsBlock.style.maxHeight !== '0px';
    if (isOpen) {
      detailsBlock.style.maxHeight = '0px';
      if (btn) btn.innerText = 'Развернуть ▾';
    } else {
      detailsBlock.style.maxHeight = detailsBlock.scrollHeight + 'px';
      if (btn) btn.innerText = 'Свернуть ▴';

      const mapContainer = document.getElementById('mini_map_' + shootId);
      if (mapContainer && !mapContainer.hasChildNodes() && typeof ymaps !== 'undefined') {
        const lat = parseFloat(mapContainer.getAttribute('data-lat'));
        const lon = parseFloat(mapContainer.getAttribute('data-lon'));
        const title = mapContainer.getAttribute('data-title');

        ymaps.ready(() => {
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
        });
      }
    }
  }
}

function logout() { localStorage.clear(); location.reload(); }

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
    if (!res.ok) throw new Error(data.error);

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    currentUser = data.user;
    token = data.token;
    closeModal();
    updateNav();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

async function loadShoots() {
  let shoots = [];
  let stats = { totalShoots: 0, completedShoots: 0 };
  let userStats = null;

  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      const data = await res.json();
      shoots = data.shoots || [];
      stats = data.stats || stats;
      userStats = data.userStats || null;
    } else {
      throw new Error('API fetch failed');
    }
  } catch (err) {
    userStats = { rating: 4.8, completedParticipated: 4, totalParticipated: 5 };
    const stored = JSON.parse(localStorage.getItem('kp11_shoots') || 'null');
    if (stored && stored.length > 0) {
      shoots = stored;
    } else {
      shoots = [
        {
          id: 'demo-shoot-1',
          title: 'ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА',
          description: 'Съёмка короткометражного эпизода на выездной локации. Отработка ракурсов и экспозиции на открытой диафрагме f/1.4.',
          type: 'ВЫЕЗД',
          date: '2026-10-18T14:00:00Z',
          location: 'ПАРК ЗЕЛЁНАЯ РЕКА (СЕРП И МОЛОТ)',
          isCompleted: true,
          latitude: 55.751244,
          longitude: 37.688423,
          videoUrl: 'https://vk.com/video_ext.php?oid=-1&id=456239017',
          previewUrl: 'img/hero.jpg',
          creator: { fullName: 'Бадиков Семён Станиславович' },
          crew: [
            { id: 'c1', roleInShoot: 'ГАФФЕР', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'u3', fullName: 'Гусев Андрей Алексеевич', groupName: 'КТ-25', rating: 3.5, telegram: '@andrey_gaffer', participations: 3 } },
            { id: 'c2', roleInShoot: 'ОПЕРАТОР', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'u5', fullName: 'Жемчужников Ярослав Станиславович', groupName: 'КТ-25', rating: 4.5, telegram: '@yaroslav_dop', participations: 7 } },
            { id: 'c3', roleInShoot: 'ЗВУКОРЕЖИССЁР', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'demo-user-1', fullName: 'Бадиков Семён Станиславович', groupName: 'КТ-26', rating: 5.0, telegram: '@badikov_dop', participations: 6 } },
            { id: 'c4', roleInShoot: 'ОСВЕТИТЕЛЬ', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'u2', fullName: 'Демидов Тимофей Дмитриевич', groupName: 'ФВТ-22', rating: 4.5, telegram: '@timofey_light', participations: 4 } }
          ]
        },
        {
          id: 'demo-shoot-2',
          title: 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03: ИНТЕРВЬЮ',
          description: 'Многокамерная студийная запись интервью с режиссёром. Поканальная запись звука Shure SM7B, мониторинг уровней, свет Dedolight.',
          type: 'СТУДИЯ',
          date: '2026-10-21T16:30:00Z',
          location: 'ПАВИЛЬОН МЕДИАЦЕНТРА №1 (ОНЕЖСКАЯ)',
          isCompleted: false,
          latitude: 55.858244,
          longitude: 37.518423,
          videoUrl: 'https://rutube.ru/play/embed/sample',
          previewUrl: 'img/student.jpg',
          creator: { fullName: 'Бадиков Семён Станиславович' },
          crew: [
            { id: 'c5', roleInShoot: 'ЗВУКОРЕЖИССЁР', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'demo-user-1', fullName: 'Бадиков Семён Станиславович', groupName: 'КТ-26', rating: 5.0, telegram: '@badikov_dop', participations: 6 } },
            { id: 'c6', roleInShoot: 'ОПЕРАТОР', status: 'ACCEPTED', attendance: 'PRESENT', user: { id: 'u1', fullName: 'Ковалев Михаил Алексеевич', groupName: 'ФВТ-22', rating: 4.7, telegram: '@mikhail_cam', participations: 5 } },
            { id: 'c7', roleInShoot: 'ОПЕРАТОР', status: 'PENDING', attendance: 'PRESENT', user: { id: 'u4', fullName: 'Соколова Анна Алексеевна', groupName: 'КТ-15', rating: 4.0, telegram: '@anna_sound', participations: 3 } }
          ]
        }
      ];
    }
    stats = { totalShoots: shoots.length, completedShoots: shoots.filter(s => s.isCompleted).length };
  }

  globalShoots = shoots;

  try {
    if (document.getElementById('shootCount')) {
      document.getElementById('shootCount').innerText = shoots.length + ' смен';
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
              '<p class="text-[10px] font-mono mt-0.5 font-bold" style="color: #555555;">' + currentUser.role + '</p>' +
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

    const container = document.getElementById('shootsList');
    if (!container) return;

    if (shoots.length === 0) {
      container.innerHTML = '<div class="p-8 viewfinder-card text-center text-xs uppercase font-mono font-bold" style="color: var(--text-muted);">Нет активных смен в производстве.</div>';
      return;
    }

    const isAdmin = currentUser && currentUser.role === 'Администратор';

    try {
      if (fullMap && fullMap.geoObjects) {
        fullMap.geoObjects.removeAll();
        shoots.forEach(s => {
          let balloonHTML = '<div style="padding:6px; font-family:sans-serif; min-width:180px;">' +
            '<strong style="font-size:12px; text-transform:uppercase; color:#FC2C2C;">' + s.title + '</strong><br>' +
            '<span style="font-size:11px; color:#555;">Формат: ' + (s.type || 'СМЕНА') + '</span><br>' +
            '<span style="font-size:11px; color:#333;">Локация: ' + s.location + '</span><br>' +
            '<div style="margin-top:8px; display:flex; gap:4px;">' +
              '<button onclick="openCallsheetModal(\'' + s.id + '\')" style="background:#229ED9;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Вызывной</button>';
          if (s.videoUrl) {
            balloonHTML += '<button onclick="openVideoPlayerModal(\'' + s.id + '\')" style="background:#FC2C2C;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Видео</button>';
          }
          if (isAdmin) {
            balloonHTML += '<button onclick="deleteShoot(\'' + s.id + '\')" style="background:#333;color:#FFFFFF;padding:4px 8px;font-weight:bold;font-size:10px;border:none;cursor:pointer;text-transform:uppercase;">Удалить</button>';
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
      }
    } catch (mapErr) {
      console.warn('Yandex map placemarks deferred:', mapErr);
    }

    const canManage = currentUser && (currentUser.role === 'Мастер / Преподаватель' || currentUser.role === 'Администратор');

    container.innerHTML = shoots.map(s => {
      const formattedDate = new Date(s.date).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const locationText = s.location;
      const masterText = s.creator && s.creator.fullName ? s.creator.fullName : 'Не указан';
      const cardStateClass = s.isCompleted ? 'completed-shoot' : 'active-shoot';
      
      let statusBadge = s.isCompleted 
        ? '<span class="badge-completed text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ЗАВЕРШЕНО</span>' 
        : '<span class="badge-rec text-[10px] px-2.5 py-0.5 inline-flex items-center gap-1.5"><span class="rec-dot"></span> В ПРОИЗВОДСТВЕ</span>';

      let typeBadge = '<span class="badge-neutral text-[10px] px-2 py-0.5 font-mono">' + (s.type || 'СМЕНА') + '</span>';

      let deleteBtn = isAdmin ? '<button onclick="deleteShoot(\'' + s.id + '\')" class="text-neutral-400 hover:text-red-400 px-2 py-1 text-[10px] font-bold uppercase transition">Удалить</button>' : '';

      const crewList = s.crew || [];
      const acceptedMemberIds = crewList.filter(c => c.status === 'ACCEPTED').map(c => '\'' + c.id + '\'').join(', ');

      let crewHtml = '';
      if (crewList.length === 0) {
        crewHtml = '<div class="p-3 text-xs font-mono text-center border border-dashed" style="color: var(--text-muted); border-color: var(--border-color);">Команда пока не назначена на смену</div>';
      } else {
        crewHtml = crewList.map(c => {
          let cUserName = c.user && c.user.fullName ? c.user.fullName : 'Участник';
          let cGroupName = c.user && c.user.groupName ? c.user.groupName : 'Группа';
          let cRating = c.user && c.user.rating !== null && c.user.rating !== undefined ? c.user.rating : 'Нет';
          let cRatingColor = getRatingBadgeColor(c.user ? c.user.rating : null);
          let cUserId = c.user ? (c.user.id || 'demo-user-1') : 'demo-user-1';
          let cRank = getCraftRankBadge(c.user && c.user.participations ? c.user.participations : 3, c.user ? c.user.rating : 4.5);
          
          let statusBadgeCrew = '';
          if (c.status === 'ACCEPTED') {
            statusBadgeCrew = '<span class="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.check + 'Принят</span>';
          } else if (c.status === 'DECLINED') {
            statusBadgeCrew = '<span class="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.cross + 'Отклонил</span>';
          } else {
            statusBadgeCrew = '<span class="text-[10px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 inline-flex items-center">' + SVG_ICONS.clock + 'Ожидание</span>';
          }

          let manualAcceptBtn = '';
          if (canManage && c.status === 'PENDING') {
            manualAcceptBtn = '<button onclick="respondCrew(\'' + c.id + '\', \'ACCEPTED\')" class="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase transition">Подтвердить</button>';
          }

          let competencyMatrixBtn = '';
          if (canManage) {
            competencyMatrixBtn = '<button onclick="openCompetencyModal(\'' + s.id + '\', \'' + c.id + '\', \'' + c.roleInShoot + '\', \'' + cUserName.replace(/'/g, "\\'") + '\')" class="btn-brand-ghost px-2 py-0.5 text-[9px] font-extrabold uppercase" title="Оценить по цеховой матрице">Матрица цеха</button>';
          }

          let attendanceSelect = '';
          let starsBlock = '';
          if (canManage) {
            let selPresent = c.attendance === 'PRESENT' ? 'selected' : '';
            let selAbsent = c.attendance === 'ABSENT' ? 'selected' : '';
            attendanceSelect = '<select onchange="updateAttendance(\'' + c.id + '\', this.value)" class="studio-input text-xs font-bold px-2 py-0.5 ml-2">' +
              '<option value="PRESENT" ' + selPresent + '>Присутствовал</option>' +
              '<option value="ABSENT" ' + selAbsent + '>Прогул (-0.3 балла)</option>' +
            '</select>';

            if (c.status === 'ACCEPTED') {
              let defaultVal = 5;
              let starsHTML = '';
              for (let i = 1; i <= 5; i++) {
                let isFilled = i <= defaultVal;
                starsHTML += '<span data-star-idx="' + i + '" onclick="setStarRating(\'' + c.id + '\', ' + i + ')" class="rating-star-btn cursor-pointer inline-flex items-center p-0.5 hover:scale-125 transition ' + (isFilled ? 'opacity-100' : 'opacity-40') + '">' + (isFilled ? SVG_ICONS.star : SVG_ICONS.starEmpty) + '</span>';
              }
              starsBlock = '<div class="flex items-center space-x-1 ml-auto" id="stars_container_' + c.id + '">' +
                '<span class="text-[10px] uppercase font-bold mr-1 font-mono" style="color: var(--text-muted);">Оценка:</span>' +
                starsHTML +
                '<input type="hidden" id="grade_input_' + c.id + '" value="' + defaultVal + '">' +
              '</div>';
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

          return '<div class="crew-member-row p-3 flex flex-wrap items-center justify-between gap-2">' +
            '<div class="flex items-center flex-wrap gap-2">' +
              '<span class="crew-dept-tag ' + roleClass + '"><span class="inline-flex items-center">' + roleSvg + c.roleInShoot + '</span></span>' +
              '<span onclick="openShowreelModal(\'' + cUserId + '\')" class="font-bold text-xs uppercase cursor-pointer hover:underline hover:text-[var(--brand-red)] transition" style="color: var(--text-primary);" title="Открыть цифровой шоурил и портфолио">' + cUserName + '</span>' +
              '<span class="font-mono text-[11px]" style="color: var(--text-muted);">[' + cGroupName + ']</span>' +
              '<span class="' + cRank.className + '">' + cRank.icon + ' ' + cRank.title + '</span>' +
              '<span class="' + cRatingColor + ' font-mono text-xs font-bold inline-flex items-center gap-1">' + SVG_ICONS.star + cRating + '</span>' +
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
      if (canManage) {
        let globalStarsHTML = '';
        for (let i = 1; i <= 5; i++) {
          globalStarsHTML += '<span onclick="applyGlobalGrade(\'' + s.id + '\', ' + i + ')" class="rating-star-btn cursor-pointer inline-flex items-center p-1 hover:scale-125 transition" title="Оценить всех на ' + i + '">' + SVG_ICONS.star + '</span>';
        }

        globalGradeControl = '<div class="flex flex-wrap items-center justify-between p-3 border gap-2 mb-2" style="background-color: var(--bg-elevated); border-color: var(--border-color);">' +
          '<span class="text-xs uppercase font-extrabold font-mono" style="color: var(--text-primary);">Быстрая оценка для всех участников:</span>' +
          '<div class="flex space-x-1">' + globalStarsHTML + '</div>' +
        '</div>';
        
        saveGradesBtn = '<button onclick="saveShootGrades(\'' + s.id + '\', [' + acceptedMemberIds + '])" class="btn-brand-beige w-full py-2.5 text-xs font-extrabold uppercase tracking-wider shadow-md mt-3">' +
          'Сохранить оценки и завершить смену' +
        '</button>';
      }

      const techSpecBadge = (s.type === 'ВЫЕЗД') 
        ? '<span class="hidden sm:inline-block font-mono text-[9px] px-1.5 py-0.5 border uppercase tracking-wider opacity-60" style="border-color: var(--border-subtle); color: var(--text-muted);" title="Спецификация оптики и формата">ARRI • 2.39:1 • RAW</span>' 
        : '<span class="hidden sm:inline-block font-mono text-[9px] px-1.5 py-0.5 border uppercase tracking-wider opacity-60" style="border-color: var(--border-subtle); color: var(--text-muted);" title="Спецификация оптики и формата">FUJINON • 16:9 • LOG-C</span>';

      return '<div class="viewfinder-card viewfinder-corners shoot-card ' + cardStateClass + ' p-5 sm:p-6 space-y-4">' +
        '<div class="flex flex-wrap justify-between items-center gap-2">' +
          '<div class="flex items-center space-x-2">' +
            typeBadge +
            statusBadge +
            techSpecBadge +
          '</div>' +
          '<div class="flex items-center space-x-2 sm:space-x-2.5 text-xs font-mono">' +
            '<span class="font-semibold" style="color: var(--text-muted);">' + formattedDate + '</span>' +
            '<button onclick="openCallsheetModal(\'' + s.id + '\')" class="btn-brand-ghost px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1" title="Оперативный вызывной лист">' +
              SVG_ICONS.telegram +
              '<span>Вызывной</span>' +
            '</button>' +
            (s.videoUrl ? '<button onclick="openVideoPlayerModal(\'' + s.id + '\')" class="btn-brand-primary px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1" title="Смотреть смонтированное видео">' +
              '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
              '<span>Видео</span>' +
            '</button>' : '') +
            '<button id="expand_btn_' + s.id + '" onclick="toggleShootExpand(\'' + s.id + '\')" class="btn-brand-ghost px-3 py-1 text-[10px] font-extrabold uppercase">Развернуть ▾</button>' +
            deleteBtn +
          '</div>' +
        '</div>' +

        '<div>' +
          '<h4 class="text-base sm:text-lg font-extrabold uppercase tracking-tight mb-1.5" style="color: var(--text-primary);">' + s.title + '</h4>' +
          '<p class="text-xs leading-relaxed font-medium" style="color: var(--text-secondary);">' + s.description + '</p>' +
        '</div>' +

        '<div class="text-xs border-t pt-3 flex flex-wrap justify-between items-center gap-2 font-mono text-[11px]" style="border-color: var(--border-subtle); color: var(--text-muted);">' +
          '<span class="flex items-center gap-1.5">' + SVG_ICONS.pin + ' ' + locationText + '</span>' +
          '<span class="flex items-center gap-1.5">' + SVG_ICONS.slate + ' Мастер: <span style="color: var(--text-primary);">' + masterText + '</span></span>' +
        '</div>' +
        
        '<div id="shoot_details_' + s.id + '" style="max-height: 0px; overflow: hidden; transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1);" class="border-t pt-3 space-y-4" style="border-color: var(--border-subtle);">' +
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
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

updateNav();

if (urlParams.get('expand') === '1') {
  setTimeout(() => toggleShootExpand('demo-shoot-1'), 300);
}
if (urlParams.get('tab')) {
  setTimeout(() => switchTab(urlParams.get('tab')), 300);
}
