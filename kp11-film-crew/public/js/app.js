let isRegister = false;
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');
let token = localStorage.getItem('token') || '';
let globalStudents = [];
let globalAdminUsers = [];
let fullMap = null;
let pickerMap = null;
let pickerPlacemark = null;

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

function updateNav() {
  const nav = document.getElementById('userNav');
  const tabAdminBtn = document.getElementById('tabAdminBtn');
  const actionContainer = document.getElementById('actionButtonContainer');
  const authBanner = document.getElementById('authRequiredBanner');
  const authContent = document.getElementById('authenticatedContent');

  if (currentUser) {
    if (authBanner) authBanner.classList.add('hidden');
    if (authContent) authContent.classList.remove('hidden');

    if (nav) {
      nav.innerHTML = 
        '<div class="flex items-center space-x-3">' +
          '<span class="text-xs bg-[var(--brand-beige)] text-[var(--brand-black)] px-3.5 py-1.5 font-extrabold unified-parallelogram paper-cut-text-dark">' + currentUser.fullName + ' <span class="text-neutral-700">[' + (currentUser.groupName || 'Группа') + ']</span></span>' +
          '<button onclick="logout()" class="text-xs font-extrabold uppercase px-3 py-1.5 bg-[var(--brand-black)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert hover:bg-black transition">Выход</button>' +
        '</div>';
    }

    if (currentUser.role === 'Мастер / Преподаватель' || currentUser.role === 'Администратор') {
      if (actionContainer) {
        actionContainer.innerHTML = 
          '<button onclick="openShootModal()" class="bg-[var(--brand-red)] text-[var(--brand-beige)] px-5 py-2.5 font-extrabold text-xs uppercase tracking-wider unified-parallelogram pixel-text-invert hover:opacity-95 transition flex items-center space-x-2">' +
            '<span>+ Новая смена</span>' +
          '</button>';
      }
    } else if (actionContainer) {
      actionContainer.innerHTML = '';
    }

    if (currentUser.role === 'Администратор') {
      if (tabAdminBtn) tabAdminBtn.classList.remove('hidden');
      loadAdminPanel();
    } else if (tabAdminBtn) {
      tabAdminBtn.classList.add('hidden');
    }

    loadNotifications();
    loadShoots();
  } else {
    if (authBanner) authBanner.classList.remove('hidden');
    if (authContent) authContent.classList.add('hidden');
    if (actionContainer) actionContainer.innerHTML = '';
    if (nav) {
      nav.innerHTML = 
        '<button onclick="openModal(\'login\')" class="text-xs font-extrabold uppercase px-4 py-2 bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition hover:opacity-95">Вход</button>' +
        '<button onclick="openModal(\'register\')" class="text-xs font-extrabold uppercase px-4 py-2 bg-[var(--brand-beige)] text-[var(--brand-black)] unified-parallelogram paper-cut-text-dark transition hover:opacity-95">Регистрация</button>';
    }
  }
}

function switchTab(tab) {
  const isShoots = tab === 'shoots';
  const isMap = tab === 'map';
  const isAdmin = tab === 'admin';
  const isStats = tab === 'stats';

  document.getElementById('viewShoots').classList.toggle('hidden', !isShoots);
  document.getElementById('viewMap').classList.toggle('hidden', !isMap);
  if (document.getElementById('viewAdmin')) {
    document.getElementById('viewAdmin').classList.toggle('hidden', !isAdmin);
  }
  if (document.getElementById('viewStats')) {
    document.getElementById('viewStats').classList.toggle('hidden', !isStats);
  }

  document.getElementById('tabShootsBtn').className = isShoots ? 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition' : 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-black)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition';
  document.getElementById('tabMapBtn').className = isMap ? 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition' : 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-black)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition';
  
  if (document.getElementById('tabStatsBtn')) {
    document.getElementById('tabStatsBtn').className = isStats ? 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition' : 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-black)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition';
  }

  if (document.getElementById('tabAdminBtn')) {
    document.getElementById('tabAdminBtn').className = isAdmin ? 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram pixel-text-invert transition' : 'px-6 py-2.5 font-extrabold text-xs uppercase bg-[var(--brand-beige)] text-[var(--brand-black)] unified-parallelogram paper-cut-text-dark transition';
  }

  if (isMap && fullMap) {
    setTimeout(() => fullMap.container.fitToViewport(), 150);
  }
  if (isStats) {
    loadStatisticsData();
  }
}

async function loadStatisticsData() {
  try {
    const res = await fetch('/api/statistics', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const leadersContainer = document.getElementById('statsLeadersList');
    if (leadersContainer) {
      leadersContainer.innerHTML = data.leaders.map((u, index) => 
        '<div class="flex items-center justify-between p-2 bg-[#1A1A1A] unified-parallelogram text-xs">' +
          '<span class="font-extrabold text-[var(--brand-beige)]">' + (index + 1) + '. ' + u.fullName + ' <span class="text-neutral-400">[' + u.groupName + ']</span></span>' +
          '<span class="text-amber-400 font-extrabold">⭐ ' + (u.rating !== null ? u.rating : 'Нет рейтинга') + '</span>' +
        '</div>'
      ).join('') || '<p class="text-xs text-neutral-400">Нет данных о лидерах.</p>';
    }

    if (document.getElementById('statCompletedCount')) {
      document.getElementById('statCompletedCount').innerText = data.totalCompleted + ' из ' + data.totalShoots;
    }

    const groupsContainer = document.getElementById('statsGroupsList');
    if (groupsContainer) {
      groupsContainer.innerHTML = data.groupsRating.map(g => 
        '<div class="flex items-center justify-between p-2 bg-[#1A1A1A] unified-parallelogram text-xs">' +
          '<span class="font-extrabold text-[var(--brand-beige)]">Группа: ' + g.groupName + '</span>' +
          '<span class="text-amber-400 font-extrabold">⭐ ' + g.avgRating + ' <span class="text-neutral-400 font-normal">(' + g.participations + ' смен)</span></span>' +
        '</div>'
      ).join('') || '<p class="text-xs text-neutral-400">Нет данных по группам.</p>';
    }

    const freqContainer = document.getElementById('statsFrequentShoots');
    if (freqContainer) {
      freqContainer.innerHTML = data.frequentShoots.map(f => 
        '<div class="p-3 bg-[#1A1A1A] unified-parallelogram border border-[#333333] space-y-1">' +
          '<h4 class="text-xs font-extrabold uppercase text-[var(--brand-beige)]">' + f.title + '</h4>' +
          '<p class="text-[11px] text-neutral-400 font-bold">Проведено раз: ' + f.count + '</p>' +
        '</div>'
      ).join('') || '<p class="text-xs text-neutral-400">Пока нет созданных смен.</p>';
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    globalAdminUsers = data.users;
    renderAdminUsers(globalAdminUsers);
  } catch (err) {
    console.error(err);
  }
}

function renderAdminUsers(users) {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  container.innerHTML = users.map(u => {
    const currentRole = u.role && u.role.name ? u.role.name : 'Студент';
    const isAdminUser = currentUser && currentUser.id === u.id;
    const ratingText = u.rating !== null && u.rating !== undefined ? u.rating : 'Нет';
    const suspendedText = u.isSuspended ? '<span class="text-red-500 font-extrabold">[ОТСТРАНЁН]</span>' : '';
    const borderClass = u.isSuspended ? 'border-red-600 bg-red-950/40' : '';
    
    let deleteBtn = '';
    if (!isAdminUser) {
      deleteBtn = '<button onclick="deleteUser(\'' + u.id + '\')" class="px-3 py-1 text-xs font-extrabold uppercase bg-red-700 text-white unified-parallelogram">Удалить</button>';
    }

    return '<div class="flex flex-col md:flex-row md:items-center justify-between p-3 bg-[var(--brand-black)] unified-parallelogram gap-3 border border-[#333333] ' + borderClass + '">' +
      '<div>' +
        '<h4 class="font-extrabold text-xs uppercase pixel-text-invert">' +
          u.fullName + ' <span class="text-neutral-400">[' + (u.groupName || 'Группа не указана') + ']</span> ' +
          '<span class="text-amber-400 font-extrabold">⭐' + ratingText + '</span> ' +
          suspendedText +
        '</h4>' +
        '<p class="text-[11px] text-neutral-400 font-bold">' + u.email + '</p>' +
      '</div>' +
      '<div class="flex items-center space-x-2">' +
        '<select onchange="changeUserRole(\'' + u.id + '\', this.value)" class="bg-[#1A1A1A] text-[var(--brand-beige)] px-2.5 py-1 text-xs font-bold unified-parallelogram focus:outline-none border border-[#333333]">' +
          '<option value="Студент" ' + (currentRole === 'Студент' ? 'selected' : '') + '>Студент</option>' +
          '<option value="Мастер / Преподаватель" ' + (currentRole === 'Мастер / Преподаватель' ? 'selected' : '') + '>Мастер / Преподаватель</option>' +
          '<option value="Администратор" ' + (currentRole === 'Администратор' ? 'selected' : '') + '>Администратор</option>' +
        '</select>' +
        '<button onclick="toggleSuspend(\'' + u.id + '\', ' + (!u.isSuspended) + ')" class="px-3 py-1 text-xs font-extrabold uppercase unified-parallelogram ' + (u.isSuspended ? 'bg-emerald-600 text-white' : 'bg-[var(--brand-red)] text-white pixel-text-invert') + '">' +
          (u.isSuspended ? 'Восстановить' : 'Отстранить') +
        '</button>' +
        deleteBtn +
      '</div>' +
    '</div>';
  }).join('');
}

async function deleteUser(userId) {
  if (!confirm('Вы уверены, что хотите полностью удалить этого пользователя из системы?')) return;
  try {
    const res = await fetch('/api/admin/users/' + userId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Не удалось удалить пользователя');
    loadAdminPanel();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteShoot(shootId) {
  if (!confirm('Удалить эту смену (событие) и связанные с ней метки с карты?')) return;
  try {
    const res = await fetch('/api/admin/shoots/' + shootId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Не удалось удалить событие');
    loadShoots();
  } catch (err) {
    alert(err.message);
  }
}

function filterAdminUsers() {
  const query = document.getElementById('adminSearch').value.toLowerCase();
  const filtered = globalAdminUsers.filter(u => u.fullName.toLowerCase().includes(query) || (u.groupName && u.groupName.toLowerCase().includes(query)));
  renderAdminUsers(filtered);
}

async function toggleSuspend(userId, isSuspended) {
  try {
    const res = await fetch('/api/admin/suspend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ userId, isSuspended })
    });
    if (!res.ok) throw new Error('Ошибка обновления статуса');
    loadAdminPanel();
  } catch (err) {
    alert(err.message);
  }
}

async function changeUserRole(userId, roleName) {
  try {
    const res = await fetch('/api/admin/users/' + userId + '/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ roleName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка при изменении роли');

    if (currentUser && currentUser.id === userId) {
      currentUser.role = roleName;
      localStorage.setItem('user', JSON.stringify(currentUser));
      updateNav();
    } else {
      loadAdminPanel();
    }
  } catch (err) {
    alert('Ошибка: ' + err.message);
    loadAdminPanel();
  }
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
      '<div class="p-4 bg-[var(--brand-red)] text-[var(--brand-beige)] unified-parallelogram mb-6 space-y-2 border border-[var(--brand-beige)]">' +
        '<h4 class="text-xs font-extrabold uppercase tracking-wider pixel-text-invert">Приглашения в состав смены:</h4>' +
        invites.map(inv => 
          '<div class="flex items-center justify-between bg-[var(--brand-black)] text-[var(--brand-beige)] p-3 text-xs unified-parallelogram">' +
            '<div>' +
              '<strong class="text-xs font-extrabold uppercase pixel-text-invert">' + inv.shoot.title + '</strong>' +
              '<p class="text-neutral-400 text-[11px] font-bold">Локация: ' + inv.shoot.location + '</p>' +
            '</div>' +
            '<div class="space-x-2">' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'ACCEPTED\')" class="bg-emerald-600 text-white px-3 py-1 text-xs font-extrabold uppercase unified-parallelogram">Принять</button>' +
              '<button onclick="respondCrew(\'' + inv.id + '\', \'DECLINED\')" class="bg-[var(--brand-black)] text-[var(--brand-beige)] px-3 py-1 text-xs font-extrabold uppercase unified-parallelogram">Отклонить</button>' +
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
    const res = await fetch('/api/crew/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ crewMemberId, status })
    });
    if (!res.ok) throw new Error('Ошибка');
    loadNotifications();
    loadShoots();
  } catch (err) {
    alert(err.message);
  }
}

async function openShootModal() {
  document.getElementById('shootModal').classList.remove('hidden');
  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    globalStudents = data.students || [];
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

  } catch (err) {
    console.error(err);
  }
}

function renderModalStudents(students) {
  const box = document.getElementById('studentsCheckboxes');
  if (!box) return;
  box.innerHTML = students.map(s => {
    const ratingText = s.rating !== null && s.rating !== undefined ? s.rating : 'Нет';
    return '<div class="flex items-center justify-between p-2 bg-[var(--brand-black)] text-xs unified-parallelogram">' +
      '<label class="flex items-center space-x-2.5 cursor-pointer flex-grow">' +
        '<input type="checkbox" name="studentSelect" value="' + s.id + '" class="bg-[var(--brand-black)] text-[var(--brand-red)]">' +
        '<span class="font-extrabold text-xs uppercase text-[var(--brand-beige)]">' + s.fullName + ' <span class="text-neutral-400">[' + (s.groupName || 'Группа') + ']</span> <span class="text-amber-400 font-extrabold">⭐' + ratingText + '</span></span>' +
      '</label>' +
      '<select name="craftRole_' + s.id + '" class="bg-[#1A1A1A] text-[var(--brand-beige)] px-2.5 py-1 text-xs font-bold unified-parallelogram border border-[#333333]">' +
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

  const body = {
    title: document.getElementById('shootTitle').value,
    description: document.getElementById('shootDesc').value,
    type: document.getElementById('shootType').value,
    date: document.getElementById('shootDate').value,
    location: document.getElementById('shootLocation').value,
    latitude: parseFloat(document.getElementById('selectedLat').value),
    longitude: parseFloat(document.getElementById('selectedLon').value),
    crewAssignments
  };

  try {
    const res = await fetch('/api/shoots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    closeShootModal();
    loadShoots();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

async function completeShoot(shootId) {
  if (!confirm('Завершить смену? Вы сможете выставить оценку студентам.')) return;
  
  const gradeInput = prompt('Введите оценку участникам этой смены (от 0 до 5):', '5');
  if (gradeInput === null) return;
  const grade = parseFloat(gradeInput);
  if (isNaN(grade) || grade < 0 || grade > 5) {
    alert('Пожалуйста, введите корректное число от 0 до 5.');
    return;
  }

  try {
    const res = await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ shootId, grade })
    });
    if (!res.ok) throw new Error('Ошибка завершения смены');
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
  if (!currentUser) return;
  try {
    const res = await fetch('/api/shoots', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await res.json();
    const shoots = data.shoots || [];
    const stats = data.stats || { totalShoots: 0, completedShoots: 0 };
    const userStats = data.userStats;

    if (document.getElementById('shootCount')) {
      document.getElementById('shootCount').innerText = shoots.length + ' смен';
    }
    if (document.getElementById('globalStatsText')) {
      document.getElementById('globalStatsText').innerText = 'Всего смен: ' + stats.totalShoots + ' | Завершено: ' + stats.completedShoots;
    }

    const sidebar = document.getElementById('sidebarProfile');
    if (currentUser && sidebar) {
      let userRatingText = userStats && userStats.rating !== null && userStats.rating !== undefined ? userStats.rating : 'Нет рейтинга';
      let completedPart = userStats ? userStats.completedParticipated : 0;
      let totalPart = userStats ? userStats.totalParticipated : 0;

      sidebar.innerHTML = 
        '<div class="space-y-2 text-xs font-bold uppercase">' +
          '<div class="flex justify-between border-b border-[#D5C895] pb-1.5"><span class="text-neutral-700">ФИО:</span><span class="text-[var(--brand-black)]">' + currentUser.fullName + '</span></div>' +
          '<div class="flex justify-between border-b border-[#D5C895] pb-1.5"><span class="text-neutral-700">Группа:</span><span class="text-[var(--brand-red)]">' + (currentUser.groupName || '—') + '</span></div>' +
          '<div class="flex justify-between border-b border-[#D5C895] pb-1.5"><span class="text-neutral-700">Роль:</span><span class="text-[var(--brand-black)]">' + currentUser.role + '</span></div>' +
          (userStats ? 
            '<div class="pt-2 space-y-1.5 text-[var(--brand-black)]">' +
              '<div class="flex justify-between"><span class="text-neutral-700">Рейтинг:</span><span class="text-amber-800 font-extrabold">⭐ ' + userRatingText + '</span></div>' +
              '<div class="flex justify-between"><span class="text-neutral-700">Активных смен:</span><span class="text-[var(--brand-black)]">' + completedPart + ' / ' + totalPart + '</span></div>' +
            '</div>' : '') +
        '</div>';
    }

    const container = document.getElementById('shootsList');
    if (!container) return;

    if (shoots.length === 0) {
      container.innerHTML = '<div class="p-8 shoot-card-pure unified-parallelogram text-center font-bold text-xs uppercase text-[var(--brand-beige)]">Нет активных смен.</div>';
      return;
    }

    const isAdmin = currentUser && currentUser.role === 'Администратор';

    if (fullMap) {
      fullMap.geoObjects.removeAll();
      shoots.forEach(s => {
        let balloonHTML = '<strong>' + s.title + '</strong><br>Локация: ' + s.location;
        if (isAdmin) {
          balloonHTML += '<br><br><button onclick="deleteShoot(\'' + s.id + '\')" style="background:#FC2C2C;color:#EEE4B5;padding:4px 8px;font-weight:bold;border:none;cursor:pointer;">Удалить смену / метку</button>';
        }
        const placemark = new ymaps.Placemark([s.latitude || 55.751244, s.longitude || 37.618423], {
          balloonContent: balloonHTML
        }, {
          preset: 'islands#redFilmIcon'
        });
        fullMap.geoObjects.add(placemark);
      });
    }

    const canManage = currentUser && (currentUser.role === 'Мастер / Преподаватель' || currentUser.role === 'Администратор');

    container.innerHTML = shoots.map(s => {
      const formattedDate = new Date(s.date).toLocaleString();
      const locationText = 'Локация: ' + s.location;
      const masterText = 'Мастер: ' + (s.creator && s.creator.fullName ? s.creator.fullName : 'Не указан');
      
      let statusBadge = s.isCompleted 
        ? '<span class="text-[10px] bg-emerald-600 text-white px-2.5 py-1 uppercase font-extrabold unified-parallelogram">Завершено</span>' 
        : '<span class="text-[10px] bg-amber-400 text-black px-2.5 py-1 uppercase font-extrabold unified-parallelogram">В процессе</span>';

      let deleteBtn = isAdmin ? '<button onclick="deleteShoot(\'' + s.id + '\')" class="bg-[var(--brand-black)] text-red-400 px-2.5 py-1 text-[10px] font-extrabold uppercase unified-parallelogram hover:bg-neutral-900 transition">Удалить</button>' : '';
      let completeBtn = canManage && !s.isCompleted ? '<button onclick="completeShoot(\'' + s.id + '\')" class="bg-[var(--brand-beige)] text-[var(--brand-black)] px-3 py-1 text-[10px] font-extrabold uppercase unified-parallelogram hover:bg-neutral-200 transition paper-cut-text-dark">Завершить смену</button>' : '';

      let crewHtml = '';
      if (s.crew.length === 0) {
        crewHtml = '<span class="text-xs font-bold uppercase shoot-card-text" data-text="Команда не назначена">Команда не назначена</span>';
      } else {
        crewHtml = s.crew.map(c => {
          let cBg = 'bg-neutral-800 text-neutral-200';
          if (c.status === 'ACCEPTED') cBg = 'bg-emerald-900 text-emerald-100';
          if (c.status === 'DECLINED') cBg = 'bg-red-900 text-red-100';

          let cUserName = c.user && c.user.fullName ? c.user.fullName : 'Участник';
          let cGroupName = c.user && c.user.groupName ? c.user.groupName : 'Группа';
          let cRating = c.user && c.user.rating !== null && c.user.rating !== undefined ? c.user.rating : 'Нет';
          let cIcon = c.status === 'ACCEPTED' ? '✓' : (c.status === 'DECLINED' ? '✕' : '···');

          let attendanceSelect = '';
          if (canManage && c.status === 'ACCEPTED' && !s.isCompleted) {
            let selPresent = c.attendance === 'PRESENT' ? 'selected' : '';
            let selAbsent = c.attendance === 'ABSENT' ? 'selected' : '';
            attendanceSelect = '<select onchange="updateAttendance(\'' + c.id + '\', this.value)" class="bg-[var(--brand-black)] text-[var(--brand-beige)] text-xs font-bold px-1 py-0.5 unified-parallelogram border border-[#333333]">' +
              '<option value="PRESENT" ' + selPresent + '>Присутствовал</option>' +
              '<option value="ABSENT" ' + selAbsent + '>Прогул (-0.3⭐)</option>' +
            '</select>';
          }

          return '<div class="px-3 py-1.5 flex items-center space-x-2 text-xs font-bold unified-parallelogram ' + cBg + '">' +
            '<span class="uppercase">' + cUserName + ' [' + cGroupName + '] (' + c.roleInShoot + ') ⭐' + cRating + '</span>' +
            '<span class="font-extrabold">' + cIcon + '</span>' +
            attendanceSelect +
          '</div>';
        }).join('');
      }

      return '<div class="p-6 shoot-card-pure unified-parallelogram space-y-4">' +
        '<div class="flex justify-between items-center">' +
          '<div class="flex items-center space-x-2">' +
            '<span class="text-[10px] bg-[var(--brand-black)] text-[var(--brand-beige)] px-2.5 py-1 uppercase font-extrabold unified-parallelogram">СМЕНА</span>' +
            statusBadge +
          '</div>' +
          '<div class="flex items-center space-x-2">' +
            '<span class="text-xs font-bold shoot-card-text" data-text="' + formattedDate + '">' + formattedDate + '</span>' +
            deleteBtn +
          '</div>' +
        '</div>' +
        '<div>' +
          '<h4 class="text-base font-extrabold uppercase mb-1 shoot-card-text" data-text="' + s.title + '">' + s.title + '</h4>' +
          '<p class="text-xs font-medium leading-relaxed shoot-card-text" data-text="' + s.description + '">' + s.description + '</p>' +
        '</div>' +
        '<div class="text-xs font-bold border-t border-[var(--brand-beige)]/30 pt-3 flex justify-between uppercase">' +
          '<span class="shoot-card-text" data-text="' + locationText + '">' + locationText + '</span>' +
          '<span class="shoot-card-text" data-text="' + masterText + '">' + masterText + '</span>' +
        '</div>' +
        '<div class="pt-2 text-xs space-y-2">' +
          '<div class="flex justify-between items-center mb-1">' +
            '<span class="uppercase tracking-wider text-[10px] font-extrabold shoot-card-text" data-text="Съёмочная группа:">Съёмочная группа:</span>' +
            completeBtn +
          '</div>' +
          '<div class="flex flex-wrap gap-2">' + crewHtml + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

updateNav();
