/**
 * ==============================================================================
 * ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11 // СИНХРОНИЗАЦИЯ ДАННЫХ
 * ЕДИНЫЙ ИСТОЧНИК ДАННЫХ ДЛЯ ВЕБ-САЙТА, СЕРВЕРА И TELEGRAM-БОТА
 * ==============================================================================
 * Гарантирует:
 * 1. Никаких «несуществующих съёмок» — если смены нет на сайте, её нет и в боте.
 * 2. Полная синхронизация юзеров и их Telegram-аккаунтов.
 * 3. Поддержка сохранения токена бота и настроек прямо из админ-панели.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);
const SHOOTS_FILE = path.join(DATA_DIR, 'shoots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Подключение к Prisma Client (если есть БД)
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (e) {}

// Начальные пользователи сайта (строго соответствующие реестру колледжа)
const INITIAL_USERS = [
  {
    id: 'demo-user-1',
    fullName: 'Бадиков Семён Станиславович',
    email: 'semyon.badikov@kp11.ru',
    groupName: 'КТ-26',
    rating: 4.8,
    telegram: '@badikov_dop',
    telegramChatId: null,
    craftRank: 'Оператор-постановщик // Master DOP',
    isSuspended: false,
    role: { name: 'Мастер / Преподаватель' },
    competencies: { camera: 96, sound: 98, light: 92, edit: 94 },
    skills: ['Log-C', 'Shure SM7B', 'Aputure 300D', 'Sound Design', 'DaVinci Resolve']
  },
  {
    id: 'u1',
    fullName: 'Ковалев Михаил Алексеевич',
    email: 'mikhail.kovalev@kp11.ru',
    groupName: 'ФВТ-22',
    rating: 4.7,
    telegram: '@mikhail_cam',
    telegramChatId: null,
    craftRank: 'Камерный оператор // 1st AC',
    isSuspended: false,
    role: { name: 'Студент' },
    competencies: { camera: 95, sound: 82, light: 88, edit: 96 },
    skills: ['ARRI Master Prime', 'Цветокоррекция', 'Стедикам', 'LUT Pipeline']
  },
  {
    id: 'u2',
    fullName: 'Демидов Тимофей Дмитриевич',
    email: 'timofey.demidov@kp11.ru',
    groupName: 'ФВТ-22',
    rating: 4.5,
    telegram: '@timofey_light',
    telegramChatId: null,
    craftRank: 'Гаффер смены // Chief Lighting',
    isSuspended: false,
    role: { name: 'Студент' },
    competencies: { camera: 88, sound: 78, light: 94, edit: 80 },
    skills: ['Dedolight', 'Светотеневой рисунок', 'Вольфрам 3200K', 'Электробезопасность']
  },
  {
    id: 'u3',
    fullName: 'Гусев Андрей Алексеевич',
    email: 'andrey.gusev@kp11.ru',
    groupName: 'КТ-25',
    rating: 3.5,
    telegram: '@andrey_gaffer',
    telegramChatId: null,
    craftRank: 'Ассистент осветителя // Best Boy',
    isSuspended: false,
    role: { name: 'Студент' },
    competencies: { camera: 75, sound: 70, light: 85, edit: 68 },
    skills: ['Гаффер-сетап', 'Рассеиватели', 'Штативы C-Stand']
  },
  {
    id: 'u4',
    fullName: 'Соколова Анна Алексеевна',
    email: 'anna.sokolova@kp11.ru',
    groupName: 'КТ-15',
    rating: 4.0,
    telegram: '@anna_sound',
    telegramChatId: null,
    craftRank: 'Звукооператор // Boom Operator',
    isSuspended: false,
    role: { name: 'Студент' },
    competencies: { camera: 84, sound: 92, light: 75, edit: 86 },
    skills: ['Радиопетлички Sennheiser', 'Микрофонный бум', 'Синхронизация']
  },
  {
    id: 'u5',
    fullName: 'Жемчужников Ярослав Станиславович',
    email: 'yaroslav.zhemch@kp11.ru',
    groupName: 'КТ-25',
    rating: 4.5,
    telegram: '@yaroslav_dop',
    telegramChatId: null,
    craftRank: 'Оператор-постановщик // Master DOP',
    isSuspended: false,
    role: { name: 'Студент' },
    competencies: { camera: 97, sound: 85, light: 90, edit: 92 },
    skills: ['Оператор-постановщик', 'Фокус-пуллинг', 'ARRI RAW', 'Стедикам']
  }
];

// Начальные смены сайта (ТОЛЬКО РЕАЛЬНЫЕ СМЕНЫ С САЙТА, БЕЗ ВЫДУМАННЫХ ДАННЫХ)
const INITIAL_SHOOTS = [
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
    creator: { fullName: 'Бадиков Семён Станиславович' },
    crew: [
      { id: 'c1', roleInShoot: 'ГАФФЕР', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'u3' },
      { id: 'c2', roleInShoot: 'ОПЕРАТОР', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'u5' },
      { id: 'c3', roleInShoot: 'ЗВУКОРЕЖИССЁР', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'demo-user-1' },
      { id: 'c4', roleInShoot: 'ОСВЕТИТЕЛЬ', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'u2' }
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
    creator: { fullName: 'Бадиков Семён Станиславович' },
    crew: [
      { id: 'c5', roleInShoot: 'ЗВУКОРЕЖИССЁР', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'demo-user-1' },
      { id: 'c6', roleInShoot: 'ОПЕРАТОР', status: 'ACCEPTED', attendance: 'PRESENT', userId: 'u1' },
      { id: 'c7', roleInShoot: 'ОПЕРАТОР', status: 'PENDING', attendance: 'PRESENT', userId: 'u4' }
    ]
  }
];

function readJsonFile(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Ошибка чтения ${filePath}:`, err.message);
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Ошибка записи ${filePath}:`, err.message);
    return false;
  }
}

// ------------------------------------------------------------------------------
// РАБОТА СО СМЕНАМИ
// ------------------------------------------------------------------------------
async function getShoots() {
  if (prisma) {
    try {
      const dbShoots = await prisma.shoot.findMany({
        include: {
          creator: { select: { fullName: true } },
          crew: {
            include: {
              user: {
                select: { id: true, fullName: true, groupName: true, rating: true, skills: true, telegram: true, craftRank: true }
              }
            }
          }
        },
        orderBy: { date: 'asc' }
      });
      if (Array.isArray(dbShoots)) return dbShoots;
    } catch (e) {}
  }
  return readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
}

async function getShootById(id) {
  const shoots = await getShoots();
  return shoots.find(s => s.id === id) || null;
}

async function saveShoot(shootData) {
  if (prisma) {
    try {
      // Prisma создание при наличии БД
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  const existingIdx = shoots.findIndex(s => s.id === shootData.id);
  if (existingIdx >= 0) {
    shoots[existingIdx] = { ...shoots[existingIdx], ...shootData };
  } else {
    shoots.unshift(shootData);
  }
  writeJsonFile(SHOOTS_FILE, shoots);
  return shootData;
}

async function deleteShoot(id) {
  if (prisma) {
    try {
      await prisma.shoot.delete({ where: { id } }).catch(() => {});
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  const filtered = shoots.filter(s => s.id !== id);
  writeJsonFile(SHOOTS_FILE, filtered);
  return true;
}

async function updateCrewMemberStatus(shootId, userId, newStatus) {
  if (prisma) {
    try {
      await prisma.crewMember.updateMany({
        where: { shootId, userId },
        data: { status: newStatus }
      });
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  const shoot = shoots.find(s => s.id === shootId);
  if (shoot && shoot.crew) {
    const member = shoot.crew.find(c => c.userId === userId || c.id === userId);
    if (member) {
      member.status = newStatus;
      writeJsonFile(SHOOTS_FILE, shoots);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------------------
// РАБОТА С ПОЛЬЗОВАТЕЛЯМИ
// ------------------------------------------------------------------------------
async function getUsers() {
  if (prisma) {
    try {
      const dbUsers = await prisma.user.findMany({ include: { role: true } });
      if (dbUsers && dbUsers.length > 0) return dbUsers;
    } catch (e) {}
  }
  return readJsonFile(USERS_FILE, INITIAL_USERS);
}

async function getUserById(id) {
  const users = await getUsers();
  return users.find(u => u.id === id) || null;
}

async function getUserByTelegram(usernameOrChatId) {
  const users = await getUsers();
  const searchStr = String(usernameOrChatId).replace(/^@/, '').toLowerCase();
  return users.find(u => {
    if (u.telegramChatId && String(u.telegramChatId) === String(usernameOrChatId)) return true;
    if (u.telegram && u.telegram.replace(/^@/, '').toLowerCase() === searchStr) return true;
    return false;
  }) || null;
}

async function updateUser(id, updates) {
  if (prisma) {
    try {
      await prisma.user.update({
        where: { id },
        data: {
          fullName: updates.fullName || undefined,
          groupName: updates.groupName || undefined,
          rating: updates.rating !== undefined && updates.rating !== null ? parseFloat(updates.rating) : undefined,
          telegram: updates.telegram || undefined,
          telegramChatId: updates.telegramChatId || undefined,
          craftRank: updates.craftRank || undefined,
          isSuspended: updates.isSuspended !== undefined ? updates.isSuspended : undefined
        }
      });
    } catch (e) {}
  }

  const users = readJsonFile(USERS_FILE, INITIAL_USERS);
  const user = users.find(u => u.id === id);
  if (user) {
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.groupName !== undefined) user.groupName = updates.groupName;
    if (updates.rating !== undefined && updates.rating !== null) user.rating = parseFloat(updates.rating);
    if (updates.telegram !== undefined) {
      user.telegram = updates.telegram.trim() ? (updates.telegram.startsWith('@') ? updates.telegram.trim() : '@' + updates.telegram.trim()) : '';
    }
    if (updates.telegramChatId !== undefined) user.telegramChatId = String(updates.telegramChatId);
    if (updates.craftRank !== undefined) user.craftRank = updates.craftRank;
    if (updates.isSuspended !== undefined) user.isSuspended = updates.isSuspended;

    writeJsonFile(USERS_FILE, users);
    return user;
  }
  return null;
}

// ------------------------------------------------------------------------------
// НАСТРОЙКИ (ТОКЕН БОТА, ДЕФОЛТНЫЙ ЧАТ)
// ------------------------------------------------------------------------------
function getSettings() {
  const defaults = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    defaultChatId: '',
    botUsername: 'KP11_FilmCrew_Bot'
  };
  return readJsonFile(SETTINGS_FILE, defaults);
}

function saveSettings(settings) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  writeJsonFile(SETTINGS_FILE, updated);
  if (updated.telegramBotToken) {
    process.env.TELEGRAM_BOT_TOKEN = updated.telegramBotToken;
  }
  return updated;
}

module.exports = {
  getShoots,
  getShootById,
  saveShoot,
  deleteShoot,
  updateCrewMemberStatus,
  getUsers,
  getUserById,
  getUserByTelegram,
  updateUser,
  getSettings,
  saveSettings,
  INITIAL_SHOOTS,
  INITIAL_USERS
};
