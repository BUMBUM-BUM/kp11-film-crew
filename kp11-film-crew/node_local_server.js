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
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const MASTER_TASKS_FILE = path.join(DATA_DIR, 'master_tasks.json');
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

let store = null;
try { store = require('./data/store'); } catch (e) {}
let bot = null;
try { bot = require('./bot'); } catch (e) {}

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

function enrichUsersWithFeedback(users) {
  const comments = readJsonFile(COMMENTS_FILE, []);
  const now = Date.now();
  return (users || []).map(u => {
    const valid = comments.filter(c => {
      if (c.studentId !== u.id) return false;
      const t = new Date(c.createdAt || 0).getTime();
      return (now - t) <= SIX_MONTHS_MS;
    });
    const likes = valid.filter(c => c.type === 'POSITIVE').length;
    const dislikes = valid.filter(c => c.type === 'NEGATIVE').length;
    return {
      ...u,
      likes,
      dislikes,
      isBlacklisted: !!(u.isBlacklisted || u.isSuspended)
    };
  });
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
    .slice(0, 24) || 'student';
}

function parseChatTargets(raw, fallbackTopicId = null) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[\s,;\n\r]+/);
  const results = [];
  const defaultThread = (fallbackTopicId && String(fallbackTopicId).trim()) 
    ? parseInt(String(fallbackTopicId).trim(), 10) 
    : null;

  for (let item of items) {
    item = String(item).trim();
    if (!item) continue;

    let chatId = item;
    let threadId = defaultThread;

    const privateLinkMatch = item.match(/(?:https?:\/\/)?t\.me\/c\/(\d+)(?:\/(\d+))?/i);
    if (privateLinkMatch) {
      chatId = `-100${privateLinkMatch[1]}`;
      if (privateLinkMatch[2]) {
        threadId = parseInt(privateLinkMatch[2], 10);
      }
    } else {
      const publicLinkMatch = item.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)(?:\/(\d+))?/i);
      if (publicLinkMatch && !['joinchat', 'c', 'addstickers'].includes(publicLinkMatch[1].toLowerCase())) {
        chatId = `@${publicLinkMatch[1]}`;
        if (publicLinkMatch[2]) {
          threadId = parseInt(publicLinkMatch[2], 10);
        }
      } else {
        const combinedMatch = item.match(/^([-\d]+|@[a-zA-Z0-9_]+)[:/](\d+)$/);
        if (combinedMatch) {
          chatId = combinedMatch[1];
          threadId = parseInt(combinedMatch[2], 10);
        }
      }
    }

    results.push({
      chatId,
      messageThreadId: (threadId !== null && !isNaN(threadId)) ? threadId : null
    });
  }
  return results;
}

// Отправка вызывного в Telegram с поддержкой интерактивных кнопок и топиков форумов
function sendTelegramMessage(botToken, chatId, text, replyMarkup = null, messageThreadId = null) {
  return new Promise((resolve) => {
    if (!botToken || !chatId) return resolve(false);
    const bodyObj = {
      chat_id: String(chatId).trim(),
      text,
      parse_mode: 'HTML'
    };
    if (replyMarkup) {
      bodyObj.reply_markup = replyMarkup;
    }
    if (messageThreadId) {
      bodyObj.message_thread_id = parseInt(messageThreadId, 10);
    }
    const postData = JSON.stringify(bodyObj);

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

const recentNodeCallsheetDispatches = new Map();

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

  // Персональные сообщения участникам с интерактивными кнопками
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
          `<i>Подтвердите участие с помощью кнопок ниже:</i>`;

        const replyMarkup = {
          inline_keyboard: [
            [
              { text: '✅ Подтверждаю явку', callback_data: `accept:${shoot.id}` },
              { text: '❌ Не могу (отклонить)', callback_data: `decline:${shoot.id}` }
            ]
          ]
        };

        const ok = await sendTelegramMessage(botToken, u.telegramChatId, msg, replyMarkup);
        if (ok) delivered++;
      }
    }
  }

  // Общие чаты и топики (без кнопок и с защитой от дублирования)
  if (settings.defaultChatId) {
    const targets = parseChatTargets(settings.defaultChatId, settings.telegramTopicId);
    for (const target of targets) {
      const dispatchKey = `${shoot.id}:${target.chatId}:${target.messageThreadId || ''}`;
      const lastSent = recentNodeCallsheetDispatches.get(dispatchKey);
      if (lastSent && (Date.now() - lastSent) < 60000) {
        continue;
      }
      recentNodeCallsheetDispatches.set(dispatchKey, Date.now());

      const groupMsg = `🎬 <b>НОВАЯ СМЕНА В ПРОИЗВОДСТВЕ // КП11</b>\n` +
        `════════════════════════════════════\n` +
        `Проект: <b>${title}</b>\n` +
        `Формат: <b>${format}</b>\n` +
        `Дата и время: <b>${dateStr}</b>\n` +
        `Локация: <b>${loc}</b>\n` +
        `Мастер смены: <b>${master}</b>\n` +
        `════════════════════════════════════`;
      const ok = await sendTelegramMessage(botToken, target.chatId, groupMsg, null, target.messageThreadId);
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

    // Health check and watchdog telemetry
    if ((pathname === '/api/health' || pathname === '/api/watchdog/status') && req.method === 'GET') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const watchdogStatus = readJsonFile(path.join(DATA_DIR, 'watchdog_status.json'), {});
      return res.end(JSON.stringify({
        success: true,
        status: 'UP',
        uptime: process.uptime(),
        shootsCount: shoots.length,
        usersCount: users.length,
        watchdog: watchdogStatus,
        timestamp: new Date().toISOString()
      }));
    }

    // Notifications endpoints
    if (pathname === '/api/notifications/vapid-public-key' && req.method === 'GET') {
      return res.end(JSON.stringify({ publicKey: '' }));
    }
    if (pathname === '/api/notifications/subscribe' && req.method === 'POST') {
      return res.end(JSON.stringify({ success: true }));
    }

    if (pathname === '/api/telegram/status' && req.method === 'GET') {
      return res.end(JSON.stringify({
        active: true,
        botUsername: 'KP11_FilmCrew_Bot',
        tokenConfigured: true
      }));
    }

    // Master developer bridge endpoints (@Min1_M1chael)
    if (pathname === '/api/master/tasks' && req.method === 'GET') {
      const masterData = store ? store.getMasterTasksData() : readJsonFile(MASTER_TASKS_FILE, { tasks: [] });
      return res.end(JSON.stringify({ success: true, tasks: masterData.tasks || [] }));
    }

    if (pathname === '/api/master/tasks' && req.method === 'POST') {
      const task = store 
        ? store.addMasterTask(jsonBody.text || jsonBody.task, '@Min1_M1chael') 
        : { id: 'TASK-' + Date.now(), text: jsonBody.text };
      return res.end(JSON.stringify({ success: true, task }));
    }

    if (pathname.startsWith('/api/master/tasks/') && (req.method === 'PATCH' || req.method === 'POST')) {
      const taskId = pathname.split('/').pop();
      const updated = store ? store.updateMasterTask(taskId, jsonBody) : null;
      return res.end(JSON.stringify({ success: !!updated, task: updated }));
    }

    if (pathname === '/api/master/message' && req.method === 'POST') {
      if (bot && typeof bot.sendMessage === 'function') {
        const masterChatId = store ? store.getMasterChatId() : '2129288136';
        const msgText = jsonBody.message || jsonBody.text || '';
        bot.sendMessage(masterChatId, msgText).then(result => {
          res.end(JSON.stringify({ success: true, result }));
        }).catch(err => {
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
      }
      return res.end(JSON.stringify({ success: false, error: 'Bot sendMessage not available' }));
    }

    if (pathname === '/api/master/ask' && req.method === 'POST') {
      if (bot && typeof bot.askMaster === 'function') {
        const questionText = jsonBody.question || jsonBody.text;
        const options = jsonBody.options || [];
        bot.askMaster(questionText, options).then(result => {
          res.end(JSON.stringify({ success: true, result }));
        }).catch(err => {
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
      }
      return res.end(JSON.stringify({ success: false, error: 'Bot askMaster not available' }));
    }

    if (pathname === '/api/master/questions' && req.method === 'GET') {
      const masterData = store ? store.getMasterTasksData() : readJsonFile(MASTER_TASKS_FILE, { questions: [] });
      return res.end(JSON.stringify({ success: true, questions: masterData.questions || [] }));
    }

    if (pathname === '/api/master/deploy' && req.method === 'POST') {
      if (bot && typeof bot.triggerDeploy === 'function') {
        bot.triggerDeploy(jsonBody.message || 'deploy: triggered via API').then(result => {
          res.end(JSON.stringify({ success: true, result }));
        }).catch(err => {
          res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
      }
      return res.end(JSON.stringify({ success: false, error: 'triggerDeploy not available' }));
    }

    // 1. GET /api/shoots
    if (pathname === '/api/shoots' && req.method === 'GET') {
      const rawShoots = readJsonFile(SHOOTS_FILE, []);
      const shoots = rawShoots.filter(s => s && s.id !== 'shoot-prod-1' && s.id !== 'shoot-1792450290828');
      const users = readJsonFile(USERS_FILE, []);
      const completed = shoots.filter(s => s.isCompleted).length;

      let authUserId = '';
      const auth = req.headers.authorization || '';
      const match = auth.match(/Bearer\s+(?:token-)?([^\s]+)/i);
      if (match) authUserId = match[1];

      let targetUser = users.find(u => u.id === authUserId || u.email === authUserId);
      if (!targetUser && authUserId === 'student-token') targetUser = users.find(u => u.id === 'u1');
      if (!targetUser && (authUserId === 'admin-token' || authUserId === 'admin-1')) targetUser = users.find(u => u.id === 'admin-1');
      if (!targetUser) targetUser = users.find(u => u.id === 'master-1') || users[0];

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
        students: enrichUsersWithFeedback(users),
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

      // Проверка прав: студентам запрещено создавать смены
      let authUserId = '';
      const auth = req.headers.authorization || '';
      const matchAuth = auth.match(/Bearer\s+(?:token-)?([^\s]+)/i);
      if (matchAuth) authUserId = matchAuth[1];
      let callerUser = users.find(u => u.id === authUserId || u.email === authUserId);
      if (!callerUser && authUserId === 'student-token') callerUser = users.find(u => u.id === 'u1');
      if (callerUser) {
        const roleName = (callerUser.role && callerUser.role.name) || (typeof callerUser.role === 'string' ? callerUser.role : '');
        if (roleName === 'Студент') {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: 'Студенты не имеют прав создавать съёмочные смены' }));
        }
      }

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
            department: ca.department || 'cinema',
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
        date: jsonBody.date || new Date().toISOString().split('T')[0],
        callTime: jsonBody.callTime || '10:00',
        startTime: jsonBody.startTime || '11:30',
        endTime: jsonBody.endTime || '18:00',
        timeline: Array.isArray(jsonBody.timeline) ? jsonBody.timeline : [
          { time: jsonBody.callTime || '10:00', label: 'Сбор съёмочной группы' },
          { time: jsonBody.startTime || '11:30', label: 'Мотор! Начало съёмки' },
          { time: jsonBody.endTime || '18:00', label: 'Окончание смены' }
        ],
        location: jsonBody.location || 'Павильон КП11',
        latitude: parseFloat(jsonBody.latitude) || 55.858244,
        longitude: parseFloat(jsonBody.longitude) || 37.518423,
        isCompleted: false,
        creator: { fullName: (jsonBody.creator && jsonBody.creator.fullName) || 'Бадиков Семён Станиславович' },
        equipment: Array.isArray(jsonBody.equipment) ? jsonBody.equipment : [],
        crew: crewList
      };

      const updatedShoots = [newShoot, ...shoots.filter(s => s.id !== shootId)];
      writeJsonFile(SHOOTS_FILE, updatedShoots);

      // Рассылка вызывных в Telegram
      dispatchTelegramCallsheet(newShoot).catch(() => {});

      return res.end(JSON.stringify({ success: true, id: newShoot.id, shoot: newShoot }));
    }

    // 3. DELETE /api/shoots/:id или DELETE /api/admin/shoots/:id
    const deleteMatch = pathname.match(/^\/api\/(?:admin\/)?shoots\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const targetId = deleteMatch[1];
      if (targetId === 'all' || targetId === 'clear') {
        writeJsonFile(SHOOTS_FILE, []);
        recalculateRatings();
        return res.end(JSON.stringify({ success: true, message: 'Все смены очищены' }));
      }
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const filtered = shoots.filter(s => s.id !== targetId);
      writeJsonFile(SHOOTS_FILE, filtered);
      recalculateRatings();
      return res.end(JSON.stringify({ success: true, message: 'Смена удалена' }));
    }

    // 4. POST /api/shoots/complete (Завершение смены)
    if (pathname === '/api/shoots/complete' && req.method === 'POST') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const targetShootId = jsonBody.shootId;

      let completedShoot = null;
      shoots.forEach(sh => {
        if (sh.id === targetShootId) {
          sh.isCompleted = true;
          completedShoot = sh;
        }
      });

      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true, shoot: completedShoot }));
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

      // Лидеры среди студентов (только студенты с реальными выставленными оценками)
      const studentLeaders = users
        .filter(u => {
          const role = (u.role && u.role.name) || (typeof u.role === 'string' ? u.role : 'Студент');
          return role.includes('Студент') && !u.isSuspended && typeof u.rating === 'number' && u.rating > 0;
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
            rating: u.rating,
            participations: partCount
          };
        })
        .sort((a, b) => b.rating - a.rating || b.participations - a.participations);

      // Групповой рейтинг (только группы, где студенты получили оценки)
      const groupMap = {};
      studentLeaders.forEach(st => {
        const g = st.groupName || 'КТ-26';
        if (!groupMap[g]) groupMap[g] = { sum: 0, count: 0, participations: 0 };
        groupMap[g].sum += st.rating;
        groupMap[g].count++;
        groupMap[g].participations += st.participations;
      });

      const groupsRating = Object.keys(groupMap)
        .filter(g => groupMap[g].count > 0)
        .map(g => ({
          groupName: g,
          avgRating: Math.round((groupMap[g].sum / groupMap[g].count) * 10) / 10,
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

    // POST /api/inventory (Добавление единиц техники с поддержкой количества и разных серийников)
    if (pathname === '/api/inventory' && req.method === 'POST') {
      const inventory = readJsonFile(INVENTORY_FILE, []);
      const { name, serialNumber, serialNumbers, quantity, category, notes, status, location, signedBy } = jsonBody;

      const trimmedName = (name || 'Съёмочное оборудование').trim();
      const qty = Math.max(1, parseInt(quantity, 10) || 1);

      let serialsList = [];
      if (Array.isArray(serialNumbers)) {
        serialsList = serialNumbers.map(s => String(s).trim()).filter(Boolean);
      } else if (typeof serialNumbers === 'string' && serialNumbers.trim()) {
        serialsList = serialNumbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      } else if (serialNumber && String(serialNumber).includes(',')) {
        serialsList = String(serialNumber).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      } else if (serialNumber && String(serialNumber).trim()) {
        serialsList = [String(serialNumber).trim()];
      }

      const totalCount = Math.max(qty, serialsList.length);
      const prefix = (trimmedName.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 4) || 'EQ').toUpperCase();
      const createdItems = [];

      for (let i = 0; i < totalCount; i++) {
        let sn = serialsList[i];
        if (!sn) {
          sn = `${prefix}-${String(100 + i + Math.floor(Math.random() * 900))}`;
        }

        const newItem = {
          id: (i === 0 && jsonBody.id) ? jsonBody.id : `eq-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
          name: trimmedName,
          category: category || 'Оборудование',
          serialNumber: sn,
          status: status || 'AVAILABLE',
          location: location || 'Склад техники ЦКТ КП11',
          notes: notes || '',
          signedBy: signedBy || 'Бадиков Семён Станиславович',
          signedAt: new Date().toISOString()
        };

        createdItems.push(newItem);
        inventory.unshift(newItem);
      }

      writeJsonFile(INVENTORY_FILE, inventory);
      return res.end(JSON.stringify({
        success: true,
        count: createdItems.length,
        items: createdItems,
        item: createdItems[0],
        inventory
      }));
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

    // PUT /api/inventory/:id (Редактирование единицы техники)
    const invPutMatch = pathname.match(/^\/api\/inventory\/([^/]+)$/);
    if (invPutMatch && req.method === 'PUT') {
      const eqId = invPutMatch[1];
      const inventory = readJsonFile(INVENTORY_FILE, []);
      let updatedItem = null;
      const updated = inventory.map(item => {
        if (item.id === eqId) {
          updatedItem = {
            ...item,
            name: jsonBody.name !== undefined ? jsonBody.name : item.name,
            category: jsonBody.category !== undefined ? jsonBody.category : item.category,
            serialNumber: jsonBody.serialNumber !== undefined ? jsonBody.serialNumber : item.serialNumber,
            notes: jsonBody.notes !== undefined ? jsonBody.notes : item.notes,
            location: jsonBody.location !== undefined ? jsonBody.location : item.location,
            updatedAt: new Date().toISOString()
          };
          return updatedItem;
        }
        return item;
      });
      writeJsonFile(INVENTORY_FILE, updated);
      return res.end(JSON.stringify({ success: true, item: updatedItem, inventory: updated }));
    }

    // 8.1. УПРАВЛЕНИЕ ЛОКАЦИЯМИ СЪЁМОК (CRUD)
    // GET /api/locations
    if (pathname === '/api/locations' && req.method === 'GET') {
      const locations = readJsonFile(LOCATIONS_FILE, []);
      return res.end(JSON.stringify({ success: true, locations }));
    }

    // POST /api/locations
    if (pathname === '/api/locations' && req.method === 'POST') {
      const locations = readJsonFile(LOCATIONS_FILE, []);
      const newLoc = {
        id: jsonBody.id || `loc-${Date.now()}`,
        name: jsonBody.name || 'Новая съёмочная площадка',
        type: jsonBody.type || 'СТУДИЯ',
        latitude: parseFloat(jsonBody.latitude) || 55.858244,
        longitude: parseFloat(jsonBody.longitude) || 37.518423,
        badge: jsonBody.badge || jsonBody.name || 'Локация'
      };
      const updated = [...locations, newLoc];
      writeJsonFile(LOCATIONS_FILE, updated);
      return res.end(JSON.stringify({ success: true, location: newLoc, locations: updated }));
    }

    // PUT /api/locations/:id
    const locPutMatch = pathname.match(/^\/api\/locations\/([^/]+)$/);
    if (locPutMatch && req.method === 'PUT') {
      const locId = locPutMatch[1];
      const locations = readJsonFile(LOCATIONS_FILE, []);
      let updatedLoc = null;
      const updated = locations.map(l => {
        if (l.id === locId) {
          updatedLoc = {
            ...l,
            name: jsonBody.name !== undefined ? jsonBody.name : l.name,
            type: jsonBody.type !== undefined ? jsonBody.type : l.type,
            latitude: jsonBody.latitude !== undefined ? parseFloat(jsonBody.latitude) : l.latitude,
            longitude: jsonBody.longitude !== undefined ? parseFloat(jsonBody.longitude) : l.longitude,
            badge: jsonBody.badge !== undefined ? jsonBody.badge : l.badge
          };
          return updatedLoc;
        }
        return l;
      });
      writeJsonFile(LOCATIONS_FILE, updated);
      return res.end(JSON.stringify({ success: true, location: updatedLoc, locations: updated }));
    }

    // DELETE /api/locations/:id
    const locDelMatch = pathname.match(/^\/api\/locations\/([^/]+)$/);
    if (locDelMatch && req.method === 'DELETE') {
      const locId = locDelMatch[1];
      const locations = readJsonFile(LOCATIONS_FILE, []);
      const updated = locations.filter(l => l.id !== locId);
      writeJsonFile(LOCATIONS_FILE, updated);
      return res.end(JSON.stringify({ success: true, locations: updated, message: 'Локация удалена' }));
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

    // Заочная регистрация студента с липовой почтой
    if ((pathname === '/api/admin/proxy-register' || pathname === '/api/users/proxy-register') && req.method === 'POST') {
      const users = readJsonFile(USERS_FILE, []);
      const newId = `u-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
      const fullName = (jsonBody.fullName || 'Студент').trim();
      let email = (jsonBody.email || '').trim().toLowerCase();
      if (!email || email.endsWith('@kp11.local') || email.includes('dummy') || email.includes('temp') || email.includes('auto')) {
        const translit = transliterateRussian(fullName);
        email = `${translit}_${Math.random().toString(36).substring(2, 6)}@kp11.local`;
      }
      const rawPassword = jsonBody.password || 'kp11_film2026';

      const newUser = {
        id: newId,
        fullName: fullName,
        email: email,
        groupName: (jsonBody.groupName || 'КТ-26').trim(),
        rating: 5.0,
        telegram: jsonBody.telegram ? (jsonBody.telegram.startsWith('@') ? jsonBody.telegram : '@' + jsonBody.telegram) : '',
        telegramChatId: null,
        craftRank: jsonBody.craftRank || 'Ассистент цеха',
        craftDept: jsonBody.craftDept || 'cinema',
        isSuspended: false,
        isBlacklisted: false,
        role: { name: 'Студент' },
        competencies: { camera: 75, sound: 75, light: 75, edit: 75 },
        skills: ['Специалист съёмочной группы'],
        likes: 0,
        dislikes: 0
      };
      users.push(newUser);
      writeJsonFile(USERS_FILE, users);

      return res.end(JSON.stringify({
        success: true,
        user: newUser,
        credentials: {
          email: newUser.email,
          password: rawPassword
        },
        message: `Студент ${newUser.fullName} успешно заочно зарегистрирован!`
      }));
    }

    // 10. АДМИНИСТРИРОВАНИЕ
    if (pathname === '/api/admin/data' && req.method === 'GET') {
      const users = readJsonFile(USERS_FILE, []);
      const settings = readJsonFile(SETTINGS_FILE, {});
      return res.end(JSON.stringify({ success: true, users: enrichUsersWithFeedback(users), settings, roles: [] }));
    }

    if (pathname === '/api/admin/settings' && req.method === 'POST') {
      writeJsonFile(SETTINGS_FILE, jsonBody);
      return res.end(JSON.stringify({ success: true, settings: jsonBody }));
    }

    // Черный список
    const blacklistMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(?:blacklist|suspend)$/);
    if (blacklistMatch && req.method === 'POST') {
      const targetUserId = blacklistMatch[1];
      const users = readJsonFile(USERS_FILE, []);
      let updatedUser = null;
      users.forEach(u => {
        if (u.id === targetUserId) {
          const flag = jsonBody.isBlacklisted !== undefined ? !!jsonBody.isBlacklisted : (jsonBody.isSuspended !== undefined ? !!jsonBody.isSuspended : !u.isBlacklisted);
          u.isBlacklisted = flag;
          u.isSuspended = flag;
          updatedUser = u;
        }
      });
      writeJsonFile(USERS_FILE, users);
      return res.end(JSON.stringify({ success: true, user: updatedUser, isBlacklisted: updatedUser ? updatedUser.isBlacklisted : false }));
    }

    // Удаление пользователя
    const userDelMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (userDelMatch && req.method === 'DELETE') {
      const targetUserId = userDelMatch[1];
      const users = readJsonFile(USERS_FILE, []);
      const filtered = users.filter(u => u.id !== targetUserId);
      writeJsonFile(USERS_FILE, filtered);
      return res.end(JSON.stringify({ success: true, message: 'Пользователь удален' }));
    }

    // Полное редактирование пользователя администратором (ФИО, группа, роль, рейтинг, компетенции, telegram, chatId, блокировка)
    const userFullEditMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)(?:\/full)?$/);
    if (userFullEditMatch && (req.method === 'PUT' || req.method === 'PATCH' || (req.method === 'POST' && pathname.endsWith('/full')))) {
      const targetUserId = userFullEditMatch[1];
      const users = readJsonFile(USERS_FILE, []);
      let updatedUser = null;
      users.forEach(u => {
        if (u.id === targetUserId) {
          if (jsonBody.fullName !== undefined) u.fullName = jsonBody.fullName;
          if (jsonBody.email !== undefined) u.email = jsonBody.email;
          if (jsonBody.groupName !== undefined) u.groupName = jsonBody.groupName;
          if (jsonBody.rating !== undefined) u.rating = Number(jsonBody.rating);
          if (jsonBody.telegram !== undefined) u.telegram = jsonBody.telegram;
          if (jsonBody.telegramChatId !== undefined) u.telegramChatId = jsonBody.telegramChatId ? String(jsonBody.telegramChatId).trim() : null;
          if (jsonBody.craftRank !== undefined) u.craftRank = jsonBody.craftRank;
          if (jsonBody.completedShoots !== undefined) u.completedShoots = Number(jsonBody.completedShoots);
          if (jsonBody.isBlacklisted !== undefined) {
            u.isBlacklisted = Boolean(jsonBody.isBlacklisted);
            u.isSuspended = Boolean(jsonBody.isBlacklisted);
          } else if (jsonBody.isSuspended !== undefined) {
            u.isSuspended = Boolean(jsonBody.isSuspended);
            u.isBlacklisted = Boolean(jsonBody.isSuspended);
          }
          if (jsonBody.newPassword) {
            u.password = jsonBody.newPassword;
          }
          if (jsonBody.role || jsonBody.roleName) {
            const rName = jsonBody.roleName || (jsonBody.role && jsonBody.role.name) || jsonBody.role || 'Студент';
            u.role = { name: rName };
          }
          if (jsonBody.avatar !== undefined) u.avatar = jsonBody.avatar;
          if (jsonBody.competencies && typeof jsonBody.competencies === 'object') {
            u.competencies = {
              camera: Number(jsonBody.competencies.camera ?? (u.competencies && u.competencies.camera) ?? 85),
              sound: Number(jsonBody.competencies.sound ?? (u.competencies && u.competencies.sound) ?? 80),
              light: Number(jsonBody.competencies.light ?? (u.competencies && u.competencies.light) ?? 80),
              edit: Number(jsonBody.competencies.edit ?? (u.competencies && u.competencies.edit) ?? 85)
            };
          }
          if (Array.isArray(jsonBody.skills)) {
            u.skills = jsonBody.skills;
          }
          updatedUser = u;
        }
      });
      writeJsonFile(USERS_FILE, users);
      return res.end(JSON.stringify({ success: true, user: updatedUser, message: 'Все данные пользователя успешно сохранены' }));
    }

    // POST /api/users/:id/avatar или POST /api/users/profile/avatar
    const userAvatarMatch = pathname.match(/^\/api\/users\/(?:profile\/avatar|([^/]+)\/avatar)$/);
    if (userAvatarMatch && req.method === 'POST') {
      const targetUserId = userAvatarMatch[1] || jsonBody.userId;
      const { avatar } = jsonBody;
      const users = readJsonFile(USERS_FILE, []);
      let updatedUser = null;
      users.forEach(u => {
        if (u.id === targetUserId || (!targetUserId && jsonBody.email && u.email === jsonBody.email)) {
          u.avatar = avatar || null;
          updatedUser = u;
        }
      });
      if (updatedUser) {
        writeJsonFile(USERS_FILE, users);
        return res.end(JSON.stringify({ success: true, avatar: updatedUser.avatar, user: updatedUser }));
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ success: false, error: 'Пользователь не найден' }));
    }

    // POST/PUT /api/users/:id/competencies (Оценка 4 параметров из вкладки Отзывы или Админки)
    const userCompMatch = pathname.match(/^\/api\/users\/([^/]+)\/competencies$/);
    if (userCompMatch && (req.method === 'POST' || req.method === 'PUT')) {
      const targetUserId = userCompMatch[1];
      const comps = jsonBody.competencies || jsonBody;
      const users = readJsonFile(USERS_FILE, []);
      let updatedUser = null;
      users.forEach(u => {
        if (u.id === targetUserId) {
          u.competencies = {
            camera: Math.min(100, Math.max(0, Number(comps.camera ?? 0))),
            sound: Math.min(100, Math.max(0, Number(comps.sound ?? 0))),
            light: Math.min(100, Math.max(0, Number(comps.light ?? 0))),
            edit: Math.min(100, Math.max(0, Number(comps.edit ?? 0)))
          };
          const avgScore = (u.competencies.camera + u.competencies.sound + u.competencies.light + u.competencies.edit) / 4;
          u.rating = parseFloat((avgScore / 20).toFixed(1));
          updatedUser = u;
        }
      });
      if (updatedUser) {
        writeJsonFile(USERS_FILE, users);
        return res.end(JSON.stringify({ success: true, competencies: updatedUser.competencies, rating: updatedUser.rating, user: updatedUser }));
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ success: false, error: 'Пользователь не найден' }));
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

    // ----------------- СИСТЕМА КОММЕНТАРИЕВ И РЕЦЕНЗИЙ (ЛАЙКИ / ДИЗЛАЙКИ, 6 МЕСЯЦЕВ) -----------------
    if (pathname === '/api/comments' && req.method === 'GET') {
      const studentId = parsedUrl.searchParams.get('studentId');
      const comments = readJsonFile(COMMENTS_FILE, []);
      const now = Date.now();
      const valid = comments.filter(c => {
        if (studentId && c.studentId !== studentId) return false;
        const t = new Date(c.createdAt || 0).getTime();
        return (now - t) <= SIX_MONTHS_MS;
      });
      return res.end(JSON.stringify(valid));
    }

    if (pathname === '/api/comments' && req.method === 'POST') {
      const { studentId, studentName, type, text, shootId, shootTitle } = jsonBody;
      if (!studentId || !text || !text.trim()) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ success: false, error: 'Укажите студента и текст отзыва' }));
      }
      const comments = readJsonFile(COMMENTS_FILE, []);
      const newComment = {
        id: `com-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        studentId,
        studentName: studentName || '',
        authorId: 'master-1',
        authorName: 'Мастер Медиацентра',
        type: type === 'NEGATIVE' ? 'NEGATIVE' : 'POSITIVE',
        text: text.trim(),
        shootId: shootId || null,
        shootTitle: shootTitle || null,
        createdAt: new Date().toISOString()
      };
      comments.unshift(newComment);
      writeJsonFile(COMMENTS_FILE, comments);
      return res.end(JSON.stringify({ success: true, comment: newComment }));
    }

    const commentDelMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (commentDelMatch && req.method === 'DELETE') {
      const cId = commentDelMatch[1];
      const comments = readJsonFile(COMMENTS_FILE, []);
      const filtered = comments.filter(c => c.id !== cId);
      writeJsonFile(COMMENTS_FILE, filtered);
      return res.end(JSON.stringify({ success: true, message: 'Отзыв удален' }));
    }

    if (pathname === '/api/auth/change-password' && req.method === 'POST') {
      const { newPassword, userId } = jsonBody;
      const users = readJsonFile(USERS_FILE, []);
      const u = users.find(x => x.id === userId);
      if (u) {
        u.password = newPassword;
        writeJsonFile(USERS_FILE, users);
      }
      return res.end(JSON.stringify({ success: true, message: 'Пароль успешно обновлён' }));
    }

    // QR ЧЕК-ИН НА СЪЁМОЧНУЮ СМЕНУ
    const qrCheckinMatch = pathname.match(/^\/api\/shoots\/([^/]+)\/qr-checkin$/);
    if (qrCheckinMatch && req.method === 'POST') {
      const shootId = qrCheckinMatch[1];
      const studentId = (jsonBody.studentId || '').trim();
      const shoots = readJsonFile(SHOOTS_FILE, []);
      let matchedMember = null;
      let targetShoot = null;

      shoots.forEach(sh => {
        if (sh.id === shootId && Array.isArray(sh.crew)) {
          targetShoot = sh;
          sh.crew.forEach(cm => {
            if (cm.userId === studentId || cm.id === studentId || (cm.user && cm.user.id === studentId)) {
              cm.attendance = 'PRESENT';
              cm.status = 'ACCEPTED';
              matchedMember = cm;
            }
          });
        }
      });

      if (matchedMember) {
        writeJsonFile(SHOOTS_FILE, shoots);
        return res.end(JSON.stringify({
          success: true,
          message: 'Явка подтверждена по QR-пропуску!',
          member: matchedMember,
          shoot: targetShoot
        }));
      } else {
        return res.end(JSON.stringify({
          success: false,
          error: 'Участник не найден в составе съёмочной группы данной смены'
        }));
      }
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
      const { crewMemberId, status, declineReason, reason } = jsonBody;
      const actualReason = declineReason || reason || null;
      const shoots = readJsonFile(SHOOTS_FILE, []);
      shoots.forEach(s => {
        if (Array.isArray(s.crew)) {
          s.crew.forEach(c => {
            if (c.id === crewMemberId || c.userId === crewMemberId) {
              c.status = status;
              if (status === 'DECLINED') {
                c.declineReason = actualReason || c.declineReason || 'Не указана';
                c.declinedAt = new Date().toISOString();
              } else if (status === 'ACCEPTED') {
                c.confirmedAt = new Date().toISOString();
                c.declineReason = null;
              }
            }
          });
        }
      });
      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true }));
    }

    if ((pathname === '/api/crew/replace' || pathname.endsWith('/replace-crew')) && req.method === 'POST') {
      const { shootId, oldMemberId, oldUserId, newUserId, roleInShoot, department } = jsonBody;
      const targetShootId = shootId || (pathname.startsWith('/api/shoots/') ? pathname.split('/')[3] : null);
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const shoot = shoots.find(s => String(s.id) === String(targetShootId));
      const newUser = users.find(u => String(u.id) === String(newUserId));

      if (!shoot || !Array.isArray(shoot.crew)) {
        return res.end(JSON.stringify({ success: false, error: 'Смена не найдена' }));
      }
      if (!newUser) {
        return res.end(JSON.stringify({ success: false, error: 'Студент не найден в базе данных' }));
      }

      const memberIndex = shoot.crew.findIndex(c =>
        String(c.id) === String(oldMemberId || oldUserId) || String(c.userId) === String(oldMemberId || oldUserId)
      );
      if (memberIndex === -1) {
        return res.end(JSON.stringify({ success: false, error: 'Участник для замены не найден' }));
      }

      const oldMember = shoot.crew[memberIndex];
      const targetRole = roleInShoot || oldMember.roleInShoot || 'Оператор';
      const targetDept = department || oldMember.department || 'cinema';

      const newMember = {
        id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        shootId: shoot.id,
        userId: newUser.id,
        roleInShoot: targetRole,
        department: targetDept,
        status: 'PENDING',
        attendance: 'PRESENT',
        grade: null,
        declineReason: null,
        replacedOldMemberId: oldMember.id || oldMember.userId,
        user: {
          id: newUser.id,
          fullName: newUser.fullName,
          groupName: newUser.groupName,
          rating: newUser.rating,
          craftRank: newUser.craftRank,
          avatar: newUser.avatar || null,
          completedShoots: newUser.completedShoots || 0
        }
      };

      shoot.crew[memberIndex] = newMember;
      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true, updatedShoot: shoot, newMember }));
    }

    if ((pathname === '/api/crew/add' || pathname.endsWith('/crew/add')) && req.method === 'POST') {
      const { shootId, userId, roleInShoot, department } = jsonBody;
      const targetShootId = shootId || (pathname.startsWith('/api/shoots/') ? pathname.split('/')[3] : null);
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const shoot = shoots.find(s => String(s.id) === String(targetShootId));
      const user = users.find(u => String(u.id) === String(userId));

      if (!shoot) {
        return res.end(JSON.stringify({ success: false, error: 'Смена не найдена' }));
      }
      if (!user) {
        return res.end(JSON.stringify({ success: false, error: 'Студент не найден в базе данных' }));
      }
      if (!Array.isArray(shoot.crew)) {
        shoot.crew = [];
      }
      if (shoot.crew.some(c => String(c.userId || c.id) === String(userId))) {
        return res.end(JSON.stringify({ success: false, error: 'Этот студент уже назначен в смену' }));
      }

      const newMember = {
        id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        shootId: shoot.id,
        userId: user.id,
        roleInShoot: roleInShoot || 'Оператор',
        department: department || 'cinema',
        status: 'PENDING',
        attendance: 'PRESENT',
        grade: null,
        declineReason: null,
        user: {
          id: user.id,
          fullName: user.fullName,
          groupName: user.groupName,
          rating: user.rating,
          craftRank: user.craftRank,
          avatar: user.avatar || null,
          completedShoots: user.completedShoots || 0
        }
      };

      shoot.crew.push(newMember);
      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true, updatedShoot: shoot, newMember }));
    }

    if ((pathname === '/api/crew/remove' || pathname.endsWith('/crew/remove') || pathname.endsWith('/remove-crew')) && req.method === 'POST') {
      const { shootId, memberId, userId } = jsonBody;
      const targetShootId = shootId || (pathname.startsWith('/api/shoots/') ? pathname.split('/')[3] : null);
      const targetMemberId = memberId || userId;
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const shoot = shoots.find(s => String(s.id) === String(targetShootId));

      if (!shoot || !Array.isArray(shoot.crew)) {
        return res.end(JSON.stringify({ success: false, error: 'Смена не найдена' }));
      }

      const memberIndex = shoot.crew.findIndex(c =>
        String(c.id) === String(targetMemberId) || String(c.userId) === String(targetMemberId)
      );
      if (memberIndex === -1) {
        return res.end(JSON.stringify({ success: false, error: 'Участник не найден в этой смене' }));
      }

      const removedMember = shoot.crew.splice(memberIndex, 1)[0];
      writeJsonFile(SHOOTS_FILE, shoots);
      return res.end(JSON.stringify({ success: true, updatedShoot: shoot, removedMember }));
    }

    // 12. TELEGRAM ТЕСТ И РАССЫЛКА
    if (pathname === '/api/telegram/test' && req.method === 'POST') {
      const settings = readJsonFile(SETTINGS_FILE, {});
      const token = jsonBody.token || settings.telegramBotToken;
      const targetChatString = jsonBody.chatId || settings.defaultChatId;
      const topicId = jsonBody.topicId || settings.telegramTopicId || null;
      if (!token || !targetChatString) {
        return res.end(JSON.stringify({ success: false, error: 'Укажите токен бота и Chat ID' }));
      }
      const targets = parseChatTargets(targetChatString, topicId);
      if (targets.length === 0) {
        return res.end(JSON.stringify({ success: false, error: 'Укажите хотя бы один валидный Chat ID' }));
      }
      const testMsg = `<b>Медиацентр КП11 // Тест связи</b>\n\nТестовое оповещение успешно доставлено в Telegram!\nБот готов к оперативной рассылке вызывных листов.`;
      let okCount = 0;
      for (const t of targets) {
        const ok = await sendTelegramMessage(token, t.chatId, testMsg, null, t.messageThreadId);
        if (ok) okCount++;
      }
      if (okCount > 0) {
        return res.end(JSON.stringify({ success: true, message: `Тестовое оповещение доставлено в ${okCount} из ${targets.length} чатов/топиков!` }));
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

    // 13. ЦИТАТЫ КИНОБОРДА (Интеллектуальный подбор по времени суток и мастерству)
    if (pathname === '/api/cinemaboard' && req.method === 'GET') {
      const CINEMA_QUOTES = [
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

      const hour = new Date().getHours();
      let curTime = 'day';
      let timeBadge = 'ДНЕВНАЯ СМЕНА';
      if (hour >= 5 && hour < 12) { curTime = 'morning'; timeBadge = 'УТРЕННЯЯ СМЕНА'; }
      else if (hour >= 12 && hour < 18) { curTime = 'day'; timeBadge = 'ДНЕВНАЯ СМЕНА'; }
      else if (hour >= 18 && hour < 23) { curTime = 'evening'; timeBadge = 'ВЕЧЕРНЯЯ СМЕНА'; }
      else { curTime = 'night'; timeBadge = 'НОЧНАЯ СМЕНА'; }

      let matching = CINEMA_QUOTES.filter(q => q.time === curTime);
      if (matching.length === 0) matching = CINEMA_QUOTES;
      const q = matching[Math.floor(Math.random() * matching.length)];

      return res.end(JSON.stringify({
        success: true,
        text: q.text,
        author: q.author,
        timeBadge: timeBadge,
        message: `${q.text} — ${q.author}`
      }));
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
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`>>> KP11 Production Server active on port ${PORT}`);
  console.log(`>>> Localhost: http://localhost:${PORT}/`);
  console.log(`>>> Mobile / LAN: http://0.0.0.0:${PORT}/`);
});
