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
const store = require('./data/store');

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
function formatCallsheetMessage(shoot, targetUserId = null, allUsers = []) {
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
      const tgStr = matchedUser?.telegram ? ` (${matchedUser.telegram})` : '';
      const isTarget = targetUserId && (uId === targetUserId);
      const statusIcon = c.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (c.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[В ОЖИДАНИИ]');
      const prefix = isTarget ? '>> <b>' : '• ';
      const suffix = isTarget ? ' (ВЫ)</b>' : '';
      crewSections += `${prefix}${c.roleInShoot}: ${escapeHtml(uName)}${tgStr}${suffix} — <i>${statusIcon}</i>\n`;
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

// ------------------------------------------------------------------------------
// ОБРАБОТКА КОМАНД И СООБЩЕНИЙ
// ------------------------------------------------------------------------------
async function handleTelegramMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const username = message.from.username ? `@${message.from.username}` : '';
  const firstName = message.from.first_name || '';

  // Автоматическая привязка Chat ID к пользователю по его юзернейму в базе сайта
  if (username) {
    const user = await store.getUserByTelegram(username);
    if (user && user.telegramChatId !== String(chatId)) {
      await store.updateUser(user.id, { telegramChatId: String(chatId) });
      console.log(`[KP11 Bot] Автопривязка: ${user.fullName} (${username}) -> Chat ID: ${chatId}`);
    }
  }

  // 1. КОМАНДА /start [payload]
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    const payload = parts[1] || '';

    // Если передан ID смены: /start call_SHOOTID
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

    // Если передан токен привязки: /start link_USERID
    if (payload.startsWith('link_')) {
      const targetId = payload.replace('link_', '');
      const targetUser = await store.getUserById(targetId);
      if (targetUser) {
        await store.updateUser(targetUser.id, { telegramChatId: String(chatId), telegram: username || targetUser.telegram });
        return sendMessage(chatId,
          `<b>АККАУНТ УСПЕШНО ПРИВЯЗАН К САЙТУ</b>\n` +
          `════════════════════════════════════\n` +
          `Студент: <b>${escapeHtml(targetUser.fullName)}</b>\n` +
          `Группа: <code>${escapeHtml(targetUser.groupName)}</code>\n` +
          `Цеховой грейд: <b>${escapeHtml(targetUser.craftRank || 'Ассистент цеха')}</b>\n` +
          `Telegram: ${username || targetUser.telegram || 'не указан'}\n` +
          `Chat ID: <code>${chatId}</code>\n` +
          `════════════════════════════════════\n` +
          `Теперь все вызывные листы с сайта будут доставляться вам мгновенно в этот чат!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Мои съёмочные смены', callback_data: 'cmd:my_shoots' }],
                [{ text: 'Цифровой паспорт цеха', callback_data: 'cmd:profile' }]
              ]
            }
          }
        );
      }
    }

    const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
    const userGreeting = currentUser 
      ? `\nСтудент: <b>${escapeHtml(currentUser.fullName)}</b> [${currentUser.groupName}]\nЦех: <i>${currentUser.craftRank || 'Студент киноцеха'}</i>`
      : (username ? `\nАккаунт Telegram: <b>${username}</b>` : '');

    return sendMessage(chatId,
      `<b>МЕДИАЦЕНТР КОЛЛЕДЖА ПРЕДПРИНИМАТЕЛЬСТВА №11</b>\n` +
      `<b>ОФИЦИАЛЬНЫЙ БОТ СЪЁМОЧНЫХ ЦЕХОВ</b>\n` +
      `════════════════════════════════════${userGreeting}\n` +
      `Бот напрямую синхронизирован с веб-порталом кинопроизводства КП11.\n\n` +
      `<b>КОМАНДЫ:</b>\n` +
      `• <b>/my_shoots</b> — Ваши назначенные смены с сайта\n` +
      `• <b>/callsheet</b> — Текущий вызывной лист с таймингом и локацией\n` +
      `• <b>/profile</b> — Цифровой паспорт компетенций студента\n` +
      `• <b>/shifts</b> — Все активные проекты на сайте\n` +
      `• <b>/link &lt;email&gt;</b> — Привязать Telegram к почте на сайте\n` +
      `• <b>/help</b> — Инструкции и регламент съёмочной площадки\n` +
      `════════════════════════════════════`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Мои смены', callback_data: 'cmd:my_shoots' }, { text: 'Вызывной лист', callback_data: 'cmd:callsheet' }],
            [{ text: 'Паспорт компетенций', callback_data: 'cmd:profile' }, { text: 'Все смены медиацентра', callback_data: 'cmd:shifts' }]
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
        `<b>ПРИВЯЗКА УЧЕБНОГО АККАУНТА</b>\n` +
        `Отправьте команду с вашей почтой, зарегистрированной на сайте:\n` +
        `<code>/link semyon.badikov@kp11.ru</code>`
      );
    }
    const email = parts[1].toLowerCase().trim();
    const users = await store.getUsers();
    const targetUser = users.find(u => u.email.toLowerCase() === email);
    if (targetUser) {
      await store.updateUser(targetUser.id, {
        telegramChatId: String(chatId),
        telegram: username || targetUser.telegram
      });
      return sendMessage(chatId,
        `<b>ПРОФИЛЬ УСПЕШНО АВТОРИЗОВАН</b>\n` +
        `════════════════════════════════════\n` +
        `ФИО: <b>${escapeHtml(targetUser.fullName)}</b>\n` +
        `Группа: <code>${escapeHtml(targetUser.groupName)}</code>\n` +
        `Telegram: <b>${username || targetUser.telegram}</b>\n` +
        `Рейтинг: <b>${targetUser.rating || '—'} / 5.0</b>\n` +
        `════════════════════════════════════\n` +
        `Связь с сайтом установлена. Вы будете получать персональные вызывные листы.`
      );
    } else {
      return sendMessage(chatId,
        `<b>ОШИБКА АВТОРИЗАЦИИ</b>\n` +
        `Пользователь с почтой <code>${escapeHtml(email)}</code> не найден в базе данных сайта.\n` +
        `Убедитесь, что вы зарегистрированы на платформе, или обратитесь к администратору.`
      );
    }
  }

  // 3. КОМАНДА /my_shoots — ТОЛЬКО РЕАЛЬНЫЕ СМЕНЫ С САЙТА ДЛЯ ЭТОГО СТУДЕНТА
  if (text === '/my_shoots' || text === '/shoots') {
    const allShoots = await store.getShoots();
    const currentUser = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);

    if (!currentUser) {
      return sendMessage(chatId,
        `<b>АВТОРИЗАЦИЯ НЕ НАЙДЕНА</b>\n` +
        `Ваш Telegram-аккаунт (${username || 'без юзернейма'}) пока не привязан ни к одному студенту на сайте.\n\n` +
        `1. Попросите администратора указать ваш Telegram <b>${username || '@ваш_юзернейм'}</b> в панели сайта.\n` +
        `2. Либо привяжите аккаунт самостоятельно командой: <code>/link ваша_почта@kp11.ru</code>.`
      );
    }

    const myShoots = allShoots.filter(s => {
      const crew = s.crew || [];
      return crew.some(c => c.userId === currentUser.id || c.id === currentUser.id);
    });

    if (myShoots.length === 0) {
      return sendMessage(chatId,
        `<b>НАЗНАЧЕННЫЕ СЪЁМКИ</b>\n` +
        `Студент: <b>${escapeHtml(currentUser.fullName)}</b>\n` +
        `════════════════════════════════════\n` +
        `В настоящее время на сайте нет активных съёмочных смен, где вы назначены в группу.\n` +
        `Как только мастер добавит вас в вызывной лист смены на сайте, бот пришлёт вам уведомление.`
      );
    }

    let msg = `<b>ВАШИ СЪЁМОЧНЫЕ СМЕНЫ С САЙТА (${myShoots.length}):</b>\n════════════════════════════════════\n\n`;
    const keyboard = [];

    myShoots.forEach((s, idx) => {
      const myRole = (s.crew || []).find(c => c.userId === currentUser.id || c.id === currentUser.id);
      const roleStr = myRole ? myRole.roleInShoot : 'Член группы';
      const statusStr = myRole?.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (myRole?.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[В ОЖИДАНИИ]');
      const d = new Date(s.date);
      const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU') : 'Дата уточняется';

      msg += `<b>${idx + 1}. ${escapeHtml(s.title)}</b>\n` +
             `• Формат: ${s.type || 'СТУДИЯ'}\n` +
             `• Дата: ${dateStr}\n` +
             `• Ваша роль: <b>${escapeHtml(roleStr)}</b>\n` +
             `• Статус явки: <i>${statusStr}</i>\n` +
             `• Локация: ${escapeHtml(s.location)}\n\n`;

      keyboard.push([
        { text: `Вызывной: ${s.title.slice(0, 24)}...`, callback_data: `callsheet:${s.id}` }
      ]);
    });

    return sendMessage(chatId, msg, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  // 4. КОМАНДА /callsheet [id] — ТОЛЬКО РЕАЛЬНЫЙ ВЫЗЫВНОЙ С САЙТА
  if (text.startsWith('/callsheet')) {
    const parts = text.split(/\s+/);
    let shootId = parts[1];
    const allShoots = await store.getShoots();
    const users = await store.getUsers();

    if (allShoots.length === 0) {
      return sendMessage(chatId,
        `<b>ВЫЗЫВНЫЕ ЛИСТЫ</b>\n` +
        `На сайте в данный момент нет ни одной зарегистрированной съёмочной смены.`
      );
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

  // 5. КОМАНДА /profile — ЦИФРОВОЙ ПАСПОРТ С САЙТА
  if (text === '/profile') {
    const user = await store.getUserByTelegram(chatId) || (username ? await store.getUserByTelegram(username) : null);
    if (!user) {
      return sendMessage(chatId,
        `<b>ПРОФИЛЬ НЕ ПРИВЯЗАН</b>\n` +
        `Вы не авторизованы. Укажите ваш Telegram (${username || '@юзернейм'}) в панели администратора на сайте или используйте <code>/link почта</code>.`
      );
    }

    const comp = user.competencies || { camera: 90, sound: 85, light: 85, edit: 88 };
    const allShoots = await store.getShoots();
    const completedCount = allShoots.filter(s => s.isCompleted && (s.crew || []).some(c => c.userId === user.id)).length;

    return sendMessage(chatId,
      `<b>ГАПОУ КП №11 // ЦИФРОВОЙ ПАСПОРТ ЦЕХА</b>\n` +
      `════════════════════════════════════\n` +
      `Студент: <b>${escapeHtml(user.fullName)}</b>\n` +
      `Группа: <code>${escapeHtml(user.groupName || 'КИТ-11')}</code>\n` +
      `Роль в системе: <b>${user.role?.name || 'Студент'}</b>\n` +
      `Цеховой грейд: <b>${escapeHtml(user.craftRank || 'Ассистент цеха')}</b>\n` +
      `Рейтинг надёжности: <b>${user.rating || 5.0} / 5.0</b> ★★★★★\n` +
      `Завершённых смен на сайте: <b>${completedCount}</b>\n` +
      `════════════════════════════════════\n` +
      `<b>МАТРИЦА ЦЕХОВЫХ КОМПЕТЕНЦИЙ:</b>\n` +
      `• Операторский цех (Log-C, Оптика, Фокус): <b>${comp.camera}%</b>\n` +
      `• Звуковой цех (Радиотракт, Бум, Запись): <b>${comp.sound}%</b>\n` +
      `• Осветительский цех (Гаффер-сетап, Kelvin): <b>${comp.light}%</b>\n` +
      `• Монтаж & Постпродакшн (DaVinci, LUT): <b>${comp.edit}%</b>\n` +
      `════════════════════════════════════`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Мои смены', callback_data: 'cmd:my_shoots' }],
            [{ text: 'Вызывной лист', callback_data: 'cmd:callsheet' }]
          ]
        }
      }
    );
  }

  // 6. КОМАНДА /shifts — СВОДНЫЙ СПИСОК СМЕН С САЙТА
  if (text === '/shifts') {
    const allShoots = await store.getShoots();
    if (allShoots.length === 0) {
      return sendMessage(chatId,
        `<b>ГРАФИК СМЕН МЕДИАЦЕНТРА КП11</b>\n` +
        `════════════════════════════════════\n` +
        `В настоящее время на сайте нет зарегистрированных смен.\n` +
        `Мастер может создать смену через кнопку «Создать смену» на портале.`
      );
    }

    let msg = `<b>ВСЕ СМЕНЫ С САЙТА МЕДИАЦЕНТРА (${allShoots.length}):</b>\n════════════════════════════════════\n\n`;
    allShoots.forEach((s, idx) => {
      const crew = s.crew || [];
      const acceptedCount = crew.filter(c => c.status === 'ACCEPTED').length;
      const totalCount = crew.length;
      const d = new Date(s.date);
      const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('ru-RU') : 'Дата уточняется';

      msg += `<b>${idx + 1}. ${escapeHtml(s.title)}</b>\n` +
             `• Формат: ${s.type || 'СТУДИЯ'}\n` +
             `• Дата: ${dateStr}\n` +
             `• Готовность группы: <b>${acceptedCount}/${totalCount} подтвердили</b>\n` +
             `• Локация: ${escapeHtml(s.location)}\n\n`;
    });

    return sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: allShoots.map(s => ([
          { text: `Вызывной: ${s.title.slice(0, 26)}`, callback_data: `callsheet:${s.id}` }
        ]))
      }
    });
  }

  // 7. КОМАНДА /help
  return sendMessage(chatId,
    `<b>СПРАВОЧНАЯ СЛУЖБА КИНОЦЕХА КП11</b>\n` +
    `════════════════════════════════════\n` +
    `Бот полностью синхронизирован со съёмочным графиком сайта.\n\n` +
    `• <b>/my_shoots</b> — Ваши назначенные смены и статус явки\n` +
    `• <b>/callsheet</b> — Полный вызывной лист с таймингом\n` +
    `• <b>/profile</b> — Профиль студента, рейтинг и цеховой ранг\n` +
    `• <b>/shifts</b> — График всех проектов медиацентра с сайта\n` +
    `• <b>/link &lt;email&gt;</b> — Привязать Telegram к почте на сайте`
  );
}

// ------------------------------------------------------------------------------
// ОБРАБОТКА CALLBACK ЗАПРОСОВ (ИНТЕРАКТИВНЫЕ КНОПКИ)
// ------------------------------------------------------------------------------
async function handleTelegramCallbackQuery(query) {
  const queryId = query.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data || '';
  const fromUser = query.from;

  if (data === 'cmd:my_shoots') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId }, text: '/my_shoots', from: fromUser });
  }
  if (data === 'cmd:callsheet') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId }, text: '/callsheet', from: fromUser });
  }
  if (data === 'cmd:profile') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId }, text: '/profile', from: fromUser });
  }
  if (data === 'cmd:shifts') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId }, text: '/shifts', from: fromUser });
  }

  // 1. ПОДТВЕРЖДЕНИЕ УЧАСТИЯ В СМЕНЕ: accept:<shootId>
  if (data.startsWith('accept:')) {
    const shootId = data.replace('accept:', '');
    const user = await store.getUserByTelegram(chatId) || (fromUser.username ? await store.getUserByTelegram('@' + fromUser.username) : null);
    
    if (user) {
      await store.updateCrewMemberStatus(shootId, user.id, 'ACCEPTED');
    }
    await answerCallbackQuery(queryId, 'Явка на смену подтверждена!', true);

    const shoot = await store.getShootById(shootId);
    if (shoot) {
      const users = await store.getUsers();
      const updatedCallsheet = formatCallsheetMessage(shoot, user?.id, users);
      return editMessageText(chatId, messageId,
        updatedCallsheet +
        `\n\n<b>СТАТУС: ВЫ ПОДТВЕРДИЛИ ЯВКУ НА СМЕНУ</b>\n` +
        `<i>Данные обновлены в базе сайта. Мастер смены оповещен.</i>`,
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
  }

  // 2. ОТКЛОНЕНИЕ ВЫЗОВА: decline:<shootId>
  if (data.startsWith('decline:')) {
    const shootId = data.replace('decline:', '');
    const user = await store.getUserByTelegram(chatId) || (fromUser.username ? await store.getUserByTelegram('@' + fromUser.username) : null);

    if (user) {
      await store.updateCrewMemberStatus(shootId, user.id, 'DECLINED');
    }
    await answerCallbackQuery(queryId, 'Вызов отклонен. Мастер смены оповещен.', true);

    const shoot = await store.getShootById(shootId);
    if (shoot) {
      const users = await store.getUsers();
      const updatedCallsheet = formatCallsheetMessage(shoot, user?.id, users);
      return editMessageText(chatId, messageId,
        updatedCallsheet +
        `\n\n<b>СТАТУС: ВЫ ОТКЛОНИЛИ УЧАСТИЕ В ЭТОЙ СМЕНЕ</b>\n` +
        `<i>Статус обновлен на сайте.</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Изменить решение: Подтвердить явку', callback_data: `accept:${shootId}` }
              ]
            ]
          }
        }
      );
    }
  }

  // 3. ОТПРАВКА ГЕОТОЧКИ: location:<shootId>
  if (data.startsWith('location:')) {
    const shootId = data.replace('location:', '');
    const shoot = await store.getShootById(shootId);
    await answerCallbackQuery(queryId);

    if (shoot && shoot.latitude && shoot.longitude) {
      await sendLocation(chatId, parseFloat(shoot.latitude), parseFloat(shoot.longitude));
      return sendMessage(chatId,
        `<b>ЛОКАЦИЯ ОБЪЕКТА:</b>\n` +
        `Адрес: <b>${escapeHtml(shoot.location)}</b>\n` +
        `<a href="https://yandex.ru/maps/?pt=${shoot.longitude},${shoot.latitude}&z=16&l=map">Построить маршрут в Яндекс.Навигаторе</a>`
      );
    }
  }

  // 4. ОТКРЫТИЕ ВЫЗЫВНОГО ПО ID: callsheet:<shootId>
  if (data.startsWith('callsheet:')) {
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

    results.push({
      chatId,
      messageThreadId: (threadId !== null && !isNaN(threadId)) ? threadId : null
    });
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
      try {
        const groupText = formatCallsheetMessage(shoot, null, allUsers);
        const sendOpts = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Открыть в @KP11_FilmCrew_Bot', url: `https://t.me/${settings.botUsername || 'KP11_FilmCrew_Bot'}?start=call_${shoot.id}` }
              ]
            ]
          }
        };
        if (target.messageThreadId) {
          sendOpts.message_thread_id = target.messageThreadId;
        }
        const resGroup = await sendMessage(target.chatId, groupText, sendOpts);
        if (resGroup && resGroup.ok) {
          results.deliveredCount++;
        }
        console.log(`[KP11 Bot Dispatch] Вызывной лист продублирован в ${target.chatId}${target.messageThreadId ? ` (топик #${target.messageThreadId})` : ''}`);
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
                const sendOpts = {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: '📋 Открыть вызывной лист', url: `https://t.me/${settings.botUsername || 'KP11_FilmCrew_Bot'}?start=call_${shoot.id}` }
                      ]
                    ]
                  }
                };
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
  parseChatIds
};

if (require.main === module) {
  startPolling();
}

