const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');

const SHOOTS_FILE = path.join(DATA_DIR, 'shoots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultVal;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

// Пересчёт рейтинга всех студентов на основе завершённых смен
function recalculateRatings() {
  const shoots = readJsonFile(SHOOTS_FILE, []);
  const users = readJsonFile(USERS_FILE, []);

  users.forEach(u => {
    const roleName = (u.role && u.role.name) || (typeof u.role === 'string' ? u.role : 'Студент');
    if (!roleName.includes('Студент') && !roleName.includes('Мастер')) return;

    const grades = [];
    shoots.forEach(sh => {
      if (sh.isCompleted && Array.isArray(sh.crew)) {
        sh.crew.forEach(cm => {
          const match = cm.userId === u.id || cm.id === u.id || (cm.user && cm.user.id === u.id);
          if (match && cm.grade !== undefined && cm.grade !== null && cm.attendance !== 'ABSENT') {
            grades.push(Number(cm.grade));
          }
        });
      }
    });

    if (grades.length > 0) {
      const sum = grades.reduce((acc, v) => acc + v, 0);
      u.rating = Math.round((sum / grades.length) * 10) / 10;
      u.completedShoots = grades.length;
    }
  });

  writeJsonFile(USERS_FILE, users);
  return users;
}

// Отправка вызывного в Telegram
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve) => {
    if (!botToken || !chatId) return resolve(false);
    const postData = JSON.stringify({
      chat_id: chatId.trim(),
      text,
      parse_mode: 'HTML'
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode === 200));
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(postData);
    req.end();
  });
}

async function dispatchTelegramCallsheet(shoot) {
  const settings = readJsonFile(SETTINGS_FILE, {});
  const users = readJsonFile(USERS_FILE, []);
  const botToken = settings.telegramBotToken;
  if (!botToken) return { deliveredCount: 0, botTokenConfigured: false };

  let delivered = 0;
  const title = (shoot.title || 'Новая смена').toUpperCase();
  const format = shoot.type || 'ПАВИЛЬОН';
  const loc = shoot.location || 'Павильон КП11';
  const master = (shoot.creator && shoot.creator.fullName) || 'Бадиков Семён Станиславович';
  const dateStr = new Date(shoot.date || Date.now()).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Персональные сообщения участникам
  if (Array.isArray(shoot.crew)) {
    for (const cm of shoot.crew) {
      const u = users.find(usr => usr.id === cm.userId || usr.id === cm.id);
      if (u && u.telegramChatId) {
        const msg = `🎬 <b>ВЫЗЫВНОЙ ЛИСТ // МЕДИАЦЕНТР КП11</b>\n` +
          `════════════════════════════════════\n` +
          `Уважаемый(ая) <b>${u.fullName}</b>!\n` +
          `Вы утверждены в состав съёмочной смены:\n` +
          `Цех / Роль: <b>${cm.roleInShoot || 'Специалист'}</b>\n\n` +
          `Проект: <b>${title}</b>\n` +
          `Формат: <b>${format}</b>\n` +
          `Дата и время сбора: <b>${dateStr}</b>\n` +
          `Локация: <b>${loc}</b>\n` +
          `Мастер смены: <b>${master}</b>\n` +
          `════════════════════════════════════\n` +
          `<i>Подтвердите явку в веб-интерфейсе платформы КП11.</i>`;
        const ok = await sendTelegramMessage(botToken, u.telegramChatId, msg);
        if (ok) delivered++;
      }
    }
  }

  // Общий чат
  if (settings.defaultChatId) {
    const chatIds = settings.defaultChatId.split(/[\s,;\n\r]+/).filter(Boolean);
    for (const cId of chatIds) {
      const groupMsg = `🎬 <b>НОВАЯ СМЕНА В ПРОИЗВОДСТВЕ // КП11</b>\n` +
        `════════════════════════════════════\n` +
        `Проект: <b>${title}</b>\n` +
        `Формат: <b>${format}</b>\n` +
        `Дата и время: <b>${dateStr}</b>\n` +
        `Локация: <b>${loc}</b>\n` +
        `Мастер смены: <b>${master}</b>\n` +
        `════════════════════════════════════`;
      const ok = await sendTelegramMessage(botToken, cId, groupMsg);
      if (ok) delivered++;
    }
  }

  return { deliveredCount: delivered, botTokenConfigured: true };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  // CORS заголовки для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Парсинг тела запроса
  let body = '';
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    await new Promise((resolve) => {
      req.on('data', chunk => { body += chunk; });
      req.on('end', resolve);
    });
  }
  let jsonBody = {};
  if (body) {
    try { jsonBody = JSON.parse(body); } catch (_) {}
  }

  // ----------------- API ЭНДПОИНТЫ -----------------
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 1. GET /api/shoots
    if (pathname === '/api/shoots' && req.method === 'GET') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const completed = shoots.filter(s => s.isCompleted).length;

      let authUserId = '';
      const auth = req.headers.authorization || '';
      const match = auth.match(/Bearer\s+(?:token-)?([^\s]+)/i);
      if (match) authUserId = match[1];

      let targetUser = users.find(u => u.id === authUserId || u.email === authUserId);
      if (!targetUser && authUserId === 'student-token') targetUser = users.find(u => u.id === 'u1');
      if (!targetUser && (authUserId === 'admin-token' || authUserId === 'admin-1')) targetUser = users.find(u => u.id === 'admin-1');
      if (!targetUser) targetUser = users.find(u => u.id === 'demo-user-1') || users[0];

      let compPart = 0;
      let totPart = 0;
      if (targetUser) {
        shoots.forEach(sh => {
          if (Array.isArray(sh.crew)) {
            const inCrew = sh.crew.some(cm => cm.userId === targetUser.id || cm.id === targetUser.id);
            if (inCrew) {
              totPart++;
              if (sh.isCompleted) compPart++;
            }
          }
        });
      }

      return res.end(JSON.stringify({
        success: true,
        shoots,
        students: users,
        stats: { totalShoots: shoots.length, completedShoots: completed },
        userStats: {
          rating: targetUser ? (targetUser.rating || 5.0) : 5.0,
          completedParticipated: compPart,
          totalParticipated: totPart
        }
      }));
    }

    // 2. POST /api/shoots (Создание смены)
    if (pathname === '/api/shoots' && req.method === 'POST') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);

      const shootId = jsonBody.id || `shoot-${Date.now()}`;
      let crewList = [];
      if (Array.isArray(jsonBody.crew)) {
        crewList = jsonBody.crew;
      } else if (Array.isArray(jsonBody.crewAssignments)) {
        crewList = jsonBody.crewAssignments.map((ca, idx) => {
          const st = users.find(u => u.id === ca.userId);
          return {
            id: `c-${shootId}-${idx + 1}`,
            roleInShoot: ca.craftRole || 'Специалист цеха',
            status: 'PENDING',
            attendance: 'PRESENT',
            userId: ca.userId,
            user: st || null
          };
        });
      }

      const newShoot = {
        id: shootId,
        title: jsonBody.title || 'Новая съёмочная смена',
        description: jsonBody.description || '',
        type: jsonBody.type || 'ПАВИЛЬОН',
        date: jsonBody.date || new Date().toISOString(),
        location: jsonBody.location || 'Павильон КП11',
        latitude: parseFloat(jsonBody.latitude) || 55.858244,
        longitude: parseFloat(jsonBody.longitude) || 37.518423,
        isCompleted: false,
        creator: { fullName: (jsonBody.creator && jsonBody.creator.fullName) || 'Бадиков Семён Станиславович' },
        crew: crewList
      };

      const updatedShoots = [newShoot, ...shoots.filter(s => s.id !== shootId)];
      writeJsonFile(SHOOTS_FILE, updatedShoots);

      // Рассылка вызывных в Telegram
      dispatchTelegramCallsheet(newShoot).catch(() => {});

      return res.end(JSON.stringify({ success: true, shoot: newShoot }));
    }

    // 3. DELETE /api/shoots/:id или DELETE /api/admin/shoots/:id
    const deleteMatch = pathname.match(/^\/api\/(?:admin\/)?shoots\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const targetId = deleteMatch[1];
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const filtered = shoots.filter(s => s.id !== targetId);
      writeJsonFile(SHOOTS_FILE, filtered);
      recalculateRatings();
      return res.end(JSON.stringify({ success: true, message: 'Смена удалена' }));
    }

    // 4. POST /api/shoots/complete (Завершение смены и утверждение всех оценок)
    if (pathname === '/api/shoots/complete' && req.method === 'POST') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const targetShootId = jsonBody.shootId;
      const grades = jsonBody.grades || {};

      let completedShoot = null;
      shoots.forEach(sh => {
        if (sh.id === targetShootId) {
          sh.isCompleted = true;
          completedShoot = sh;
          if (Array.isArray(sh.crew)) {
            sh.crew.forEach(cm => {
              if (grades[cm.id] !== undefined) {
                cm.grade = Number(grades[cm.id]);
              } else if (grades[cm.userId] !== undefined) {
                cm.grade = Number(grades[cm.userId]);
              } else if (!cm.grade) {
                cm.grade = 5.0;
              }
            });
          }
        }
      });

      writeJsonFile(SHOOTS_FILE, shoots);
      const updatedUsers = recalculateRatings();

      return res.end(JSON.stringify({ success: true, shoot: completedShoot, users: updatedUsers }));
    }

    // 5. POST /api/shoots/:id/grade (Мгновенное сохранение одиночной оценки участника по клику)
    const gradeMatch = pathname.match(/^\/api\/shoots\/([^/]+)\/grade$/);
    if (gradeMatch && req.method === 'POST') {
      const shootId = gradeMatch[1];
      const { memberId, userId, grade } = jsonBody;
      const numericGrade = parseFloat(grade) || 5.0;

      const shoots = readJsonFile(SHOOTS_FILE, []);
      let updatedMember = null;

      shoots.forEach(sh => {
        if (sh.id === shootId && Array.isArray(sh.crew)) {
          sh.crew.forEach(cm => {
            if (cm.id === memberId || (userId && cm.userId === userId)) {
              cm.grade = numericGrade;
              updatedMember = cm;
            }
          });
        }
      });

      writeJsonFile(SHOOTS_FILE, shoots);
      const updatedUsers = recalculateRatings();

      return res.end(JSON.stringify({
        success: true,
        member: updatedMember,
        users: updatedUsers
      }));
    }

    // 6. POST /api/shoots/sync (Синхронизация локальных данных с сервером)
    if (pathname === '/api/shoots/sync' && req.method === 'POST') {
      if (Array.isArray(jsonBody.shoots) && jsonBody.shoots.length > 0) {
        const existingShoots = readJsonFile(SHOOTS_FILE, []);
        const shootMap = new Map();
        existingShoots.forEach(s => shootMap.set(s.id, s));
        jsonBody.shoots.forEach(s => shootMap.set(s.id, s));
        writeJsonFile(SHOOTS_FILE, Array.from(shootMap.values()));
      }
      if (Array.isArray(jsonBody.students) && jsonBody.students.length > 0) {
        const existingUsers = readJsonFile(USERS_FILE, []);
        const userMap = new Map();
        existingUsers.forEach(u => userMap.set(u.id, u));
        jsonBody.students.forEach(u => userMap.set(u.id, u));
        writeJsonFile(USERS_FILE, Array.from(userMap.values()));
      }
      recalculateRatings();
      return res.end(JSON.stringify({ success: true }));
    }

    // 7. GET /api/statistics (Полная аналитика платформы)
    if (pathname === '/api/statistics' && req.method === 'GET') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);

      const totalShoots = shoots.length;
      const totalCompleted = shoots.filter(s => s.isCompleted).length;

      // Лидеры среди студентов
      const studentLeaders = users
        .filter(u => {
          const role = (u.role && u.role.name) || (typeof u.role === 'string' ? u.role : 'Студент');
          return role.includes('Студент') && !u.isSuspended;
        })
        .map(u => {
          let partCount = 0;
          shoots.forEach(sh => {
            if (Array.isArray(sh.crew) && sh.crew.some(cm => cm.userId === u.id || cm.id === u.id)) {
              partCount++;
            }
          });
          return {
            id: u.id,
            fullName: u.fullName,
            groupName: u.groupName || 'КТ-26',
            rating: typeof u.rating === 'number' ? u.rating : 4.8,
            participations: partCount
          };
        })
        .sort((a, b) => b.rating - a.rating || b.participations - a.participations);

      // Групповой рейтинг
      const groupMap = {};
      studentLeaders.forEach(st => {
        const g = st.groupName || 'КТ-26';
        if (!groupMap[g]) groupMap[g] = { sum: 0, count: 0, participations: 0 };
        groupMap[g].sum += st.rating;
        groupMap[g].count++;
        groupMap[g].participations += st.participations;
      });

      const groupsRating = Object.keys(groupMap).map(g => ({
        groupName: g,
        avgRating: groupMap[g].count > 0 ? Math.round((groupMap[g].sum / groupMap[g].count) * 10) / 10 : 4.5,
        participations: groupMap[g].participations
      })).sort((a, b) => b.avgRating - a.avgRating);

      // Популярные смены
      const titleCounts = {};
      shoots.forEach(sh => {
        const t = (sh.title || 'Смена').trim();
        titleCounts[t] = (titleCounts[t] || 0) + 1;
      });
      const frequentShoots = Object.keys(titleCounts).map(t => ({
        title: t,
        count: titleCounts[t]
      })).sort((a, b) => b.count - a.count).slice(0, 5);

      return res.end(JSON.stringify({
        success: true,
        totalShoots,
        totalCompleted,
        leaders: studentLeaders,
        groupsRating,
        frequentShoots
      }));
    }

    // 8. МОДУЛЬ 3: ИНВЕНТАРЬ И ОБОРУДОВАНИЕ ЦКТ
    // GET /api/inventory
    if (pathname === '/api/inventory' && req.method === 'GET') {
      const inventory = readJsonFile(INVENTORY_FILE, []);
      return res.end(JSON.stringify({ success: true, inventory }));
    }

    // POST /api/inventory (Добавление / подпись единицы техники мастером или админом)
    if (pathname === '/api/inventory' && req.method === 'POST') {
      const inventory = readJsonFile(INVENTORY_FILE, []);
      const newId = jsonBody.id || `eq-${Date.now()}`;
      const newItem = {
        id: newId,
        name: jsonBody.name || 'Съёмочное оборудование',
        category: jsonBody.category || 'Оборудование',
        serialNumber: jsonBody.serialNumber || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
        status: jsonBody.status || 'AVAILABLE',
        location: jsonBody.location || 'Склад техники ЦКТ КП11',
        notes: jsonBody.notes || '',
        signedBy: jsonBody.signedBy || 'Бадиков Семён Станиславович',
        signedAt: new Date().toISOString()
      };

      const updated = [newItem, ...inventory];
      writeJsonFile(INVENTORY_FILE, updated);
      return res.end(JSON.stringify({ success: true, item: newItem, inventory: updated }));
    }

    // DELETE /api/inventory/:id
    const invDelMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (invDelMatch && req.method === 'DELETE') {
      const eqId = invDelMatch[1];
      const inventory = readJsonFile(INVENTORY_FILE, []);
      const filtered = inventory.filter(item => item.id !== eqId);
      writeJsonFile(INVENTORY_FILE, filtered);
      return res.end(JSON.stringify({ success: true, message: 'Оборудование удалено', inventory: filtered }));
    }

    // 9. АВТОРИЗАЦИЯ
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const users = readJsonFile(USERS_FILE, []);
      const email = (jsonBody.email || '').trim().toLowerCase();
      const found = users.find(u => u.email && u.email.trim().toLowerCase() === email);

      if (found) {
        const roleStr = (found.role && found.role.name) || found.role || 'Студент';
        return res.end(JSON.stringify({
          success: true,
          token: `token-${found.id}`,
          user: {
            id: found.id,
            fullName: found.fullName,
            email: found.email,
            groupName: found.groupName,
            role: roleStr,
            telegram: found.telegram,
            craftRank: found.craftRank,
            rating: typeof found.rating === 'number' ? found.rating : 4.8
          }
        }));
      } else {
        res.statusCode = 400;
        return res.end(JSON.stringify({ success: false, error: 'Неверный email или пароль' }));
      }
    }

    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const users = readJsonFile(USERS_FILE, []);
      const newId = `u-${Date.now().toString(36)}`;
      const newUser = {
        id: newId,
        fullName: jsonBody.fullName || 'Студент',
        email: jsonBody.email || `${newId}@kp11.ru`,
        groupName: jsonBody.groupName || 'КТ-26',
        rating: 5.0,
        telegram: '',
        telegramChatId: null,
        craftRank: 'Ассистент цеха',
        isSuspended: false,
        role: { name: 'Студент' },
        competencies: { camera: 85, sound: 80, light: 80, edit: 85 },
        skills: ['Специалист съёмочной группы']
      };
      users.push(newUser);
      writeJsonFile(USERS_FILE, users);

      return res.end(JSON.stringify({
        success: true,
        token: `token-${newId}`,
        user: {
          id: newId,
          fullName: newUser.fullName,
          email: newUser.email,
          groupName: newUser.groupName,
          role: 'Студент',
          rating: 5.0
        }
      }));
    }

    // 10. АДМИНИСТРИРОВАНИЕ
    if (pathname === '/api/admin/data' && req.method === 'GET') {
      const users = readJsonFile(USERS_FILE, []);
      const settings = readJsonFile(SETTINGS_FILE, {});
      return res.end(JSON.stringify({ success: true, users, settings, roles: [] }));
    }

    if (pathname === '/api/admin/settings' && req.method === 'POST') {
      writeJsonFile(SETTINGS_FILE, jsonBody);
      return res.end(JSON.stringify({ success: true, settings: jsonBody }));
    }

    const userPatchMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/role)?$/);
    if (userPatchMatch && req.method === 'PATCH') {
      const targetUserId = userPatchMatch[1];
      const users = readJsonFile(USERS_FILE, []);
      users.forEach(u => {
        if (u.id === targetUserId) {
          if (jsonBody.fullName) u.fullName = jsonBody.fullName;
          if (jsonBody.groupName) u.groupName = jsonBody.groupName;
          if (jsonBody.rating !== undefined) u.rating = Number(jsonBody.rating);
          if (jsonBody.telegram !== undefined) u.telegram = jsonBody.telegram;
          if (jsonBody.role || jsonBody.roleName) {
            const rName = jsonBody.roleName || (jsonBody.role && jsonBody.role.name) || jsonBody.role || 'Студент';
            u.role = { name: rName };
          }
        }
      });
      writeJsonFile(USERS_FILE, users);
      return res.end(JSON.stringify({ success: true, message: 'Пользователь обновлён' }));
    }

    // 11. ПОСЕЩАЕМОСТЬ И ОТВЕТ НА ВЫЗЫВНОЙ
    if (pathname === '/api/crew/attendance' && req.method === 'POST') {
      const { crewMemberId, attendance } = jsonBody;
      const shoots = readJsonFile(SHOOTS_FILE, []);
      shoots.forEach(s => {
        if (Array.isArray(s.crew)) {
          s.crew.forEach(c => {
            if (c.id === crewMemberId || c.userId === crewMemberId) {
              c.attendance = attendance;
            }
          });
        }
      });
      writeJsonFile(SHOOTS_FILE, shoots);
      recalculateRatings();
      return res.end(JSON.stringify({ success: true }));
    }

    if (pathname === '/api/crew/response' && req.method === 'POST') {
      const { crewMemberId, status } = jsonBody;
      const shoots = readJsonFile(SHOOTS_FILE, []);
      shoots.forEach(s => {
        if (Array.isArray(s.crew)) {
          s.crew.forEach(c => {
            if (c.id === crewMemberId || c.userId === crewMemberId) {
              c.status = status;
            }
          });
        }
      });
      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true }));
    }

    // 12. TELEGRAM ТЕСТ И РАССЫЛКА
    if (pathname === '/api/telegram/test' && req.method === 'POST') {
      const settings = readJsonFile(SETTINGS_FILE, {});
      const token = jsonBody.token || settings.telegramBotToken;
      const chatId = jsonBody.chatId || settings.defaultChatId;
      if (!token || !chatId) {
        return res.end(JSON.stringify({ success: false, error: 'Укажите токен бота и Chat ID' }));
      }
      const testMsg = `<b>Медиацентр КП11 // Тест связи</b>\n\nТестовое оповещение успешно доставлено в Telegram!\nБот готов к оперативной рассылке вызывных листов.`;
      const ok = await sendTelegramMessage(token, chatId, testMsg);
      if (ok) {
        return res.end(JSON.stringify({ success: true, message: 'Тестовое оповещение доставлено в Telegram!' }));
      } else {
        return res.end(JSON.stringify({ success: false, error: 'Не удалось отправить сообщение в Telegram' }));
      }
    }

    if (pathname === '/api/telegram/dispatch' && req.method === 'POST') {
      const targetShootId = jsonBody.shootId || (jsonBody.shoot && jsonBody.shoot.id);
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const shoot = jsonBody.shoot || shoots.find(s => s.id === targetShootId);
      if (shoot) {
        const report = await dispatchTelegramCallsheet(shoot);
        return res.end(JSON.stringify({ success: true, report }));
      }
      return res.end(JSON.stringify({ success: false, message: 'Смена не найдена' }));
    }

    // 13. ЦИТАТЫ КИНОБОРДА
    if (pathname === '/api/cinemaboard' && req.method === 'GET') {
      const quotes = [
        "«Кино — это жизнь, с которой вывели пятна». Продолжаем двигаться по сценарию! — Альфред Хичкок",
        "«Кинематограф не должен быть куском жизни, он должен быть произведением искусства». — Стэнли Кубрик",
        "«Великие фильмы рождаются из великих идей и безупречной работы команды». — Жан-Люк Годар",
        "«Смонтировать фильм — значит заново вдохнуть в него ритм и жизнь». — Андрей Тарковский",
        "«Свет на съёмочной площадке рисует историю задолго до того, как актёр скажет первую реплику». — Роджер Дикинс"
      ];
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      return res.end(JSON.stringify({ success: true, message: q }));
    }

    // Fallback для остальных API
    return res.end(JSON.stringify({ success: true }));
  }

  // ----------------- РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ -----------------
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 404;
        return res.end('Not Found');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`>>> KP11 Production Server active on port ${PORT}`);
  console.log(`>>> Localhost: http://localhost:${PORT}/`);
  console.log(`>>> Mobile / LAN: http://0.0.0.0:${PORT}/`);
});
