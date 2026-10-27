/**
 * ==============================================================================
 * ГАПОУ КП11 // МОДУЛЬ ОБРАБОТКИ И ОБЛАЧНОЙ ПОДГРУЗКИ АВАТАРОК
 * ==============================================================================
 * Обеспечивает:
 * 1. Интеллектуальную трансформацию ссылок Dropbox (www.dropbox.com -> direct raw)
 * 2. Поддержку внешних URL (Google Drive, Яндекс.Диск, CDN, прямые ссылки)
 * 3. Сохранение base64 в легковесные файлы на сервере (/uploads/avatars/)
 * 4. ПОСТОЯННЫЙ РЕЕСТР АВАТАРОК (data/user_avatars.json), объединяющий данные
 *    Prisma PostgreSQL и файлового хранилища, гарантируя сохранение даже при
 *    перезапуске сервера или отсутствии поля avatar в SQL схеме.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'avatars');
const AVATARS_REGISTRY_FILE = path.join(DATA_DIR, 'user_avatars.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
}

function readJsonSafe(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return fallback;
}

function writeJsonSafe(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`[Avatar Helper] Ошибка записи ${file}:`, err.message);
  }
}

/**
 * Нормализация и преобразование URL облачных дисков в прямые графические ссылки
 */
function normalizeAvatarUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();

  // 1. Обработка Dropbox ссылок
  // Пример: https://www.dropbox.com/scl/fi/xyz123/myphoto.jpg?rlkey=abc&dl=0
  // -> https://dl.dropboxusercontent.com/scl/fi/xyz123/myphoto.jpg?rlkey=abc&raw=1
  if (url.includes('dropbox.com')) {
    url = url.replace(/www\.dropbox\.com/i, 'dl.dropboxusercontent.com');
    url = url.replace(/([?&])dl=[01]/gi, '$1raw=1');
    if (!url.includes('raw=1')) {
      url += (url.includes('?') ? '&' : '?') + 'raw=1';
    }
    return url;
  }

  // 2. Обработка Google Drive ссылок
  // Пример: https://drive.google.com/file/d/1A2B3C4D5E/view?usp=sharing
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdriveMatch) {
    const fileId = gdriveMatch[1];
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  // 3. Обработка Яндекс.Диск публичных ссылок (если передан прямой превью-URL)
  if (url.includes('disk.yandex.ru') && !url.includes('downloader')) {
    return url;
  }

  return url;
}

let dropboxClient = null;
try { dropboxClient = require('./dropbox_client'); } catch (_) {}

/**
 * Сохранение Base64 в виде отдельного графического файла на сервере и облаке Dropbox
 */
function saveAvatarFromBase64(userId, base64String) {
  try {
    if (!base64String || typeof base64String !== 'string') return null;

    const matches = base64String.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    let ext = 'jpg';
    let dataBuffer = null;

    if (matches) {
      ext = matches[1].replace('jpeg', 'jpg');
      dataBuffer = Buffer.from(matches[2], 'base64');
    } else if (base64String.length > 100) {
      dataBuffer = Buffer.from(base64String, 'base64');
    } else {
      return null;
    }

    const cleanUserId = String(userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `avatar_${cleanUserId}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    fs.writeFileSync(filePath, dataBuffer);
    const localUrl = `/uploads/avatars/${fileName}`;

    // Фоновая загрузка в облако Dropbox для долговечного хранения
    if (dropboxClient && typeof dropboxClient.uploadAvatarBuffer === 'function') {
      dropboxClient.uploadAvatarBuffer(userId, dataBuffer, ext).then(cloudUrl => {
        if (cloudUrl) {
          console.log(`[Avatar Helper] Аватарка ${userId} успешно загружена в Dropbox: ${cloudUrl}`);
          const reg = getAvatarRegistry();
          if (userId && reg.byUserId) {
            reg.byUserId[String(userId)] = cloudUrl;
            writeJsonSafe(AVATARS_REGISTRY_FILE, reg);
          }
        }
      }).catch(err => {
        console.warn('[Avatar Helper] Ошибка фоновой выгрузки в Dropbox:', err.message);
      });
    }

    return localUrl;
  } catch (err) {
    console.error('[Avatar Helper Error] Сохранение base64:', err.message);
    return null;
  }
}

/**
 * Единый шлюз обработки входящей аватарки (URL или Base64 или существующий путь)
 */
function processAvatarInput(userId, input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Если это внешний URL (http:// или https://)
  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeAvatarUrl(trimmed);
  }

  // 2. Если это data URI (Base64)
  if (trimmed.startsWith('data:image/')) {
    const savedPath = saveAvatarFromBase64(userId, trimmed);
    return savedPath || trimmed;
  }

  // 3. Если это локальный путь (/uploads/... или img/...)
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/') || trimmed.startsWith('img/')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  return trimmed;
}

/**
 * Получение реестра аватарок
 */
function getAvatarRegistry() {
  const defaultReg = { byUserId: {}, byEmail: {}, byTelegram: {}, updatedAt: new Date().toISOString() };
  return readJsonSafe(AVATARS_REGISTRY_FILE, defaultReg);
}

/**
 * Получение аватарки пользователя по ID, Email или Telegram
 */
function getUserAvatar(userId, email, telegram) {
  const reg = getAvatarRegistry();
  if (userId && reg.byUserId && reg.byUserId[String(userId)]) {
    return reg.byUserId[String(userId)];
  }
  if (email && reg.byEmail && reg.byEmail[String(email).toLowerCase().trim()]) {
    return reg.byEmail[String(email).toLowerCase().trim()];
  }
  if (telegram) {
    const cleanTg = String(telegram).replace(/^@/, '').toLowerCase().trim();
    if (reg.byTelegram && reg.byTelegram[cleanTg]) {
      return reg.byTelegram[cleanTg];
    }
  }

  // Fallback: проверка в users.json
  const users = readJsonSafe(USERS_FILE, []);
  const u = users.find(usr => 
    (userId && usr.id === userId) ||
    (email && usr.email && usr.email.toLowerCase() === String(email).toLowerCase()) ||
    (telegram && usr.telegram && usr.telegram.replace(/^@/, '').toLowerCase() === String(telegram).replace(/^@/, '').toLowerCase())
  );
  if (u && u.avatar) return u.avatar;

  return null;
}

/**
 * Сохранение аватарки в постоянный реестр и синхронизация со всеми ключами
 */
function setUserAvatar(userId, email, telegram, rawAvatar) {
  const processed = processAvatarInput(userId, rawAvatar);
  const reg = getAvatarRegistry();
  if (!reg.byUserId) reg.byUserId = {};
  if (!reg.byEmail) reg.byEmail = {};
  if (!reg.byTelegram) reg.byTelegram = {};

  const now = new Date().toISOString();
  reg.updatedAt = now;

  if (userId) {
    if (processed) reg.byUserId[String(userId)] = processed;
    else delete reg.byUserId[String(userId)];
  }

  if (email) {
    const cleanEmail = String(email).toLowerCase().trim();
    if (processed) reg.byEmail[cleanEmail] = processed;
    else delete reg.byEmail[cleanEmail];
  }

  if (telegram) {
    const cleanTg = String(telegram).replace(/^@/, '').toLowerCase().trim();
    if (cleanTg) {
      if (processed) reg.byTelegram[cleanTg] = processed;
      else delete reg.byTelegram[cleanTg];
    }
  }

  writeJsonSafe(AVATARS_REGISTRY_FILE, reg);

  // Синхронизация с users.json
  const users = readJsonSafe(USERS_FILE, []);
  let found = false;
  users.forEach(u => {
    if ((userId && u.id === userId) ||
        (email && u.email && u.email.toLowerCase() === String(email).toLowerCase().trim()) ||
        (telegram && u.telegram && u.telegram.replace(/^@/, '').toLowerCase() === String(telegram).replace(/^@/, '').toLowerCase().trim())) {
      u.avatar = processed || null;
      found = true;
    }
  });
  if (found) {
    writeJsonSafe(USERS_FILE, users);
  }

  return processed;
}

/**
 * Обогащение объекта пользователя аватаркой из постоянного реестра
 */
function enrichUserWithAvatar(user) {
  if (!user || typeof user !== 'object') return user;
  const avatar = getUserAvatar(user.id, user.email, user.telegram);
  return {
    ...user,
    avatar: avatar || user.avatar || null
  };
}

/**
 * Обогащение списка пользователей
 */
function enrichUsersWithAvatars(usersList) {
  if (!Array.isArray(usersList)) return [];
  return usersList.map(u => enrichUserWithAvatar(u));
}

module.exports = {
  normalizeAvatarUrl,
  saveAvatarFromBase64,
  processAvatarInput,
  getAvatarRegistry,
  getUserAvatar,
  setUserAvatar,
  enrichUserWithAvatar,
  enrichUsersWithAvatars
};
