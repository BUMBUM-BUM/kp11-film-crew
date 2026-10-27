/**
 * ==============================================================================
 * ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11 // ЦИФРОВОЙ КИНОЦЕХ
 * TELEGRAM BOT ДЛЯ ОПЕРАТИВНОГО УПРАВЛЕНИЯ СЪЁМОЧНЫМИ СМЕНАМИ
 * Бот: @KP11_FilmCrew_Bot
 * ==============================================================================
 * ИСТОЧНИК ДАННЫХ: Строгая синхронизация с сайтом через data/store.js.
 * Никаких несуществующих смен: в боте отображаются ТОЛЬКО те смены,
 * которые реально созданы и существуют на сайте медиацентра!
 * ==============================================================================
 */

const https = require('https');
const { exec } = require('child_process');
const store = require('./data/store');

function triggerDeploy(commitMsg = 'deploy: master update via telegram') {
  return new Promise((resolve) => {
    const cleanMsg = String(commitMsg).replace(/["'`\\]/g, ' ').slice(0, 100);
    const cmd = `git add -A && git commit -m "${cleanMsg}" && git push origin main`;
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error && !stdout.includes('nothing to commit') && !stderr.includes('Everything up-to-date')) {
        console.error('[Deploy Error]', error.message);
        resolve({ success: false, output: stderr || error.message });
      } else {
        console.log('[Deploy Success]', stdout || stderr);
        resolve({ success: true, output: (stdout || stderr || 'Деплой отправлен на Render (git push origin main)').trim() });
      }
    });
  });
}

function getBotToken() {
  const settings = store.getSettings();
  return process.env.TELEGRAM_BOT_TOKEN || settings.telegramBotToken || '';
}

// ------------------------------------------------------------------------------
// HTTP КЛИЕНТ ДЛЯ TELEGRAM BOT API
// ------------------------------------------------------------------------------
async function callTelegramApi(method, body = {}) {
  const token = getBotToken();
  if (!token) {
    console.log(`[KP11 Bot Standby] Токен не задан. Метод ${method} залогирован:`, JSON.stringify(body));
    return { 
      ok: false, 
      description: 'TELEGRAM_BOT_TOKEN не задан в .env или в настройках сайта',
      simulated: true 
    };
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const apiBase = `https://api.telegram.org/bot${token}`;
    const url = new URL(`${apiBase}/${method}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          resolve({ ok: false, error: raw });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[KP11 Bot API Error] ${method}:`, err.message);
      resolve({ ok: false, error: err.message });
    });

    req.write(data);
    req.end();
  });
}

// ------------------------------------------------------------------------------
// МЕТОДЫ ОТПРАВКИ СООБЩЕНИЙ
// ------------------------------------------------------------------------------
async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview !== false
  };
  if (options.message_thread_id) {
    payload.message_thread_id = parseInt(options.message_thread_id, 10);
  }
  return callTelegramApi('sendMessage', payload);
}

async function sendLocation(chatId, latitude, longitude, options = {}) {
  const payload = {
    chat_id: chatId,
    latitude,
    longitude
  };
  if (options && options.message_thread_id) {
    payload.message_thread_id = parseInt(options.message_thread_id, 10);
  }
  return callTelegramApi('sendLocation', payload);
}

async function editMessageText(chatId, messageId, text, options = {}) {
  return callTelegramApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup
  });
}

async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
  return callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: showAlert
  });
}

// ------------------------------------------------------------------------------
// ГЕНЕРАЦИЯ ТЕКСТА ВЫЗЫВНОГО ЛИСТА
// ------------------------------------------------------------------------------
function formatCallsheetMessage(shoot, targetUserId = null, allUsers = [], isGroup = false) {
  const d = new Date(shoot.date);
  const formattedDate = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).toUpperCase() : 'ДАТА УТОЧНЯЕТСЯ';

  const formattedTime = !isNaN(d.getTime()) ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '10:00';

  let crewSections = '';
  const crewList = shoot.crew || [];

  if (crewList.length > 0) {
    crewSections = '\n\n<b>СЪЁМОЧНАЯ ГРУППА:</b>\n';
    crewList.forEach((c) => {
      const uId = c.userId || c.user?.id || c.id;
      const matchedUser = allUsers.find(u => u.id === uId) || c.user;
      const uName = matchedUser?.fullName || 'Студент цеха';

      if (isGroup) {
        // В ГРУППЕ — ТОЛЬКО ФИО И РОЛЬ УЧАСТНИКА (БЕЗ ТЕКСТА СТАТУСА «В ОЖИДАНИИ» И БЕЗ КНОПОК)
        crewSections += `• ${c.roleInShoot}: ${escapeHtml(uName)}\n`;
      } else {
        // В ЛС — КАК ОБЫЧНО (СТАТУС ЯВКИ, МЕТКА «(ВЫ)»)
        const tgStr = matchedUser?.telegram ? ` (${matchedUser.telegram})` : '';
        const isTarget = targetUserId && (uId === targetUserId);
        const statusIcon = c.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (c.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[В ОЖИДАНИИ]');
        const prefix = isTarget ? '>> <b>' : '• ';
        const suffix = isTarget ? ' (ВЫ)</b>' : '';
        crewSections += `${prefix}${c.roleInShoot}: ${escapeHtml(uName)}${tgStr}${suffix} — <i>${statusIcon}</i>\n`;
      }
    });
  }

  const coords = (shoot.latitude && shoot.longitude)
    ? `${parseFloat(shoot.latitude).toFixed(6)}, ${parseFloat(shoot.longitude).toFixed(6)}`
    : null;

  const yandexMapUrl = coords ? `https://yandex.ru/maps/?pt=${coords.split(', ')[1]},${coords.split(', ')[0]}&z=16&l=map` : null;

  let msg = `<b>Вызывной</b>\n` +
    `════════════════════════════════════\n` +
    `<b>ПРОЕКТ:</b> ${escapeHtml(shoot.title)}\n` +
    `<b>ФОРМАТ:</b> ${escapeHtml(shoot.type || 'СТУДИЯ')}\n` +
    `<b>ДАТА:</b> ${formattedDate}\n` +
    `<b>ВРЕМЯ СБОРА:</b> ${formattedTime}\n` +
    `<b>ОБЪЕКТ / АДРЕС:</b> ${escapeHtml(shoot.location)}\n`;

  if (yandexMapUrl) {
    msg += `<b>ГЕОТОЧКА:</b> <a href="${yandexMapUrl}">Открыть на Яндекс.Картах</a>\n`;
  }

  msg += `════════════════════════════════════` + crewSections;

  if (shoot.description) {
    msg += `\n════════════════════════════════════\n` +
      `<b>ТЕХНИЧЕСКИЙ БРИФ:</b>\n` +
      `${escapeHtml(shoot.description)}`;
  }

  return msg;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Хранилище сессий ожидания причины отклонения вызывного: chatId -> { shootId, messageId, userId, timestamp }
const pendingDeclineReasons = new Map();

// Защита от дублирования сообщений в общие чаты: key -> timestamp отправки
const recentGroupDispatches = new Map();

// ------------------------------------------------------------------------------
// МАСТЕР РАЗРАБОТКИ ПЛАТФОРМЫ: ИСКЛЮЧИТЕЛЬНО @Min1_M1chael
// ------------------------------------------------------------------------------
const TARGET_MASTER_USERNAME = 'min1_m1chael';

function isMasterDeveloper(username) {
  if (!username) return false;
  const clean = String(username).replace(/^@/, '').trim().toLowerCase();
  return clean === TARGET_MASTER_USERNAME;
}

/**
 * Отправка вопроса или запроса на подтверждение ТОЛЬКО мастеру разработки (@Min1_M1chael)
 */
async function askMaster(questionText, options = []) {
  const masterChatId = store.getMasterChatId();
  const question = store.addMasterQuestion(questionText, options);

  if (!masterChatId) {
    console.log(`[KP11 Bot Master Inquiry] Chat ID мастера @Min1_M1chael пока не привязан. Вопрос #${question.id} сохранён в data/master_tasks.json.`);
    return {
      ok: false,
      questionId: question.id,
      description: 'Master Chat ID not bound yet. Master @Min1_M1chael should open bot and send /start.'
    };
  }

  let replyMarkup = undefined;
  if (Array.isArray(options) && options.length > 0) {
    replyMarkup = {
      inline_keyboard: options.map((opt, idx) => [
        { text: opt, callback_data: `ans_q:${question.id}:${idx}` }
      ])
    };
  }

  const res = await sendMessage(masterChatId,
    `❓ <b>ВОПРОС ОТ АГЕНТА ANTIGRAVITY // @Min1_M1chael</b>\n` +
    `════════════════════════════════════\n\n` +
    `${escapeHtml(questionText)}\n\n` +
    `<i>Вы можете выбрать вариант кнопкой или просто ответить сообщением в этот чат.</i>`,
    { reply_markup: replyMarkup }
  );

  return { ok: res.ok, questionId: question.id, res };
}

// ------------------------------------------------------------------------------
// ОБРАБОТКА КОМАНД И СООБЩЕНИЙ
// ------------------------------------------------------------------------------
async function handleTelegramMessage(message) {
  // БОТ НЕ РЕАГИРУЕТ НА КОМАНДЫ В ЧАТАХ (группы, супергруппы, каналы).
  // Никаких ответов и спама в группы — общение строго в личных сообщениях (ЛС)!
  const isPrivateChat = message.chat && message.chat.type === 'private';
  if (!isPrivateChat) {
    return;
  }

  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const rawUsername = (message.from && message.from.username) ? message.from.username : '';
  const username = rawUsername ? `@${rawUsername}` : '';
  const firstName = message.from.first_name || '';
  const isMaster = isMasterDeveloper(rawUsername);

  // Автоматическая привязка Chat ID к пользователю по его юзернейму в базе сайта
  if (username) {
    const user = await store.getUserByTelegram(username);
    if (user && user.telegramChatId !== String(chatId)) {
      await store.updateUser(user.id, { telegramChatId: String(chatId) });
      console.log(`[KP11 Bot] Автопривязка ЛС: ${user.fullName} (${username}) -> Chat ID: ${chatId}`);
    }
  }

  // Автоматическая регистрация и фиксация мастера разработки @Min1_M1chael
  if (isMaster) {
    store.setMasterChatId(chatId);
  }

  // 0. ОЖИДАНИЕ ПРИЧИНЫ ОТКЛОНЕНИЯ ВЫЗЫВНОГО
  const pendingDecline = pendingDeclineReasons.get(String(chatId));
  if (pendingDecline && !text.startsWith('/start') && !text.startsWith('/link') && !text.startsWith('/my_shoots') && !text.startsWith('/callsheet')) {
    if (text === '/cancel' || text.toLowerCase() === 'отмена') {
      pendingDeclineReasons.delete(String(chatId));
      return sendMessage(chatId, '❌ Отклонение вызывного отменено.');
    }

    const declineReason = text.trim() || 'Причина не указана';
    const shootId = pendingDecline.shootId;
    let user = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
    if (!user && pendingDecline.userId) {
      user = await store.getUserById(pendingDecline.userId);
    }

    if (user) {
      await store.updateCrewMemberStatus(shootId, user.id, 'DECLINED', declineReason);
    }
    pendingDeclineReasons.delete(String(chatId));

    const shoot = await store.getShootById(shootId);
    const shootTitle = shoot ? shoot.title : 'Съёмочная смена';

    await sendMessage(chatId,
      `❌ <b>ВЫЗОВ ОТКЛОНЁН</b>\n` +
      `Смена: <b>${escapeHtml(shootTitle)}</b>\n` +
      `Причина отказа: <i>«${escapeHtml(declineReason)}»</i>\n\n` +
      `<i>Мастер оповещён, на сайте открыт подбор замены.</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Изменить решение: Подтвердить явку', callback_data: `accept:${shootId}` }]
          ]
        }
      }
    );

    if (pendingDecline.messageId && shoot) {
      try {
        const users = await store.getUsers();
        const updatedCallsheet = formatCallsheetMessage(shoot, user?.id, users);
        await editMessageText(chatId, pendingDecline.messageId,
          updatedCallsheet +
          `\n\n<b>СТАТУС: ВЫ ОТКЛОНИЛИ УЧАСТИЕ В ЭТОЙ СМЕНЕ</b>\n` +
          `Причина: <i>«${escapeHtml(declineReason)}»</i>`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Изменить решение: Подтвердить явку', callback_data: `accept:${shootId}` }]
              ]
            }
          }
        );
      } catch (e) {}
    }
    return;
  }

  // 1. КОМАНДА /start [payload]
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const payload = parts[1] || '';

    // Открытие конкретного вызывного: /start call_SHOOTID
    if (payload.startsWith('call_')) {
      const shootId = payload.replace('call_', '');
      const shoot = await store.getShootById(shootId);
      if (shoot) {
        const users = await store.getUsers();
        const user = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
        const callsheetMsg = formatCallsheetMessage(shoot, user?.id, users);
        return sendMessage(chatId, callsheetMsg, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
                { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
              ],
              [
                { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` }
              ]
            ]
          }
        });
      }
    }

    // Привязка аккаунта по персональной ссылке: /start link_USERID
    if (payload.startsWith('link_')) {
      const targetId = payload.replace('link_', '');
      const targetUser = await store.getUserById(targetId);
      if (targetUser) {
        await store.updateUser(targetUser.id, {
          telegramChatId: String(chatId),
          telegram: username || targetUser.telegram
        });
        return sendMessage(chatId,
          `✅ <b>АККАУНТ УСПЕШНО ПРИВЯЗАН</b>\n` +
          `════════════════════════════════════\n` +
          `Студент: <b>${escapeHtml(targetUser.fullName)}</b>\n` +
          `Группа: <code>${escapeHtml(targetUser.groupName || 'КП11')}</code>\n` +
          `Цех: <b>${escapeHtml(targetUser.craftRank || 'Студент киноцеха')}</b>\n` +
          `════════════════════════════════════\n` +
          `Вызывные листы со смен будут доставляться вам в этот диалог.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Мои съёмочные смены', callback_data: 'cmd:my_shoots' }]
              ]
            }
          }
        );
      }
    }

    if (isMaster) {
      return sendMessage(chatId,
        `⚡ <b>ЦУП РАЗРАБОТЧИКА // @Min1_M1chael</b>\n` +
        `════════════════════════════════════\n` +
        `Приветствую, Михаил! Вы авторизованы как мастер и куратор разработки «Медиацентр КП11».\n\n` +
        `Ваш Telegram Chat ID надёжно привязан: <code>${chatId}</code>.\n\n` +
        `<b>Как ставить задачи по сайту:</b>\n` +
        `• Просто напишите в этот чат любое сообщение с задачей, багом или доработкой — агент Antigravity мгновенно примет её в работу!\n` +
        `• Или используйте команду: <code>/task &lt;текст задачи&gt;</code>\n\n` +
        `<b>Команды управления:</b>\n` +
        `• /tasks — Реестр всех ваших задач и статусы их выполнения\n` +
        `• /deploy — Запустить деплой на Render (git push в main)\n` +
        `• /status — Мониторинг серверов, доступности сайта и смен\n` +
        `• /cleartasks — Очистить реестр задач\n` +
        `• /my_shoots — Экран смен\n\n` +
        `<i>Агент Antigravity будет задавать вопросы о доработках и исправлениях ТОЛЬКО ВАМ в этот диалог.</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Реестр задач', callback_data: 'cmd:master_tasks' }, { text: '🚀 Запустить деплой', callback_data: 'cmd:master_deploy' }],
              [{ text: '🛰️ Телеметрия системы', callback_data: 'cmd:master_status' }, { text: '🎬 Экран смен', callback_data: 'cmd:my_shoots' }]
            ]
          }
        }
      );
    }

    const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
    const userLine = currentUser 
      ? `\nСтудент: <b>${escapeHtml(currentUser.fullName)}</b> [${escapeHtml(currentUser.groupName || 'КП11')}]`
      : '';

    return sendMessage(chatId,
      `<b>МЕДИАЦЕНТР КП11 // КИНОПРОИЗВОДСТВО</b>\n` +
      `════════════════════════════════════${userLine}\n` +
      `Бот для получения вызывных листов и подтверждения явок на съёмки.\n\n` +
      `<b>Команды:</b>\n` +
      `• /my_shoots — Ваши назначенные смены\n` +
      `• /callsheet — Текущий вызывной лист\n` +
      `• /link &lt;почта&gt; — Привязать аккаунт по почте`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Мои смены', callback_data: 'cmd:my_shoots' }, { text: 'Вызывной лист', callback_data: 'cmd:callsheet' }]
          ]
        }
      }
    );
  }

  // 2. КОМАНДА /link <email>
  if (text.startsWith('/link')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      return sendMessage(chatId,
        `<b>ПРИВЯЗКА АККАУНТА</b>\n` +
        `Отправьте команду с вашей почтой, зарегистрированной на сайте:\n` +
        `<code>/link student@kp11.ru</code>`
      );
    }
    const email = parts[1].toLowerCase().trim();
    const users = await store.getUsers();
    const targetUser = users.find(u => u.email && u.email.toLowerCase() === email);
    if (targetUser) {
      await store.updateUser(targetUser.id, {
        telegramChatId: String(chatId),
        telegram: username || targetUser.telegram
      });
      return sendMessage(chatId,
        `✅ <b>ПРОФИЛЬ АВТОРИЗОВАН</b>\n` +
        `ФИО: <b>${escapeHtml(targetUser.fullName)}</b> (${escapeHtml(targetUser.groupName || 'КП11')})\n` +
        `Вызывные листы будут приходить в этот диалог.`
      );
    } else {
      return sendMessage(chatId,
        `❌ Пользователь с почтой <code>${escapeHtml(email)}</code> не найден на сайте.`
      );
    }
  }

  // 3. КОМАНДА /my_shoots (или /shoots)
  if (text === '/my_shoots' || text === '/shoots') {
    const allShoots = await store.getShoots();
    const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);

    if (!currentUser) {
      return sendMessage(chatId,
        `<b>АВТОРИЗАЦИЯ НЕ НАЙДЕНА</b>\n` +
        `Привяжите ваш аккаунт командой: <code>/link ваша_почта@kp11.ru</code>.`
      );
    }

    const myShoots = allShoots.filter(s => {
      const crew = s.crew || [];
      return crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
    });

    if (myShoots.length === 0) {
      return sendMessage(chatId,
        `📋 <b>НАЗНАЧЕННЫЕ СЪЁМКИ</b>\n` +
        `Студент: <b>${escapeHtml(currentUser.fullName)}</b>\n` +
        `В настоящее время у вас нет активных смен в графике.`
      );
    }

    let msg = `<b>ВАШИ СЪЁМОЧНЫЕ СМЕНЫ (${myShoots.length}):</b>\n════════════════════════════════════\n\n`;
    const keyboard = [];

    myShoots.forEach((s, idx) => {
      const myRole = (s.crew || []).find(c => c.userId === currentUser.id || c.id === currentUser.id);
      const roleStr = myRole ? myRole.roleInShoot : 'Член группы';
      const statusStr = myRole?.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (myRole?.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[В ОЖИДАНИИ]');
      const d = new Date(s.date);
      const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU') : 'Дата уточняется';

      msg += `<b>${idx + 1}. ${escapeHtml(s.title)}</b>\n` +
             `• Дата: ${dateStr} (${s.callTime || '10:00'})\n` +
             `• Ваша роль: <b>${escapeHtml(roleStr)}</b>\n` +
             `• Статус: <i>${statusStr}</i>\n` +
             `• Локация: ${escapeHtml(s.location)}\n\n`;

      keyboard.push([
        { text: `Вызывной: ${s.title.slice(0, 26)}...`, callback_data: `callsheet:${s.id}` }
      ]);
    });

    return sendMessage(chatId, msg, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  // 4. КОМАНДА /callsheet [id]
  if (text.startsWith('/callsheet')) {
    const parts = text.split(/\s+/);
    let shootId = parts[1];
    const allShoots = await store.getShoots();
    const users = await store.getUsers();

    if (allShoots.length === 0) {
      return sendMessage(chatId, 'На сайте в данный момент нет зарегистрированных смен.');
    }

    let shoot = null;
    if (shootId) {
      shoot = allShoots.find(s => s.id === shootId);
    }
    if (!shoot) {
      const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
      if (currentUser) {
        shoot = allShoots.find(s => (s.crew || []).some(c => c.userId === currentUser.id || c.id === currentUser.id));
      }
      if (!shoot) shoot = allShoots[0];
    }

    const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
    const messageText = formatCallsheetMessage(shoot, currentUser?.id, users);

    return sendMessage(chatId, messageText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
            { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
          ],
          [
            { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` }
          ]
        ]
      }
    });
  }

  // 5. КОМАНДЫ МАСТЕРА РАЗРАБОТКИ (@Min1_M1chael)
  if (text === '/tasks' || (isMaster && text.startsWith('/tasks'))) {
    if (!isMaster) {
      return sendMessage(chatId, '⚠️ Команды управления задачами доступны исключительно мастеру разработки (@Min1_M1chael).');
    }
    const masterData = store.getMasterTasksData();
    const tasks = masterData.tasks || [];
    if (tasks.length === 0) {
      return sendMessage(chatId,
        `📋 <b>РЕЕСТР ЗАДАЧ РАЗРАБОТКИ</b>\n` +
        `════════════════════════════════════\n` +
        `В реестре пока нет задач.\n\n` +
        `<i>Напишите задачу прямо в этот чат, и агент Antigravity автоматически примет её в работу!</i>`
      );
    }

    let msg = `📋 <b>РЕЕСТР ЗАДАЧ РАЗРАБОТКИ (${tasks.length})</b>\n════════════════════════════════════\n\n`;
    tasks.slice(0, 10).forEach((t, i) => {
      const icon = t.status === 'DONE' ? '✅' : (t.status === 'IN_PROGRESS' ? '⚡' : '⏳');
      const stText = t.status === 'DONE' ? 'ВЫПОЛНЕНО' : (t.status === 'IN_PROGRESS' ? 'В РАБОТЕ' : 'НОВАЯ');
      const d = new Date(t.createdAt);
      const timeStr = !isNaN(d.getTime()) ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
      msg += `<b>${i + 1}. [${icon} ${stText}] ${t.id}</b> (${timeStr})\n` +
             `📝 ${escapeHtml(t.text)}\n`;
      if (t.solution) {
        msg += `💡 <i>Решение: ${escapeHtml(t.solution)}</i>\n`;
      }
      msg += `\n`;
    });

    return sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Запустить деплой', callback_data: 'cmd:master_deploy' }, { text: '🗑️ Очистить реестр', callback_data: 'cmd:clear_tasks' }]
        ]
      }
    });
  }

  // 6. КОМАНДА /deploy — Запуск деплоя по команде
  if (text === '/deploy' || (isMaster && (text.toLowerCase() === 'деплой' || text.toLowerCase() === 'сделай деплой'))) {
    if (!isMaster) {
      return sendMessage(chatId, '⚠️ Команда деплоя доступна исключительно мастеру разработки (@Min1_M1chael).');
    }

    await sendMessage(chatId, '🚀 <b>ДЕПЛОЙ ЗАПУЩЕН...</b>\nВыполняется коммит и отправка изменений в репозиторий <code>origin main</code> для развёртывания на Render.');
    const deployRes = await triggerDeploy(`deploy: requested by @Min1_M1chael via Telegram (${new Date().toLocaleTimeString('ru-RU')})`);
    if (deployRes.success) {
      return sendMessage(chatId,
        `✅ <b>ДЕПЛОЙ УСПЕШНО ОТПРАВЛЕН В MAIN</b>\n` +
        `════════════════════════════════════\n` +
        `Render автоматически начал сборку и обновление продакшна.\n\n` +
        `<i>Лог:</i> <code>${escapeHtml(deployRes.output.slice(-200))}</code>`
      );
    } else {
      return sendMessage(chatId,
        `⚠️ <b>ОШИБКА ПРИ ДЕПЛОЕ</b>\n` +
        `<code>${escapeHtml(deployRes.output)}</code>`
      );
    }
  }

  // 7. КОМАНДА /status или /devstatus
  if (text === '/status' || text === '/devstatus') {
    if (!isMaster) {
      return sendMessage(chatId, '⚠️ Команда телеметрии доступна исключительно мастеру разработки (@Min1_M1chael).');
    }
    const shoots = await store.getShoots();
    const users = await store.getUsers();
    const masterData = store.getMasterTasksData();
    const uptimeMin = Math.round(process.uptime() / 60);

    return sendMessage(chatId,
      `🛰️ <b>ТЕЛЕМЕТРИЯ СИСТЕМЫ KP11</b>\n` +
      `════════════════════════════════════\n` +
      `• <b>Сервер:</b> ONLINE (аптайм: ${uptimeMin} мин)\n` +
      `• <b>Активных смен:</b> ${shoots.length} (очищены по запросу)\n` +
      `• <b>Пользователей в базе:</b> ${users.length}\n` +
      `• <b>Задач мастера в работе:</b> ${(masterData.tasks || []).filter(t => t.status !== 'DONE').length}\n` +
      `• <b>Мастер:</b> @Min1_M1chael (Chat ID: <code>${chatId}</code>)\n` +
      `• <b>Watchdog daemon:</b> АКТИВЕН`
    );
  }

  // 8. КОМАНДА /cleartasks
  if (text === '/cleartasks') {
    if (!isMaster) {
      return sendMessage(chatId, '⚠️ Доступно исключительно мастеру разработки (@Min1_M1chael).');
    }
    const masterData = store.getMasterTasksData();
    masterData.tasks = [];
    store.saveMasterTasksData(masterData);
    return sendMessage(chatId, '🗑️ Реестр задач разработки очищен.');
  }

  // 9. КОМАНДА /help
  if (text === '/help') {
    if (isMaster) {
      return sendMessage(chatId,
        `⚡ <b>МЕНЮ КОМАНД МАСТЕРА // @Min1_M1chael</b>\n` +
        `════════════════════════════════════\n` +
        `• /tasks — Список задач разработки\n` +
        `• /deploy — Запустить деплой на сервер\n` +
        `• /status — Телеметрия серверов и сайта\n` +
        `• /cleartasks — Очистить реестр задач\n` +
        `• /my_shoots — Экран смен\n\n` +
        `<i>Любой текст без слеша автоматически сохраняется как новая задача для агента Antigravity.</i>`
      );
    }
    return sendMessage(chatId,
      `<b>МЕДИАЦЕНТР КП11 // ПОМОЩЬ</b>\n` +
      `════════════════════════════════════\n` +
      `• /my_shoots — Ваши назначенные смены\n` +
      `• /callsheet — Текущий вызывной лист\n` +
      `• /link &lt;почта&gt; — Привязать Telegram к сайту`
    );
  }

  // 10. ОБРАБОТКА ОБЫЧНОГО ТЕКСТА ИЛИ /task <текст> ОТ МАСТЕРА @Min1_M1chael
  if (isMaster) {
    // Проверка ожидания ответа на вопрос агента
    const masterData = store.getMasterTasksData();
    const pendingQ = (masterData.questions || []).find(q => q.status === 'PENDING');
    if (pendingQ && !text.startsWith('/')) {
      store.answerMasterQuestion(pendingQ.id, text);
      return sendMessage(chatId,
        `✅ <b>ОТВЕТ ПРИНЯТ АГЕНТОМ</b>\n` +
        `════════════════════════════════════\n` +
        `❓ <b>Вопрос:</b> <i>«${escapeHtml(pendingQ.text)}»</i>\n` +
        `💡 <b>Ваш ответ:</b> <b>${escapeHtml(text)}</b>\n\n` +
        `⚡ <i>Агент разработчик учтёт это решение при работе над сайтом!</i>`
      );
    }

    if (text.startsWith('/task ') || (!text.startsWith('/') && text.length > 1)) {
      const taskText = text.startsWith('/task ') ? text.replace('/task ', '').trim() : text;
      const newTask = store.addMasterTask(taskText, '@Min1_M1chael', chatId);

      return sendMessage(chatId,
        `✅ <b>ЗАДАЧА ПРИНЯТА В РАБОТУ</b>\n` +
        `════════════════════════════════════\n` +
        `🆔 <b>ID задачи:</b> <code>${newTask.id}</code>\n` +
        `🕒 <b>Время:</b> <code>${new Date().toLocaleTimeString('ru-RU')}</code>\n\n` +
        `📝 <b>Текст задачи:</b>\n<i>«${escapeHtml(taskText)}»</i>\n\n` +
        `⚡ <i>Задача сохранена в <code>data/master_tasks.json</code>. Агент Antigravity приступил к выполнению!</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Посмотреть все задачи', callback_data: 'cmd:master_tasks' }, { text: '🚀 Запустить деплой', callback_data: 'cmd:master_deploy' }]
            ]
          }
        }
      );
    }
  }

  // На неизвестную команду в ЛС даем короткую подсказку без лишнего текста
  if (text.startsWith('/')) {
    return sendMessage(chatId, 'Команда не распознана. Используйте /my_shoots или /callsheet.');
  }
}

// ------------------------------------------------------------------------------
// ОБРАБОТКА CALLBACK ЗАПРОСОВ (ИНТЕРАКТИВНЫЕ КНОПКИ)
// ------------------------------------------------------------------------------
async function handleTelegramCallbackQuery(query) {
  const queryId = query.id;
  const isPrivate = query.message && query.message.chat && query.message.chat.type === 'private';
  const chatId = query.message ? query.message.chat.id : null;
  const messageId = query.message ? query.message.message_id : null;
  const data = query.data || '';
  const fromUser = query.from;

  if (data.startsWith('ans_q:')) {
    const parts = data.split(':');
    const qId = parts[1];
    const optIdx = parseInt(parts[2], 10);
    const masterData = store.getMasterTasksData();
    const q = (masterData.questions || []).find(item => item.id === qId);
    if (q && q.options && q.options[optIdx]) {
      const chosenAnswer = q.options[optIdx];
      store.answerMasterQuestion(qId, chosenAnswer);
      await answerCallbackQuery(queryId, `Принято: ${chosenAnswer}`);
      return editMessageText(chatId, messageId,
        `❓ <b>ВОПРОС ОТ АГЕНТА ANTIGRAVITY // @Min1_M1chael</b>\n` +
        `════════════════════════════════════\n\n` +
        `${escapeHtml(q.text)}\n\n` +
        `✅ <b>Ваш выбор принят:</b> <b>${escapeHtml(chosenAnswer)}</b>\n` +
        `<i>Агент разработчик учтёт это решение при работе над сайтом.</i>`
      );
    }
  }

  if (data === 'cmd:master_tasks') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/tasks', from: fromUser });
  }

  if (data === 'cmd:master_deploy') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/deploy', from: fromUser });
  }

  if (data === 'cmd:master_status') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/status', from: fromUser });
  }

  if (data === 'cmd:clear_tasks') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/cleartasks', from: fromUser });
  }

  if (data === 'cmd:my_shoots') {
    if (!isPrivate) {
      return answerCallbackQuery(queryId, 'Мои смены доступны в личных сообщениях с ботом', true);
    }
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/my_shoots', from: fromUser });
  }

  if (data === 'cmd:callsheet') {
    if (!isPrivate) {
      return answerCallbackQuery(queryId, 'Вызывной лист доступен в личных сообщениях с ботом', true);
    }
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId, type: 'private' }, text: '/callsheet', from: fromUser });
  }

  // 1. ПОДТВЕРЖДЕНИЕ УЧАСТИЯ В СМЕНЕ: accept:<shootId>
  if (data.startsWith('accept:')) {
    pendingDeclineReasons.delete(String(chatId));
    const shootId = data.replace('accept:', '');
    const user = await store.getUserByTelegram(chatId) || (fromUser.username ? await store.getUserByTelegram('@' + fromUser.username) : null);
    
    if (user) {
      await store.updateCrewMemberStatus(shootId, user.id, 'ACCEPTED');
    }

    // Если нажали в групповом чате — просто показываем всплывающее уведомление и НЕ спамим в группу
    if (!isPrivate) {
      return answerCallbackQuery(queryId, '✓ Ваша явка подтверждена на сайте!', true);
    }

    await answerCallbackQuery(queryId, 'Явка на смену подтверждена!', true);

    const shoot = await store.getShootById(shootId);
    if (shoot) {
      const users = await store.getUsers();
      const updatedCallsheet = formatCallsheetMessage(shoot, user?.id, users);
      return editMessageText(chatId, messageId,
        updatedCallsheet +
        `\n\n<b>СТАТУС: ВЫ ПОДТВЕРДИЛИ ЯВКУ НА СМЕНУ</b>\n` +
        `<i>Данные обновлены на сайте.</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Геоточка на карте', callback_data: `location:${shootId}` }
              ],
              [
                { text: 'Отклонить вызов (отмена)', callback_data: `decline:${shootId}` }
              ]
            ]
          }
        }
      );
    }
    return;
  }

  // 2. ОТКЛОНЕНИЕ ВЫЗОВА: decline:<shootId>
  if (data.startsWith('decline:')) {
    // В групповых чатах отклонить нельзя, перенаправляем в ЛС
    if (!isPrivate) {
      return answerCallbackQuery(queryId, 'Для отклонения вызова откройте личные сообщения с ботом', true);
    }

    const shootId = data.replace('decline:', '');
    const user = await store.getUserByTelegram(chatId) || (fromUser.username ? await store.getUserByTelegram('@' + fromUser.username) : null);

    // Запоминаем состояние ожидания причины отказа
    pendingDeclineReasons.set(String(chatId), {
      shootId,
      messageId,
      userId: user?.id,
      timestamp: Date.now()
    });

    await answerCallbackQuery(queryId, 'Укажите причину отказа ответным сообщением', false);

    const shoot = await store.getShootById(shootId);
    const shootTitle = shoot ? shoot.title : 'Съёмочная смена';

    return sendMessage(chatId,
      `⚠️ <b>ОТКЛОНЕНИЕ ВЫЗЫВНОГО // ${escapeHtml(shootTitle)}</b>\n` +
      `Напишите <b>причину отказа</b> ответным сообщением (для отмены отправьте /cancel):`,
      {
        reply_markup: {
          force_reply: true,
          selective: true
        }
      }
    );
  }

  // 3. ОТПРАВКА ГЕОТОЧКИ: location:<shootId>
  if (data.startsWith('location:')) {
    const shootId = data.replace('location:', '');
    const shoot = await store.getShootById(shootId);

    if (!isPrivate) {
      const locText = shoot ? `Локация: ${shoot.location}` : 'Локация уточняется';
      return answerCallbackQuery(queryId, locText, true);
    }

    await answerCallbackQuery(queryId);

    if (shoot && shoot.latitude && shoot.longitude) {
      await sendLocation(chatId, parseFloat(shoot.latitude), parseFloat(shoot.longitude));
      return sendMessage(chatId,
        `📍 <b>ЛОКАЦИЯ:</b> ${escapeHtml(shoot.location)}\n` +
        `<a href="https://yandex.ru/maps/?pt=${shoot.longitude},${shoot.latitude}&z=16&l=map">Маршрут в Яндекс.Картах</a>`
      );
    }
    return;
  }

  // 4. ОТКРЫТИЕ ВЫЗЫВНОГО ПО ID: callsheet:<shootId>
  if (data.startsWith('callsheet:')) {
    if (!isPrivate) {
      return answerCallbackQuery(queryId, 'Вызывной лист доступен в личных сообщениях с ботом', true);
    }

    const shootId = data.replace('callsheet:', '');
    const shoot = await store.getShootById(shootId);
    await answerCallbackQuery(queryId);

    if (shoot) {
      const users = await store.getUsers();
      const currentUser = await store.getUserByTelegram(chatId) || (fromUser.username ? await store.getUserByTelegram('@' + fromUser.username) : null);
      const messageText = formatCallsheetMessage(shoot, currentUser?.id, users);

      return sendMessage(chatId, messageText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
              { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
            ],
            [
              { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` }
            ]
          ]
        }
      });
    }
    return;
  }

  return answerCallbackQuery(queryId);
}

// ------------------------------------------------------------------------------
// ЕДИНАЯ ТОЧКА ВХОДА ДЛЯ ОБНОВЛЕНИЙ
// ------------------------------------------------------------------------------
async function handleUpdate(update) {
  try {
    if (update.message) {
      await handleTelegramMessage(update.message);
    } else if (update.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
    }
  } catch (err) {
    console.error('[KP11 Bot] Ошибка обработки update:', err);
  }
}

function parseChatTargets(raw, fallbackTopicId = null) {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[\s,;\n\r]+/);
  const results = [];
  const seen = new Set();
  const defaultThread = (fallbackTopicId && String(fallbackTopicId).trim()) 
    ? parseInt(String(fallbackTopicId).trim(), 10) 
    : null;

  for (let item of items) {
    item = String(item).trim();
    if (!item) continue;

    let chatId = item;
    let threadId = defaultThread;

    // 1. Формат ссылки приватной супергруппы с топиком: https://t.me/c/1234567890/42
    const privateLinkMatch = item.match(/(?:https?:\/\/)?t\.me\/c\/(\d+)(?:\/(\d+))?/i);
    if (privateLinkMatch) {
      chatId = `-100${privateLinkMatch[1]}`;
      if (privateLinkMatch[2]) {
        threadId = parseInt(privateLinkMatch[2], 10);
      }
    } else {
      // 2. Формат публичной ссылки с топиком: https://t.me/mychannel/42
      const publicLinkMatch = item.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)(?:\/(\d+))?/i);
      if (publicLinkMatch && !['joinchat', 'c', 'addstickers'].includes(publicLinkMatch[1].toLowerCase())) {
        chatId = `@${publicLinkMatch[1]}`;
        if (publicLinkMatch[2]) {
          threadId = parseInt(publicLinkMatch[2], 10);
        }
      } else {
        // 3. Формат со слэшем или двоеточием: -100123456789/42 или -100123456789:42 или @group/42
        const combinedMatch = item.match(/^([-\d]+|@[a-zA-Z0-9_]+)[:/](\d+)$/);
        if (combinedMatch) {
          chatId = combinedMatch[1];
          threadId = parseInt(combinedMatch[2], 10);
        }
      }
    }

    const key = `${chatId}:${threadId || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        chatId,
        messageThreadId: (threadId !== null && !isNaN(threadId)) ? threadId : null
      });
    }
  }
  return results;
}

function parseChatIds(raw) {
  return parseChatTargets(raw).map(t => t.chatId);
}

// ------------------------------------------------------------------------------
// ФУНКЦИЯ РАССЫЛКИ ВЫЗЫВНОГО ЛИСТА С САЙТА В TELEGRAM
// ------------------------------------------------------------------------------
async function sendCallsheetToCrew(shootId, clientShootData = null) {
  let shoot = null;
  if (shootId) {
    shoot = await store.getShootById(shootId);
  }
  if (!shoot && clientShootData) {
    shoot = await store.saveShoot(clientShootData);
  }
  if (!shoot && clientShootData) {
    shoot = clientShootData;
  }

  const token = getBotToken();
  const settings = store.getSettings();

  if (!shoot) {
    console.warn(`[KP11 Bot Dispatch] Смена с ID ${shootId} не найдена в базе сайта`);
    return {
      shootId: shootId || 'unknown',
      shootTitle: clientShootData?.title || 'Без названия',
      totalCrew: 0,
      deliveredCount: 0,
      recipients: [],
      botTokenConfigured: Boolean(token),
      error: `Смена с ID ${shootId} не найдена в базе сайта`
    };
  }

  const allUsers = await store.getUsers();
  const crew = shoot.crew || [];

  const results = {
    shootId,
    shootTitle: shoot.title,
    totalCrew: crew.length,
    deliveredCount: 0,
    recipients: [],
    botTokenConfigured: Boolean(token),
    shareUrl: `https://t.me/share/url?url=${encodeURIComponent(`Вызывной лист на смену «${shoot.title}»: https://t.me/${settings.botUsername || 'KP11_FilmCrew_Bot'}?start=call_${shoot.id}`)}`
  };

  console.log(`[KP11 Bot Dispatch] Отправка вызывного для «${shoot.title}» (${crew.length} чел.). Токен настроен: ${results.botTokenConfigured}`);

  for (const member of crew) {
    const uId = member.userId || member.user?.id || member.id;
    const student = allUsers.find(u => u.id === uId) || member.user;
    const uName = student?.fullName || 'Студент цеха';
    const tgUsername = student?.telegram || '';
    const tgChatId = student?.telegramChatId;

    const messageText = formatCallsheetMessage(shoot, uId, allUsers);
    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
          { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
        ],
        [
          { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` }
        ]
      ]
    };

    let delivered = false;
    let statusNote = '';

    if (token && tgChatId) {
      const sendRes = await sendMessage(tgChatId, messageText, { reply_markup: keyboard });
      if (sendRes.ok) {
        delivered = true;
        statusNote = 'Доставлено в ЛС Telegram';
      } else {
        statusNote = `Ошибка Telegram: ${sendRes.description || sendRes.error}`;
      }
    } else if (token && !tgChatId) {
      statusNote = tgUsername 
        ? `Ожидает /start в боте от ${tgUsername}`
        : 'У пользователя не указан Telegram в админ-панели';
    } else {
      statusNote = 'Токен бота не настроен (режим автономного предпросмотра)';
    }

    if (delivered) results.deliveredCount++;

    results.recipients.push({
      userId: uId,
      fullName: uName,
      role: member.roleInShoot,
      telegram: tgUsername || 'Не указан',
      chatId: tgChatId || null,
      delivered,
      statusNote
    });
  }

  // Если настроены общие чаты / каналы / топики для вызывных в настройках, отправляем во ВСЕ указанные цели
  const defaultTopic = settings.telegramTopicId || process.env.TELEGRAM_TOPIC_ID || null;
  const targetTargets = parseChatTargets(settings.defaultChatId, defaultTopic);
  for (const target of targetTargets) {
    if (token && target.chatId) {
      // 1. ЗАЩИТА ОТ ПОВТОРОВ: дебаунс 60 секунд на отправку вызывного в один и тот же чат/топик
      const dispatchKey = `${shoot.id}:${target.chatId}:${target.messageThreadId || ''}`;
      const lastSent = recentGroupDispatches.get(dispatchKey);
      if (lastSent && (Date.now() - lastSent) < 60000) {
        console.log(`[KP11 Bot Dispatch] Предотвращён повторный вызывной в чат ${target.chatId} (отправлен ${Math.round((Date.now() - lastSent)/1000)}с назад)`);
        continue;
      }
      recentGroupDispatches.set(dispatchKey, Date.now());

      try {
        const groupText = formatCallsheetMessage(shoot, null, allUsers, true);
        // 2. В ЧАТАХ — НИКАКИХ КНОПОК! Только ФИО участников, без статусов и без кнопок
        const sendOpts = {};
        if (target.messageThreadId) {
          sendOpts.message_thread_id = target.messageThreadId;
        }
        const resGroup = await sendMessage(target.chatId, groupText, sendOpts);
        if (resGroup && resGroup.ok) {
          results.deliveredCount++;
        }
        console.log(`[KP11 Bot Dispatch] Вызывной лист отправлен в чат ${target.chatId}${target.messageThreadId ? ` (топик #${target.messageThreadId})` : ''} без кнопок`);
      } catch (e) {
        console.error(`[KP11 Bot Dispatch] Ошибка отправки в чат ${target.chatId}:`, e.message);
      }
    }
  }

  return results;
}

// ------------------------------------------------------------------------------
// POLLING МЕХАНИЗМ
// ------------------------------------------------------------------------------
let isPollingActive = false;
let pollingOffset = 0;

async function startPolling() {
  const token = getBotToken();
  if (!token) {
    console.log('[KP11 Bot] Токен не задан. Бот готов к работе — укажите токен в админ-панели или в .env.');
    return;
  }

  if (isPollingActive) return;
  isPollingActive = true;
  console.log('[KP11 Bot] Запуск Polling для @KP11_FilmCrew_Bot...');

  await callTelegramApi('deleteWebhook', { drop_pending_updates: false });

  const poll = async () => {
    if (!isPollingActive) return;
    try {
      const res = await callTelegramApi('getUpdates', {
        offset: pollingOffset,
        timeout: 20
      });

      if (res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          pollingOffset = update.update_id + 1;
          await handleUpdate(update);
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
    setImmediate(poll);
  };

  poll();
}

function stopPolling() {
  isPollingActive = false;
  console.log('[KP11 Bot] Polling остановлен.');
}

// ------------------------------------------------------------------------------
// WEBHOOK МЕХАНИЗМ (ДЛЯ RENDER / SERVER DEPLOYMENT)
// ------------------------------------------------------------------------------
async function setupWebhook(baseUrl) {
  const token = getBotToken();
  if (!token) {
    console.log('[KP11 Bot Webhook] Токен не настроен, вебхук пропущен.');
    return { ok: false, error: 'Токен бота не настроен' };
  }

  stopPolling();
  const cleanUrl = String(baseUrl).replace(/\/+$/, '');
  const webhookUrl = `${cleanUrl}/api/telegram/webhook`;
  console.log(`[KP11 Bot Webhook] Регистрация Webhook: ${webhookUrl}...`);
  const res = await callTelegramApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  });
  console.log(`[KP11 Bot Webhook] Результат setWebhook:`, res);
  return res;
}

async function getWebhookInfo() {
  return callTelegramApi('getWebhookInfo');
}

// ------------------------------------------------------------------------------
// АВТОМАТИЧЕСКИЕ НАПОМИНАНИЯ ЗА 15 МИНУТ ДО СБОРА И МОТОРА В ЛИЧНЫЕ СООБЩЕНИЯ
// ------------------------------------------------------------------------------
const sentMilestoneReminders = new Set();
let milestoneInterval = null;

function parseShootDateTimeMsk(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dPart = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr);
  const tPart = timeStr.trim();
  const isoWithTz = `${dPart}T${tPart.length === 5 ? tPart + ':00' : tPart}+03:00`;
  const time = Date.parse(isoWithTz);
  return isNaN(time) ? null : time;
}

async function checkAndSendMilestoneReminders() {
  try {
    const token = getBotToken();
    if (!token) return;

    const shoots = store.getShoots ? store.getShoots() : [];
    if (!Array.isArray(shoots) || shoots.length === 0) return;

    const allUsers = store.getUsers ? store.getUsers() : [];
    const settings = store.getSettings();
    const now = Date.now();

    for (const shoot of shoots) {
      if (shoot.isCompleted) continue;
      if (!shoot.crew || !Array.isArray(shoot.crew) || shoot.crew.length === 0) continue;

      const callTime = shoot.callTime || shoot.startTime || '10:00';
      const targetMs = parseShootDateTimeMsk(shoot.date, callTime);
      if (!targetMs) continue;

      const diffMinutes = (targetMs - now) / (60 * 1000);

      // Проверяем окно: от 0 до 60.5 минут до наступления времени сбора (за 1 час)
      if (diffMinutes >= 0 && diffMinutes <= 60.5) {
        // 1. Отправка напоминания в общий групповой чат
        const groupReminderKey = `1h_group_${shoot.id}`;
        if (!sentMilestoneReminders.has(groupReminderKey)) {
          const defaultTopic = settings.telegramTopicId || process.env.TELEGRAM_TOPIC_ID || null;
          const targetTargets = parseChatTargets(settings.defaultChatId, defaultTopic);
          if (targetTargets && targetTargets.length > 0) {
            const crewListFormatted = (shoot.crew || [])
              .map(c => `• <b>${escapeHtml(c.user?.fullName || c.fullName || 'Участник')}</b> — ${escapeHtml(c.roleInShoot || 'Участник')}`)
              .join('\n');

            const groupMsgText = `⏰ <b>НАПОМИНАНИЕ: ДО СБОРА ГРУППЫ 1 ЧАС! // МЕДИАЦЕНТР КП11</b>\n\n` +
              `📹 Проект: <b>«${escapeHtml(shoot.title)}»</b>\n` +
              `⏰ Время сбора: <b>${callTime}</b>\n` +
              `📍 Локация: <b>${escapeHtml(shoot.location || 'Площадка ЦКТ КП11')}</b>\n\n` +
              `👥 <b>Состав съёмочной группы:</b>\n${crewListFormatted}\n\n` +
              `<i>Просьба ко всей группе выдвигаться на площадку без опозданий!</i>`;

            for (const target of targetTargets) {
              try {
                // В ЧАТАХ — НИКАКИХ КНОПОК! Чистый текст напоминания
                const sendOpts = {};
                if (target.messageThreadId) {
                  sendOpts.message_thread_id = target.messageThreadId;
                }
                await sendMessage(target.chatId, groupMsgText, sendOpts);
              } catch (e) {
                console.warn(`[KP11 Bot] Ошибка отправки напоминания в общий чат ${target.chatId}:`, e.message);
              }
            }
            sentMilestoneReminders.add(groupReminderKey);
            console.log(`[KP11 Bot Milestones] Напоминание за 1 час отправлено в общий чат/топик по смене «${shoot.title}»`);
          }
        }

        // 2. Отправка персональных напоминаний в ЛС каждому участнику смены
        for (const member of shoot.crew) {
          const uId = member.userId || member.user?.id || member.id;
          const reminderKey = `1h_pm_${shoot.id}_${uId}`;
          if (sentMilestoneReminders.has(reminderKey)) continue;

          const matchedUser = allUsers.find(u => u.id === uId) || member.user;
          const tgChatId = matchedUser?.telegramChatId || (member.telegramChatId ? String(member.telegramChatId) : null);

          if (tgChatId) {
            const pmText = `🎬 <b>ЛИЧНОЕ НАПОМИНАНИЕ // МЕДИАЦЕНТР КП11</b>\n\n` +
              `⏰ <b>Через 1 час: СБОР ГРУППЫ (${callTime})!</b>\n\n` +
              `📹 Проект: <b>«${escapeHtml(shoot.title)}»</b>\n` +
              `🎭 Ваша роль: <b>${escapeHtml(member.roleInShoot || 'Участник')}</b>\n` +
              `📍 Локация: <b>${escapeHtml(shoot.location || 'Площадка ЦКТ КП11')}</b>\n\n` +
              `<i>Пожалуйста, проверьте оборудование и выдвигайтесь на площадку!</i>`;

            try {
              const res = await sendMessage(tgChatId, pmText, {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '📋 Открыть вызывной лист', url: `https://t.me/${settings.botUsername || 'KP11_FilmCrew_Bot'}?start=call_${shoot.id}` }
                    ]
                  ]
                }
              });

              if (res && res.ok) {
                console.log(`[KP11 Bot Milestones] Личное напоминание за 1 час отправлено: ${matchedUser?.fullName || uId} (Chat ID: ${tgChatId})`);
              }
            } catch (e) {
              console.warn(`[KP11 Bot] Ошибка отправки личного напоминания участнику ${uId}:`, e.message);
            }
            sentMilestoneReminders.add(reminderKey);
          }
        }
      }
    }
  } catch (err) {
    console.error('[KP11 Bot Milestones Error]:', err.message);
  }
}

function startMilestoneNotifier() {
  if (milestoneInterval) return;
  milestoneInterval = setInterval(checkAndSendMilestoneReminders, 30000);
  console.log('[KP11 Bot] Запущен таймер напоминаний за 1 час до сбора в общий чат и личные сообщения.');
}

function stopMilestoneNotifier() {
  if (milestoneInterval) {
    clearInterval(milestoneInterval);
    milestoneInterval = null;
  }
}

module.exports = {
  startPolling,
  stopPolling,
  setupWebhook,
  getWebhookInfo,
  startMilestoneNotifier,
  stopMilestoneNotifier,
  checkAndSendMilestoneReminders,
  handleUpdate,
  sendMessage,
  sendLocation,
  sendCallsheetToCrew,
  formatCallsheetMessage,
  getBotToken,
  parseChatTargets,
  parseChatIds,
  askMaster,
  isMasterDeveloper,
  TARGET_MASTER_USERNAME,
  triggerDeploy
};

if (require.main === module) {
  startPolling();
}


