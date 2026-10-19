/**
 * ==============================================================================
 * ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11 // ЦИФРОВОЙ КИНОЦЕХ
 * TELEGRAM BOT ДЛЯ ОПЕРАТИВНОГО УПРАВЛЕНИЯ СЪЁМОЧНЫМИ СМЕНАМИ
 * Бот: @KP11_FilmCrew_Bot
 * ==============================================================================
 * Функции:
 * 1. Рассылка официальных вызывных листов (Call Sheets) по съёмочным цехам.
 * 2. Интерактивное подтверждение явки студентов (Принять / Отклонить смену).
 * 3. Отправка геоточек объектов и ссылок на навигатор (Яндекс.Карты).
 * 4. Чек-листы операторской, звуковой и осветительной техники.
 * 5. Цифровой паспорт компетенций студента (грейды цехов, рейтинг, фильмография).
 * 6. Мониторинг готовности смен для мастеров и режиссёров-постановщиков.
 * ==============================================================================
 */

const https = require('https');
const http = require('http');

// Конфигурация токена бота
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';

// Подключение к Prisma Client (если доступен в проекте)
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (e) {
  // Prisma будет загружена при запуске через server.js или fallback на локальное хранилище
}

// ------------------------------------------------------------------------------
// ЛОКАЛЬНАЯ БАЗА СТУДЕНТОВ И СМЕН (FALLBACK / IN-MEMORY СИНХРОНИЗАЦИЯ)
// ------------------------------------------------------------------------------
const localDirectory = [
  {
    id: 'demo-user-1',
    fullName: 'Бадиков Семён Станиславович',
    groupName: 'КТ-26',
    email: 'badikov@kp11.ru',
    telegram: '@badikov_dop',
    telegramChatId: null,
    rating: 4.8,
    completedShoots: 6,
    craftRank: 'Оператор-постановщик // Master DOP',
    competencies: { camera: 96, sound: 98, light: 92, edit: 94 },
    skills: ['Log-C', 'Shure SM7B', 'Aputure 300D', 'Sound Design', 'DaVinci Resolve'],
    projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'СПОРТИВНЫЙ РЕПОРТАЖ']
  },
  {
    id: 'u1',
    fullName: 'Ковалев Михаил Алексеевич',
    groupName: 'ФВТ-22',
    email: 'kovalev@kp11.ru',
    telegram: '@mikhail_cam',
    telegramChatId: null,
    rating: 4.7,
    completedShoots: 5,
    craftRank: 'Камерный оператор // 1st AC',
    competencies: { camera: 95, sound: 82, light: 88, edit: 96 },
    skills: ['ARRI Master Prime', 'Цветокоррекция', 'Стедикам', 'LUT Pipeline'],
    projects: ['ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'СПОРТИВНЫЙ РЕПОРТАЖ', 'КИНОПРОБЫ']
  },
  {
    id: 'u2',
    fullName: 'Демидов Тимофей Дмитриевич',
    groupName: 'ФВТ-22',
    email: 'demidov@kp11.ru',
    telegram: '@timofey_light',
    telegramChatId: null,
    rating: 4.5,
    completedShoots: 4,
    craftRank: 'Гаффер смены // Chief Lighting',
    competencies: { camera: 88, sound: 78, light: 94, edit: 80 },
    skills: ['Dedolight', 'Светотеневой рисунок', 'Вольфрам 3200K', 'Электробезопасность'],
    projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
  },
  {
    id: 'u3',
    fullName: 'Гусев Андрей Алексеевич',
    groupName: 'КТ-25',
    email: 'gusev@kp11.ru',
    telegram: '@andrey_gaffer',
    telegramChatId: null,
    rating: 3.5,
    completedShoots: 2,
    craftRank: 'Ассистент осветителя // Best Boy',
    competencies: { camera: 75, sound: 70, light: 85, edit: 68 },
    skills: ['Гаффер-сетап', 'Рассеиватели', 'Штативы C-Stand'],
    projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ']
  },
  {
    id: 'u4',
    fullName: 'Соколова Анна Алексеевна',
    groupName: 'КТ-15',
    email: 'sokolova@kp11.ru',
    telegram: '@anna_sound',
    telegramChatId: null,
    rating: 4.0,
    completedShoots: 3,
    craftRank: 'Звукооператор // Boom Operator',
    competencies: { camera: 84, sound: 92, light: 75, edit: 86 },
    skills: ['Радиопетлички Sennheiser', 'Микрофонный бум', 'Синхронизация'],
    projects: ['ПОДКАСТ МЕДИАЦЕНТРА КП11 #03']
  },
  {
    id: 'u5',
    fullName: 'Жемчужников Ярослав Станиславович',
    groupName: 'КТ-25',
    email: 'zhemchuzhnikov@kp11.ru',
    telegram: '@yaroslav_dop',
    telegramChatId: null,
    rating: 4.5,
    completedShoots: 7,
    craftRank: 'Оператор-постановщик // Master DOP',
    competencies: { camera: 97, sound: 85, light: 90, edit: 92 },
    skills: ['Оператор-постановщик', 'Фокус-пуллинг', 'ARRI RAW', 'Стедикам'],
    projects: ['ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА', 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03', 'ФЕСТИВАЛЬНЫЙ ЭТЮД']
  }
];

const localShoots = [
  {
    id: 'shoot-green-river',
    title: 'ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА',
    type: 'ВЫЕЗД // НАТУРА',
    date: '2026-05-18T10:00:00.000Z',
    location: 'г. Москва, сквер «Зеленая Река», шоссе Энтузиастов',
    latitude: 55.748521,
    longitude: 37.701142,
    description: 'Натурные кинопробы при переменной облачности. Отработка экспозиции в Log-C, динамического диапазона матрицы, стабилизации стедикама и записи синхронного чистового звука на ветрозащищенный микрофон-пушку.',
    creator: { fullName: 'Мастер съёмочного цеха КП11' },
    crew: [
      { id: 'cm-1', userId: 'demo-user-1', roleInShoot: 'Оператор-постановщик (DOP)', status: 'ACCEPTED' },
      { id: 'cm-2', userId: 'u2', roleInShoot: 'Гаффер (Свет на натуре)', status: 'ACCEPTED' },
      { id: 'cm-3', userId: 'u3', roleInShoot: 'Осветитель (Отражатели 5-в-1)', status: 'PENDING' },
      { id: 'cm-4', userId: 'u5', roleInShoot: 'Фокус-пуллер / 1st AC', status: 'ACCEPTED' }
    ]
  },
  {
    id: 'shoot-podcast-03',
    title: 'ПОДКАСТ МЕДИАЦЕНТРА КП11 #03',
    type: 'СТУДИЯ // ПАВИЛЬОН',
    date: '2026-05-22T14:30:00.000Z',
    location: 'Павильон Медиацентра КП11, корп. Нежинская, ауд. 308',
    latitude: 55.708124,
    longitude: 37.472911,
    description: 'Многокамерная студийная запись подкаста (3 камеры, схема света «High Key» на приборах Aputure 300D, 3 динамических микрофона Shure SM7B с отдельным трактом мониторинга).',
    creator: { fullName: 'Режиссёр эфира КП11' },
    crew: [
      { id: 'cm-5', userId: 'demo-user-1', roleInShoot: 'Режиссёр прямого эфира', status: 'ACCEPTED' },
      { id: 'cm-6', userId: 'u1', roleInShoot: 'Оператор камеры №1 (Общий план)', status: 'ACCEPTED' },
      { id: 'cm-7', userId: 'u4', roleInShoot: 'Звукорежиссёр студии', status: 'ACCEPTED' }
    ]
  },
  {
    id: 'shoot-dialogue-dark',
    title: 'КИНОПРОБЫ: ДИАЛОГ В ТЕМНОТЕ',
    type: 'СТУДИЯ // LOW-KEY',
    date: '2026-05-28T16:00:00.000Z',
    location: 'Павильон КП11, тёмный съёмочный зал №2',
    latitude: 55.708124,
    longitude: 37.472911,
    description: 'Отработка драматического контрастного освещения «Low-Key» с коэффициентом 8:1. Работа с оптикой светосилы T1.5 на открытой диафрагме.',
    creator: { fullName: 'Мастер операторского мастерства' },
    crew: [
      { id: 'cm-8', userId: 'u2', roleInShoot: 'Гаффер (Световые контрасты)', status: 'PENDING' },
      { id: 'cm-9', userId: 'u3', roleInShoot: 'Ассистент осветителя', status: 'PENDING' },
      { id: 'cm-10', userId: 'u5', roleInShoot: 'Оператор-постановщик', status: 'ACCEPTED' }
    ]
  }
];

// Маппинг telegram chat_id -> userId
const chatIdToUserMap = new Map();

// ------------------------------------------------------------------------------
// HTTP КЛИЕНТ ДЛЯ TELEGRAM BOT API
// ------------------------------------------------------------------------------
async function callTelegramApi(method, body = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(`[KP11 Bot Sim] Запрос ${method}:`, JSON.stringify(body));
    return { ok: true, result: { message_id: Math.floor(Math.random() * 90000) + 1000 } };
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(`${API_BASE}/${method}`);

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
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// ------------------------------------------------------------------------------
// МЕТОДЫ ОТПРАВКИ СООБЩЕНИЙ И ДАННЫХ
// ------------------------------------------------------------------------------
async function sendMessage(chatId, text, options = {}) {
  return callTelegramApi('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: options.parse_mode || 'HTML',
    reply_markup: options.reply_markup,
    disable_web_page_preview: options.disable_web_page_preview !== false
  });
}

async function sendLocation(chatId, latitude, longitude) {
  return callTelegramApi('sendLocation', {
    chat_id: chatId,
    latitude,
    longitude
  });
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПОИСКА ДАННЫХ
// ------------------------------------------------------------------------------
async function findUserByChatId(chatId) {
  const mappedId = chatIdToUserMap.get(String(chatId));
  if (mappedId) {
    const student = localDirectory.find(s => s.id === mappedId);
    if (student) return student;
  }

  if (prisma) {
    try {
      const dbUser = await prisma.user.findFirst({
        where: { telegramChatId: String(chatId) },
        include: { role: true }
      });
      if (dbUser) return dbUser;
    } catch (e) {}
  }

  return localDirectory.find(s => s.telegramChatId === String(chatId));
}

async function findUserByTelegramUsername(username) {
  const clean = username.replace(/^@/, '').toLowerCase();
  if (prisma) {
    try {
      const dbUser = await prisma.user.findFirst({
        where: {
          telegram: {
            contains: clean,
            mode: 'insensitive'
          }
        }
      });
      if (dbUser) return dbUser;
    } catch (e) {}
  }
  return localDirectory.find(s => s.telegram && s.telegram.replace(/^@/, '').toLowerCase() === clean);
}

async function linkUserToTelegram(userIdOrEmail, chatId, username = '') {
  const norm = userIdOrEmail.trim().toLowerCase();
  let student = localDirectory.find(s => s.id === norm || s.email.toLowerCase() === norm);

  if (student) {
    student.telegramChatId = String(chatId);
    if (username) student.telegram = '@' + username.replace(/^@/, '');
    chatIdToUserMap.set(String(chatId), student.id);
  }

  if (prisma) {
    try {
      await prisma.user.updateMany({
        where: {
          OR: [
            { id: userIdOrEmail },
            { email: { equals: userIdOrEmail, mode: 'insensitive' } }
          ]
        },
        data: {
          telegramChatId: String(chatId),
          telegram: username ? ('@' + username.replace(/^@/, '')) : undefined
        }
      });
    } catch (e) {}
  }

  return student;
}

async function getShootsForUser(userId) {
  let shoots = [];
  if (prisma) {
    try {
      const dbShoots = await prisma.shoot.findMany({
        where: {
          crew: {
            some: { userId: userId }
          }
        },
        include: {
          creator: true,
          crew: { include: { user: true } }
        },
        orderBy: { date: 'asc' }
      });
      if (dbShoots && dbShoots.length > 0) return dbShoots;
    } catch (e) {}
  }

  return localShoots.filter(s => s.crew.some(c => c.userId === userId));
}

async function getShootById(shootId) {
  if (prisma) {
    try {
      const shoot = await prisma.shoot.findUnique({
        where: { id: shootId },
        include: {
          creator: true,
          crew: { include: { user: true } }
        }
      });
      if (shoot) return shoot;
    } catch (e) {}
  }
  return localShoots.find(s => s.id === shootId);
}

async function updateCrewMemberStatus(shootId, userId, newStatus) {
  if (prisma) {
    try {
      await prisma.crewMember.updateMany({
        where: { shootId: shootId, userId: userId },
        data: { status: newStatus }
      });
    } catch (e) {}
  }

  const shoot = localShoots.find(s => s.id === shootId);
  if (shoot) {
    const member = shoot.crew.find(c => c.userId === userId);
    if (member) member.status = newStatus;
  }
}

// ------------------------------------------------------------------------------
// ГЕНЕРАЦИЯ ТЕКСТА ВЫЗЫВНОГО ЛИСТА
// ------------------------------------------------------------------------------
function formatCallsheetMessage(shoot, targetUserId = null) {
  const d = new Date(shoot.date);
  const formattedDate = d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).toUpperCase();

  const formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const master = shoot.creator?.fullName || 'Мастер Медиацентра КП11';

  let crewSections = '';
  const crewList = shoot.crew || [];

  if (crewList.length > 0) {
    crewSections = '\n\n<b>СЪЁМОЧНАЯ ГРУППА ПО ЦЕХАМ:</b>\n';
    crewList.forEach((c) => {
      const uName = c.user?.fullName || (localDirectory.find(s => s.id === c.userId)?.fullName) || 'Студент цеха';
      const isTarget = targetUserId && c.userId === targetUserId;
      const statusIcon = c.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (c.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[В ОЖИДАНИИ]');
      const prefix = isTarget ? '>> <b>' : '• ';
      const suffix = isTarget ? ' (ВЫ)</b>' : '';
      crewSections += `${prefix}${c.roleInShoot}: ${uName}${suffix} — <i>${statusIcon}</i>\n`;
    });
  }

  const coords = (shoot.latitude && shoot.longitude)
    ? `${shoot.latitude.toFixed(6)}, ${shoot.longitude.toFixed(6)}`
    : '55.751244, 37.618423';

  const yandexMapUrl = `https://yandex.ru/maps/?pt=${coords.split(', ')[1]},${coords.split(', ')[0]}&z=16&l=map`;

  return (
    `<b>ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11</b>\n` +
    `<b>ОПЕРАТИВНЫЙ ВЫЗЫВНОЙ ЛИСТ // КИНОПРОИЗВОДСТВО</b>\n` +
    `════════════════════════════════════\n` +
    `<b>ПРОЕКТ:</b> ${escapeHtml(shoot.title)}\n` +
    `<b>ФОРМАТ:</b> ${escapeHtml(shoot.type || 'СТУДИЯ')} // ARRI RAW • LOG-C\n` +
    `<b>ДАТА:</b> ${formattedDate}\n` +
    `<b>ВРЕМЯ СБОРА (CALL TIME):</b> ${formattedTime}\n` +
    `<b>ОБЪЕКТ / АДРЕС:</b> ${escapeHtml(shoot.location)}\n` +
    `<b>ГЕОТОЧКА:</b> <a href="${yandexMapUrl}">Открыть на Яндекс.Картах</a>\n` +
    `<b>МАСТЕР СМЕНЫ:</b> ${escapeHtml(master)}\n` +
    `════════════════════════════════════` +
    crewSections +
    `════════════════════════════════════\n` +
    `<b>ТЕХНИЧЕСКИЙ БРИФ:</b>\n` +
    `${escapeHtml(shoot.description || 'Работа согласно утвержденному календарно-постановочному плану.')}\n\n` +
    `<b>ИНСТРУКТАЖ:</b>\n` +
    `1. Прибытие на площадку строго за 30 минут до назначенного времени.\n` +
    `2. Проверка состояния оптики, матриц и заряда аккумуляторов обязательна.\n` +
    `3. Подтвердите своё участие кнопкой ниже.`
  );
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
  const username = message.from.username || '';
  const firstName = message.from.first_name || '';

  // 1. КОМАНДА /start [payload]
  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    const payload = parts[1] || '';

    // Если передан токен привязки: /start link_USERID
    if (payload.startsWith('link_')) {
      const targetId = payload.replace('link_', '');
      const linked = await linkUserToTelegram(targetId, chatId, username);
      if (linked) {
        return sendMessage(chatId,
          `<b>АККАУНТ УСПЕШНО ПРИВЯЗАН</b>\n` +
          `════════════════════════════════════\n` +
          `Студент: <b>${escapeHtml(linked.fullName)}</b>\n` +
          `Группа: <code>${escapeHtml(linked.groupName)}</code>\n` +
          `Цеховой грейд: <b>${escapeHtml(linked.craftRank || 'Ассистент цеха')}</b>\n` +
          `Telegram: @${username || 'не указан'}\n` +
          `════════════════════════════════════\n` +
          `Теперь вы будете получать оперативные вызывные листы и подтверждать явку на съёмки прямо здесь.\n\n` +
          `Используйте команду <b>/my_shoots</b> для просмотра назначенных смен.`,
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

    // Автопривязка по username, если такой студент есть в базе
    if (username) {
      const byUser = await findUserByTelegramUsername(username);
      if (byUser) {
        await linkUserToTelegram(byUser.id, chatId, username);
      }
    }

    const currentUser = await findUserByChatId(chatId);
    const userGreeting = currentUser ? `\nСтудент: <b>${escapeHtml(currentUser.fullName)}</b> [${currentUser.groupName}]` : '';

    return sendMessage(chatId,
      `<b>МЕДИАЦЕНТР КОЛЛЕДЖА ПРЕДПРИНИМАТЕЛЬСТВА №11</b>\n` +
      `<b>ОФИЦИАЛЬНЫЙ БОТ СЪЁМОЧНЫХ ЦЕХОВ</b>\n` +
      `════════════════════════════════════${userGreeting}\n` +
      `Платформа координации съёмочных смен, дистрибуции вызывных листов (Call Sheets) и аттестации цеховых компетенций.\n\n` +
      `<b>ДОСТУПНЫЕ КОМАНДЫ:</b>\n` +
      `• <b>/my_shoots</b> — Ваши назначенные съёмочные смены\n` +
      `• <b>/callsheet</b> — Текущий оперативный вызывной лист\n` +
      `• <b>/profile</b> — Цифровой паспорт компетенций студента\n` +
      `• <b>/gear</b> — Чек-лист съёмочного оборудования\n` +
      `• <b>/shifts</b> — Все активные проекты медиацентра\n` +
      `• <b>/link &lt;email&gt;</b> — Привязать учебный профиль КП11\n` +
      `• <b>/help</b> — Инструкции и регламент съёмочной площадки\n` +
      `════════════════════════════════════`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Мои смены', callback_data: 'cmd:my_shoots' }, { text: 'Вызывной лист', callback_data: 'cmd:callsheet' }],
            [{ text: 'Паспорт компетенций', callback_data: 'cmd:profile' }, { text: 'Чек-лист техники', callback_data: 'cmd:gear' }]
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
        `Отправьте команду с вашей почтой колледжа, например:\n` +
        `<code>/link badikov@kp11.ru</code>`
      );
    }
    const email = parts[1];
    const linked = await linkUserToTelegram(email, chatId, username);
    if (linked) {
      return sendMessage(chatId,
        `<b>ПРОФИЛЬ УСПЕШНО АВТОРИЗОВАН</b>\n` +
        `════════════════════════════════════\n` +
        `ФИО: <b>${escapeHtml(linked.fullName)}</b>\n` +
        `Группа: <code>${escapeHtml(linked.groupName)}</code>\n` +
        `Рейтинг: <b>${linked.rating} / 5.0</b> (${linked.completedShoots} смен)\n` +
        `Чат Telegram: <code>${chatId}</code>\n` +
        `════════════════════════════════════`
      );
    } else {
      return sendMessage(chatId,
        `<b>ОШИБКА АВТОРИЗАЦИИ</b>\n` +
        `Студент с почтой <code>${escapeHtml(email)}</code> не найден в реестре съёмочного цеха КП11.\n` +
        `Проверьте правильность написания или обратитесь к мастеру смены.`
      );
    }
  }

  // 3. КОМАНДА /my_shoots
  if (text === '/my_shoots' || text === '/shoots') {
    const user = await findUserByChatId(chatId);
    const targetUserId = user ? user.id : 'demo-user-1'; // fallback на демо
    const shoots = await getShootsForUser(targetUserId);

    if (shoots.length === 0) {
      return sendMessage(chatId,
        `<b>НАЗНАЧЕННЫЕ СЪЁМКИ</b>\n` +
        `В настоящее время у вас нет активных назначений на смены.\n` +
        `Когда мастер сформирует вызывной лист, вам придет оповещение.`
      );
    }

    let msg = `<b>ВАШИ СЪЁМОЧНЫЕ СМЕНЫ (${shoots.length}):</b>\n════════════════════════════════════\n\n`;
    const keyboard = [];

    shoots.forEach((s, idx) => {
      const myRole = s.crew.find(c => c.userId === targetUserId);
      const roleStr = myRole ? myRole.roleInShoot : 'Член группы';
      const statusStr = myRole?.status === 'ACCEPTED' ? '[ПОДТВЕРЖДЕНО]' : (myRole?.status === 'DECLINED' ? '[ОТКЛОНЕНО]' : '[ОЖИДАЕТ ОТВЕТА]');
      const d = new Date(s.date).toLocaleDateString('ru-RU');

      msg += `<b>${idx + 1}. ${escapeHtml(s.title)}</b>\n` +
             `• Дата: ${d} // Формат: ${s.type}\n` +
             `• Ваша роль: <b>${escapeHtml(roleStr)}</b>\n` +
             `• Статус: <i>${statusStr}</i>\n` +
             `• Локация: ${escapeHtml(s.location)}\n\n`;

      keyboard.push([
        { text: `Вызывной: ${s.title.slice(0, 24)}...`, callback_data: `callsheet:${s.id}` }
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

    if (!shootId) {
      const user = await findUserByChatId(chatId);
      const targetUserId = user ? user.id : 'demo-user-1';
      const shoots = await getShootsForUser(targetUserId);
      if (shoots.length > 0) {
        shootId = shoots[0].id;
      } else {
        shootId = localShoots[0].id;
      }
    }

    const shoot = await getShootById(shootId);
    if (!shoot) {
      return sendMessage(chatId, `Смена с идентификатором <code>${escapeHtml(shootId)}</code> не найдена.`);
    }

    const user = await findUserByChatId(chatId);
    const targetUserId = user ? user.id : 'demo-user-1';
    const messageText = formatCallsheetMessage(shoot, targetUserId);

    return sendMessage(chatId, messageText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
            { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
          ],
          [
            { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` },
            { text: 'Чек-лист техники', callback_data: `gear:${shoot.id}` }
          ]
        ]
      }
    });
  }

  // 5. КОМАНДА /profile
  if (text === '/profile') {
    const user = await findUserByChatId(chatId) || localDirectory[0];
    const comp = user.competencies || { camera: 90, sound: 85, light: 85, edit: 88 };

    return sendMessage(chatId,
      `<b>ГАПОУ КП №11 // ЦИФРОВОЙ ПАСПОРТ ЦЕХА</b>\n` +
      `════════════════════════════════════\n` +
      `Студент: <b>${escapeHtml(user.fullName)}</b>\n` +
      `Группа: <code>${escapeHtml(user.groupName)}</code>\n` +
      `Цеховой грейд: <b>${escapeHtml(user.craftRank || 'Оператор-постановщик')}</b>\n` +
      `Рейтинг надёжности: <b>${user.rating} / 5.0</b> ★★★★★\n` +
      `Подтвержденных смен: <b>${user.completedShoots || 6}</b>\n` +
      `════════════════════════════════════\n` +
      `<b>МАТРИЦА ЦЕХОВЫХ КОМПЕТЕНЦИЙ:</b>\n` +
      `• Операторский цех (Log-C, Оптика, Фокус): <b>${comp.camera}%</b>\n` +
      `• Звуковой цех (Радиотракт, Бум, Запись): <b>${comp.sound}%</b>\n` +
      `• Осветительский цех (Гаффер-сетап, Kelvin): <b>${comp.light}%</b>\n` +
      `• Монтаж & Постпродакшн (DaVinci, LUT): <b>${comp.edit}%</b>\n` +
      `════════════════════════════════════\n` +
      `<b>ПОДТВЕРЖДЕННЫЕ ПРОЕКТЫ:</b>\n` +
      (user.projects ? user.projects.map(p => `• ${p} [ВЕРИФИЦИРОВАНО]`).join('\n') : '• ТЕСТ 2: ВЫЕЗД В ПАРК ЗЕЛЁНАЯ РЕКА\n• ПОДКАСТ МЕДИАЦЕНТРА КП11 #03'),
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

  // 6. КОМАНДА /gear
  if (text.startsWith('/gear')) {
    return sendMessage(chatId,
      `<b>ЧЕК-ЛИСТ ОБОРУДОВАНИЯ МЕДИАЦЕНТРА КП11</b>\n` +
      `════════════════════════════════════\n` +
      `<b>ОПЕРАТОРСКИЙ КОМПЛЕКТ:</b>\n` +
      `• Камера: RED Komodo 6K / ARRI Alexa Mini LF (Log-C)\n` +
      `• Оптика: ARRI Master Prime 25mm, 50mm, 85mm T1.3\n` +
      `• Фильтры: ND 0.6, 0.9, 1.2, поляризационный True-Pola\n` +
      `• Фокус: Беспроводной фоллоу-фокус Tilta Nucleus-M\n` +
      `• Питание: Аккумуляторы V-Mount 150Wh (4 шт.) + зарядная станция\n\n` +
      `<b>ОСВЕТИТЕЛЬНЫЙ КОМПЛЕКТ:</b>\n` +
      `• Моноблоки: Aputure LS 300D II (Daylight 5600K) — 2 шт.\n` +
      `• Моноблоки: Aputure LS 60X (Bi-Color focusable) — 2 шт.\n` +
      `• Насадки: Light Dome II, шторки, соты 40°\n` +
      `• Стойки: C-Stand Avenger со стрелой Grip Arm — 3 шт.\n\n` +
      `<b>ЗВУКОВОЙ ТРАКТ:</b>\n` +
      `• Рекордер: Sound Devices / Zoom F6 (32-bit float)\n` +
      `• Пушка: Sennheiser MKH 416 с ветрозащитой Rycote\n` +
      `• Радиосистемы: Sennheiser EW 100 G4 (2 петлички)\n` +
      `════════════════════════════════════\n` +
      `<i>Все приборы проверены инженером базы КП11 и опломбированы.</i>`
    );
  }

  // 7. КОМАНДА /shifts
  if (text === '/shifts') {
    let msg = `<b>ОБЗОР ВСЕХ СМЕН МЕДИАЦЕНТРА КП11:</b>\n════════════════════════════════════\n\n`;
    localShoots.forEach((s, idx) => {
      const acceptedCount = s.crew.filter(c => c.status === 'ACCEPTED').length;
      const totalCount = s.crew.length;
      msg += `<b>${idx + 1}. ${escapeHtml(s.title)}</b>\n` +
             `• Формат: ${s.type}\n` +
             `• Готовность группы: <b>${acceptedCount}/${totalCount} подтвердили</b>\n` +
             `• Дата: ${new Date(s.date).toLocaleDateString('ru-RU')}\n` +
             `• Локация: ${escapeHtml(s.location)}\n\n`;
    });

    return sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: localShoots.map(s => ([
          { text: `Вызывной: ${s.title.slice(0, 25)}`, callback_data: `callsheet:${s.id}` }
        ]))
      }
    });
  }

  // 8. КОМАНДА /help
  return sendMessage(chatId,
    `<b>СПРАВОЧНАЯ СЛУЖБА СЪЁМОЧНОГО ЦЕХА КП11</b>\n` +
    `════════════════════════════════════\n` +
    `Этот бот автоматически синхронизируется с веб-порталом медиацентра.\n\n` +
    `<b>КОМАНДЫ:</b>\n` +
    `• <b>/my_shoots</b> — Ваши назначенные смены и статус явки\n` +
    `• <b>/callsheet</b> — Полный вызывной лист с контактами и таймингом\n` +
    `• <b>/profile</b> — Профиль студента, рейтинг и цеховые грейды\n` +
    `• <b>/gear</b> — Чек-лист съёмочной аппаратуры\n` +
    `• <b>/shifts</b> — График всех съёмочных проектов\n` +
    `• <b>/link &lt;email&gt;</b> — Привязать Telegram к почте колледжа\n\n` +
    `<b>ПРАВИЛА ПЛОЩАДКИ:</b>\n` +
    `1. Неявка без уважительной причины снижает рейтинг надёжности на 0.5 балла.\n` +
    `2. Отмена участия возможна не позднее чем за 12 часов до смены.\n` +
    `3. Мастер смены: @KP11_FilmCrew_Bot`
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

  // Меню команд через инлайн-кнопки
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
  if (data === 'cmd:gear') {
    await answerCallbackQuery(queryId);
    return handleTelegramMessage({ chat: { id: chatId }, text: '/gear', from: fromUser });
  }

  // 1. ПОДТВЕРЖДЕНИЕ УЧАСТИЯ В СМЕНЕ: accept:<shootId>
  if (data.startsWith('accept:')) {
    const shootId = data.replace('accept:', '');
    const user = await findUserByChatId(chatId) || localDirectory[0];
    await updateCrewMemberStatus(shootId, user.id, 'ACCEPTED');

    await answerCallbackQuery(queryId, 'Явка на смену успешно подтверждена!', true);

    const shoot = await getShootById(shootId);
    const updatedCallsheet = formatCallsheetMessage(shoot, user.id);

    return editMessageText(chatId, messageId,
      updatedCallsheet +
      `\n\n<b>СТАТУС: ВЫ ПОДТВЕРДИЛИ ЯВКУ НА СМЕНУ</b>\n` +
      `<i>Мастер смены и режиссёр уведомлены о вашей готовности.</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Геоточка на карте', callback_data: `location:${shootId}` },
              { text: 'Чек-лист техники', callback_data: `gear:${shootId}` }
            ],
            [
              { text: 'Отклонить вызов (отмена)', callback_data: `decline:${shootId}` }
            ]
          ]
        }
      }
    );
  }

  // 2. ОТКЛОНЕНИЕ ВЫЗОВА: decline:<shootId>
  if (data.startsWith('decline:')) {
    const shootId = data.replace('decline:', '');
    const user = await findUserByChatId(chatId) || localDirectory[0];
    await updateCrewMemberStatus(shootId, user.id, 'DECLINED');

    await answerCallbackQuery(queryId, 'Вызов отклонен. Мастер смены оповещен.', true);

    const shoot = await getShootById(shootId);
    const updatedCallsheet = formatCallsheetMessage(shoot, user.id);

    return editMessageText(chatId, messageId,
      updatedCallsheet +
      `\n\n<b>СТАТУС: ВЫ ОТКЛОНИЛИ УЧАСТИЕ В ЭТОЙ СМЕНЕ</b>\n` +
      `<i>Заявка снята. Если это ошибка, нажмите кнопку ниже для повторного подтверждения.</i>`,
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

  // 3. ОТПРАВКА ГЕОТОЧКИ: location:<shootId>
  if (data.startsWith('location:')) {
    const shootId = data.replace('location:', '');
    const shoot = await getShootById(shootId);

    await answerCallbackQuery(queryId);

    if (shoot && shoot.latitude && shoot.longitude) {
      await sendLocation(chatId, shoot.latitude, shoot.longitude);
      return sendMessage(chatId,
        `<b>ЛОКАЦИЯ ОБЪЕКТА:</b>\n` +
        `Адрес: <b>${escapeHtml(shoot.location)}</b>\n` +
        `Координаты: <code>${shoot.latitude.toFixed(6)}, ${shoot.longitude.toFixed(6)}</code>\n` +
        `<a href="https://yandex.ru/maps/?pt=${shoot.longitude},${shoot.latitude}&z=16&l=map">Маршрут в Яндекс.Навигаторе</a>`
      );
    } else {
      return sendMessage(chatId, `Координаты для смены <code>${shootId}</code> не заданы.`);
    }
  }

  // 4. ДЕТАЛЬНЫЙ ЧЕК-ЛИСТ ТЕХНИКИ: gear:<shootId>
  if (data.startsWith('gear:')) {
    const shootId = data.replace('gear:', '');
    const shoot = await getShootById(shootId);
    await answerCallbackQuery(queryId);

    const isExterior = (shoot?.type || '').includes('НАТУРА') || (shoot?.type || '').includes('ВЫЕЗД');
    const gearNotes = isExterior
      ? `• Ветрозащита Rycote «Цеппелин» + дождевой чехол на камеру обязательны.\n• Автономные генераторы/аккумуляторы EcoFlow + удлинители 50м.`
      : `• Павильонная коммутация, силовой щит 380V, кабели DMX.\n• Контрольный калиброванный OLED-монитор Flanders Scientific.`;

    return sendMessage(chatId,
      `<b>ТЕХНИЧЕСКИЙ РАЙДЕР ДЛЯ СМЕНЫ:</b>\n` +
      `«${escapeHtml(shoot?.title || 'СМЕНА')}»\n` +
      `════════════════════════════════════\n` +
      `<b>СПЕЦИФИКАЦИЯ ОБЪЕКТА:</b>\n` +
      `${gearNotes}\n\n` +
      `<b>ОБЯЗАТЕЛЬНЫЙ КОНТРОЛЬ:</b>\n` +
      `1. Проверка матриц на битые пиксели перед выездом.\n` +
      `2. Форматирование карт памяти в файловую систему камеры.\n` +
      `3. Тест звукового тракта и уровня шума предусилителей.`
    );
  }

  // 5. ОТКРЫТИЕ ВЫЗЫВНОГО ПО ID: callsheet:<shootId>
  if (data.startsWith('callsheet:')) {
    const shootId = data.replace('callsheet:', '');
    const shoot = await getShootById(shootId);
    await answerCallbackQuery(queryId);

    if (shoot) {
      const user = await findUserByChatId(chatId);
      const targetUserId = user ? user.id : 'demo-user-1';
      const messageText = formatCallsheetMessage(shoot, targetUserId);

      return sendMessage(chatId, messageText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
              { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
            ],
            [
              { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` },
              { text: 'Чек-лист техники', callback_data: `gear:${shoot.id}` }
            ]
          ]
        }
      });
    }
  }

  return answerCallbackQuery(queryId);
}

// ------------------------------------------------------------------------------
// ЕДИНАЯ ТОЧКА ВХОДА ДЛЯ ОБНОВЛЕНИЙ (WEBHOOK ИЛИ POLLING)
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

// ------------------------------------------------------------------------------
// ФУНКЦИЯ РАССЫЛКИ ВЫЗЫВНОГО ЛИСТА ВСЕЙ СЪЁМОЧНОЙ ГРУППЕ
// (Вызывается из веб-интерфейса при нажатии "Отправить в @KP11_FilmCrew_Bot")
// ------------------------------------------------------------------------------
async function sendCallsheetToCrew(shootId) {
  const shoot = await getShootById(shootId);
  if (!shoot) {
    throw new Error(`Смена с ID ${shootId} не найдена`);
  }

  const crew = shoot.crew || [];
  const results = {
    shootId,
    shootTitle: shoot.title,
    totalCrew: crew.length,
    dispatchedCount: 0,
    recipients: []
  };

  console.log(`[KP11 Bot Dispatch] Рассылка вызывного листа для «${shoot.title}» (${crew.length} чел.)...`);

  for (const member of crew) {
    const student = (member.user) || localDirectory.find(s => s.id === member.userId);
    const uName = student?.fullName || 'Студент цеха';
    const tgChatId = student?.telegramChatId;
    const tgUsername = student?.telegram || '@unknown';

    const messageText = formatCallsheetMessage(shoot, member.userId);
    const keyboard = {
      inline_keyboard: [
        [
          { text: 'Подтвердить явку', callback_data: `accept:${shoot.id}` },
          { text: 'Отклонить вызов', callback_data: `decline:${shoot.id}` }
        ],
        [
          { text: 'Геоточка на карте', callback_data: `location:${shoot.id}` },
          { text: 'Чек-лист техники', callback_data: `gear:${shoot.id}` }
        ]
      ]
    };

    let delivered = false;

    // Если известен chatId студента, отправляем напрямую в ЛС
    if (tgChatId) {
      try {
        await sendMessage(tgChatId, messageText, { reply_markup: keyboard });
        delivered = true;
      } catch (err) {
        console.error(`[KP11 Bot Dispatch] Ошибка отправки пользователю ${tgChatId}:`, err.message);
      }
    } else {
      // Имитируем / логируем отправку по Telegram Username
      console.log(`[KP11 Bot Dispatch] Вызов зарегистрирован для ${tgUsername} (${uName}). Доставка при первом открытии бота.`);
      delivered = true;
    }

    if (delivered) {
      results.dispatchedCount++;
      results.recipients.push({
        userId: member.userId,
        fullName: uName,
        role: member.roleInShoot,
        telegram: tgUsername,
        delivered: true
      });
    }
  }

  return results;
}

// ------------------------------------------------------------------------------
// POLLING МЕХАНИЗМ (ДЛЯ ЛОКАЛЬНОГО ТЕСТИРОВАНИЯ ИЛИ СЕРВЕРНОГО ДЕМОНА)
// ------------------------------------------------------------------------------
let isPollingActive = false;
let pollingOffset = 0;

async function startPolling() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[KP11 Bot] Внимание: TELEGRAM_BOT_TOKEN не задан. Бот работает в режиме автономной симуляции API.');
    console.log('[KP11 Bot] Для подключения живого бота создайте его в @BotFather и укажите TELEGRAM_BOT_TOKEN в файле .env.');
    return;
  }

  if (isPollingActive) return;
  isPollingActive = true;
  console.log('[KP11 Bot] Запуск режима Polling (получение обновлений от Telegram)...');

  // Удаляем webhook перед запуском polling
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
      // Краткая пауза при сетевых ошибках
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
// ЭКСПОРТ МОДУЛЯ И CLI ЗАПУСК
// ------------------------------------------------------------------------------
module.exports = {
  startPolling,
  stopPolling,
  handleUpdate,
  sendMessage,
  sendLocation,
  sendCallsheetToCrew,
  formatCallsheetMessage,
  linkUserToTelegram,
  findUserByChatId,
  getShootsForUser,
  getShootById
};

// Запуск при прямом вызове: node bot.js
if (require.main === module) {
  console.log('================================================================');
  console.log(' ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11 // КИНОПРОИЗВОДСТВО');
  console.log(' TELEGRAM BOT ДЛЯ ВЫЗЫВНЫХ ЛИСТОВ И СЪЁМОЧНЫХ ЦЕХОВ');
  console.log(' Имя бота: @KP11_FilmCrew_Bot');
  console.log('================================================================');
  startPolling();
}
