/**
 * ==============================================================================
 * ГАПОУ КП11 // МОДУЛЬ ОБРАБОТКИ И ОБЛАЧНОЙ ПОДГРУЗКИ АВАТАРОК
 * ==============================================================================
 * Обеспечивает:
 * 1. Интеллектуальную трансформацию ссылок Dropbox (www.dropbox.com -> direct raw)
 * 2. Поддержку внешних URL (Google Drive, Яндекс.Диск, CDN, прямые ссылки)
 * 3. Сохранение base64 в легковесные файлы на сервере (/uploads/avatars/)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.resolve(__dirname, '..', 'public', 'uploads', 'avatars');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
    // Удаляем dl=0 или dl=1 и выставляем raw=1
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
    // Оставляем исходный URL, если он уже прямой, либо возвращаем валидный
    return url;
  }

  return url;
}

/**
 * Сохранение Base64 в виде отдельного графического файла на сервере
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
    return `/uploads/avatars/${fileName}`;
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

module.exports = {
  normalizeAvatarUrl,
  saveAvatarFromBase64,
  processAvatarInput
};
