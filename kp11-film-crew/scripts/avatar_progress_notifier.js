/**
 * Поминутный уведомитель мастера (@Min1_M1chael) о процессе разработки системы аватарок
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROGRESS_FILE = path.join(__dirname, 'avatar_progress.json');
const RENDER_BASE_URL = 'https://kp11-film-crew.onrender.com';
const INTERVAL_MS = 60000; // Ровно 1 минута

function getProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {
    step: 1,
    totalSteps: 5,
    currentAction: 'Создание серверных эндпоинтов загрузки и парсинга Dropbox URL',
    details: 'Реализация /api/users/:id/avatar с валидацией URL и локального хранилища /uploads/avatars/'
  };
}

function notifyMaster(text) {
  return new Promise((resolve) => {
    try {
      const data = JSON.stringify({ message: text });
      const req = https.request(`${RENDER_BASE_URL}/api/master/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 8000
      }, (res) => resolve(res.statusCode === 200));
      req.on('error', () => {
        // Фолбэк на /api/master/ask
        const req2 = https.request(`${RENDER_BASE_URL}/api/master/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(JSON.stringify({ question: text }))
          },
          timeout: 8000
        }, (res2) => resolve(res2.statusCode === 200));
        req2.on('error', () => resolve(false));
        req2.write(JSON.stringify({ question: text }));
        req2.end();
      });
      req.write(data);
      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

async function tick() {
  const p = getProgress();
  if (p.isCompleted) {
    console.log('[Avatar Notifier] Разработка завершена, остановка уведомителя.');
    process.exit(0);
    return;
  }

  const progressBar = '▓'.repeat(p.step) + '░'.repeat(Math.max(0, p.totalSteps - p.step));
  const percent = Math.round((p.step / p.totalSteps) * 100);

  const msg = 
    `⏱️ <b>ОТЧЁТ О РАБОТЕ // АВАТАРКИ (${new Date().toLocaleTimeString('ru-RU')})</b>\n` +
    `════════════════════════════════════\n` +
    `Прогресс: [<code>${progressBar}</code>] <b>${percent}%</b> (Шаг ${p.step}/${p.totalSteps})\n\n` +
    `⚡ <b>Текущее действие:</b>\n${p.currentAction}\n\n` +
    `📝 <b>Детализация:</b>\n<i>${p.details}</i>`;

  console.log(`[Avatar Notifier] Отправка минутного отчёта: Шаг ${p.step}/${p.totalSteps}...`);
  await notifyMaster(msg);
}

setInterval(tick, INTERVAL_MS);
console.log('[Avatar Notifier] Запущен поминутный таймер уведомлений мастера @Min1_M1chael...');
