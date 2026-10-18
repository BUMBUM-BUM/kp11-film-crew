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
  
  let adminTopBar = '<div class="mb-4 flex justify-between items-center bg-[#1A1A1A] p-3 unified-parallelogram border border-[#333333]">' +
    '<span class="text-xs font-extrabold uppercase text-[var(--brand-beige)]">Глобальное управление базой</span>' +
    '<button onclick="resetAllRatings()" class="px-3 py-1.5 text-xs font-extrabold uppercase bg-red-800 text-white unified-parallelogram hover:bg-red-700 transition">Сбросить весь рейтинг</button>' +
  '</div>';

  container.innerHTML = adminTopBar + users.map(u => {
    const currentRole = u.role && u.role.name ? u.role.name : 'Студент';
    const isAdminUser = currentUser && currentUser.id === u.id;
    const ratingText = u.rating !== null && u.rating !== undefined ? u.rating : '';
    const suspendedText = u.isSuspended ? '<span class="text-red-500 font-extrabold">[ОТСТРАНЁН]</span>' : '';
    const borderClass = u.isSuspended ? 'border-red-600 bg-red-950/40' : '';
    
    let deleteBtn = '';
    if (!isAdminUser) {
      deleteBtn = '<button onclick="deleteUser(\'' + u.id + '\')" class="px-3 py-1 text-xs font-extrabold uppercase bg-red-700 text-white unified-parallelogram">Удалить</button>';
    }

    return '<div id="user_row_' + u.id + '" class="flex flex-col md:flex-row md:items-center justify-between p-3 bg-[var(--brand-black)] unified-parallelogram gap-3 border border-[#333333] ' + borderClass + '">' +
      '<div id="user_info_' + u.id + '" class="flex-grow">' +
        '<h4 class="font-extrabold text-xs uppercase pixel-text-invert">' +
          '<span id="display_name_' + u.id + '">' + u.fullName + '</span> ' +
          '<span class="text-neutral-400">[Группа: <span id="display_group_' + u.id + '">' + (u.groupName || '—') + '</span>]</span> ' +
          '<span class="text-amber-400 font-extrabold">⭐<span id="display_rating_' + u.id + '">' + (ratingText !== '' ? ratingText : 'Нет') + '</span></span> ' +
          suspendedText +
        '</h4>' +
        '<p class="text-[11px] text-neutral-400 font-bold">' + u.email + '</p>' +
      '</div>' +
      '<div id="user_edit_form_' + u.id + '" class="hidden flex items-center space-x-2 flex-grow flex-wrap gap-y-2">' +
        '<input type="text" id="edit_name_' + u.id + '" value="' + u.fullName.replace(/"/g, '&quot;') + '" class="bg-neutral-900 text-white px-2 py-1 text-xs border border-neutral-700 unified-parallelogram" placeholder="ФИО">' +
        '<input type="text" id="edit_group_' + u.id + '" value="' + (u.groupName || '') + '" class="bg-neutral-900 text-white px-2 py-1 text-xs w-20 border border-neutral-700 unified-parallelogram" placeholder="Группа">' +
        '<input type="number" min="0" max="5" step="0.1" id="edit_rating_' + u.id + '" value="' + (ratingText !== '' ? ratingText : '') + '" class="bg-neutral-900 text-white px-2 py-1 text-xs w-20 border border-neutral-700 unified-parallelogram" placeholder="Рейтинг">' +
        '<button onclick="saveUserProfile(\'' + u.id + '\')" class="bg-emerald-600 text-white px-3 py-1 text-xs font-extrabold uppercase unified-parallelogram">Сохранить</button>' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', false)" class="bg-neutral-700 text-white px-2 py-1 text-xs font-extrabold uppercase unified-parallelogram">Отмена</button>' +
      '</div>' +
      '<div class="flex items-center space-x-2 flex-wrap gap-y-2" id="user_actions_' + u.id + '">' +
        '<button onclick="toggleUserEdit(\'' + u.id + '\', true)" class="px-3 py-1 text-xs font-extrabold uppercase bg-amber-600 text-black unified-parallelogram font-bold">Изменить</button>' +
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
    const res = await fetch('/api/admin/users/' + userId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ 
        fullName: newName, 
        groupName: newGroup, 
        rating: newRating !== '' ? parseFloat(newRating) : null 
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('Профиль успешно обновлен!');
    loadAdminPanel();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
}

async function resetAllRatings() {
  if (!confirm('Вы уверены, что хотите сбросить рейтинг ВСЕХ пользователей в системе?')) return;
  try {
    const res = await fetch('/api/admin/reset-ratings', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    alert('Рейтинг всех пользователей успешно сброшен!');
    loadAdminPanel();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
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
    alert('Ошибка: ' + err.message);
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
    alert('Ошибка: ' + err.message);
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

// Применение общей оценки ко всем инпутам участников
function applyGlobalGrade(shootId) {
  const globalInput = document.getElementById('global_grade_' + shootId);
  if (!globalInput) return;
  const val = globalInput.value;
  const card = document.getElementById('shoot_details_' + shootId);
  if (card) {
    const individualInputs = card.querySelectorAll('input[id^="grade_input_"]');
    individualInputs.forEach(input => {
      input.value = val;
    });
  }
}

// Завершение смены со сбором индивидуальных оценок
async function completeShoot(shootId, crewMemberIds) {
  const grades = {};
  for (const memberId of crewMemberIds) {
    const inputEl = document.getElementById('grade_input_' + memberId);
    if (inputEl) {
      grades[memberId] = parseFloat(inputEl.value) || 5.0;
    }
  }

  try {
    const res = await fetch('/api/shoots/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ shootId, grades })
    });
    if (!res.ok) throw new Error('Ошибка завершения смены');
    alert('Смена успешно завершена, оценки сохранены!');
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

// Плавная анимация разворачивания карточки через max-height
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

      // Инициализация мини-карты съёмки при разворачивании
      const mapContainer = document.getElementById('mini_map_' + shootId);
      const lat = parseFloat(mapContainer.getAttribute('data-lat'));
      const lon = parseFloat(mapContainer.getAttribute('data-lon'));
      const title = mapContainer.getAttribute('data-title');

      if (mapContainer && !mapContainer.hasChildNodes() && typeof ymaps !== 'undefined') {
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

      const acceptedMemberIds = s.crew.filter(c => c.status === 'ACCEPTED').map(c => '\'' + c.id + '\'').join(', ');

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

          let manualAcceptBtn = '';
          if (canManage && c.status === 'PENDING' && !s.isCompleted) {
            manualAcceptBtn = '<button onclick="respondCrew(\'' + c.id + '\', \'ACCEPTED\')" class="ml-2 bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase unified-parallelogram">Подтвердить</button>';
          }

          let attendanceSelect = '';
          let gradeInput = '';
          if (canManage) {
            if (!s.isCompleted) {
              let selPresent = c.attendance === 'PRESENT' ? 'selected' : '';
              let selAbsent = c.attendance === 'ABSENT' ? 'selected' : '';
              attendanceSelect = '<select onchange="updateAttendance(\'' + c.id + '\', this.value)" class="bg-[var(--brand-black)] text-[var(--brand-beige)] text-xs font-bold px-1 py-0.5 unified-parallelogram border border-[#333333] ml-2">' +
                '<option value="PRESENT" ' + selPresent + '>Присутствовал</option>' +
                '<option value="ABSENT" ' + selAbsent + '>Прогул (-0.3⭐)</option>' +
              '</select>';
            } else if (c.status === 'ACCEPTED') {
              gradeInput = '<span class="ml-2 text-amber-300 font-bold">Оценка: <input type="number" min="1" max="5" step="0.5" id="grade_input_' + c.id + '" value="5" class="w-14 bg-black text-white px-1 text-center border border-neutral-600"></span>';
            }
          }

          return '<div class="px-3 py-1.5 flex items-center space-x-2 text-xs font-bold unified-parallelogram ' + cBg + ' flex-wrap gap-y-1 mb-1">' +
            '<span class="uppercase">' + cUserName + ' [' + cGroupName + '] (' + c.roleInShoot + ') ⭐' + cRating + '</span>' +
            '<span class="font-extrabold">' + cIcon + '</span>' +
            manualAcceptBtn +
            attendanceSelect +
            gradeInput +
          '</div>';
        }).join('');
      }

      let globalGradeControl = '';
      let completeBtn = '';
      if (canManage && !s.isCompleted) {
        globalGradeControl = '<div class="flex items-center space-x-2 bg-neutral-900 p-2 unified-parallelogram border border-neutral-700 mt-2">' +
          '<span class="text-xs uppercase font-extrabold text-[var(--brand-beige)]">Общая оценка для всех:</span>' +
          '<input type="number" min="1" max="5" step="0.5" id="global_grade_' + s.id + '" value="5" class="w-16 bg-black text-white px-2 py-1 text-xs border border-neutral-600 text-center">' +
          '<button onclick="applyGlobalGrade(\'' + s.id + '\')" class="bg-amber-600 text-black px-3 py-1 text-xs font-extrabold uppercase unified-parallelogram">Применить ко всем</button>' +
        '</div>';
        
        completeBtn = '<button onclick="completeShoot(\'' + s.id + '\', [' + acceptedMemberIds + '])" class="bg-[var(--brand-beige)] text-[var(--brand-black)] px-4 py-2.5 text-xs font-extrabold uppercase unified-parallelogram hover:bg-neutral-200 transition paper-cut-text-dark w-full mt-4">Завершить смену и сохранить оценки</button>';
      }

      return '<div class="p-6 shoot-card-pure unified-parallelogram space-y-4">' +
        '<div class="flex justify-between items-center">' +
          '<div class="flex items-center space-x-2">' +
            '<span class="text-[10px] bg-[var(--brand-black)] text-[var(--brand-beige)] px-2.5 py-1 uppercase font-extrabold unified-parallelogram">СМЕНА</span>' +
            statusBadge +
          '</div>' +
          '<div class="flex items-center space-x-2">' +
            '<span class="text-xs font-bold shoot-card-text" data-text="' + formattedDate + '">' + formattedDate + '</span>' +
            '<button id="expand_btn_' + s.id + '" onclick="toggleShootExpand(\'' + s.id + '\')" class="bg-[var(--brand-black)] text-[var(--brand-beige)] px-3 py-1 text-[10px] font-extrabold uppercase unified-parallelogram hover:bg-neutral-900 transition">Развернуть ▾</button>' +
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
        
        // Разворачиваемый блок с плавной анимацией через max-height
        '<div id="shoot_details_' + s.id + '" style="max-height: 0px; overflow: hidden; transition: max-height 0.4s ease-out;" class="pt-2 border-t border-neutral-700 space-y-4">' +
          '<div class="space-y-2 pt-2">' +
            '<span class="uppercase tracking-wider text-xs font-extrabold text-[var(--brand-beige)]">Съёмочная группа и выставление оценок:</span>' +
            globalGradeControl +
            '<div class="space-y-1 mt-2">' + crewHtml + '</div>' +
            completeBtn +
          '</div>' +
          '<div class="space-y-2 pt-2">' +
            '<span class="uppercase tracking-wider text-xs font-extrabold text-[var(--brand-beige)]">Расположение объекта на карте:</span>' +
            '<div id="mini_map_' + s.id + '" data-lat="' + (s.latitude || 55.751244) + '" data-lon="' + (s.longitude || 37.618423) + '" data-title="' + s.title.replace(/"/g, '&quot;') + '" class="w-full h-48 bg-neutral-900 unified-parallelogram border border-[#333333]"></div>' +
          '</div>' +
        '</div>' +

      '</div>';
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

updateNav();
