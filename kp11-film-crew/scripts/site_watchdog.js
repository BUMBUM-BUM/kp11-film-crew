/**
 * ==============================================================================
 * KP11 Production & Local Site Watchdog Agent (Сторожевой агент)
 * ==============================================================================
 * Назначение:
 * - Автономный мониторинг работоспособности локального сервера (localhost:3000)
 *   и облачного сервера Render (kp11-film-crew.onrender.com).
 * - Автоматический перезапуск локального сервера при падении или сбоях.
 * - Поддержание тепла (keep-alive) на Render для предотвращения засыпания.
 * - Отправка уведомлений в Telegram (@KP11_FilmCrew_Bot) при сбоях и восстановлении.
 * - Ведение журнала здоровья в data/watchdog_status.json и data/watchdog.log.
 * ==============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STATUS_FILE = path.join(DATA_DIR, 'watchdog_status.json');
const LOG_FILE = path.join(DATA_DIR, 'watchdog.log');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const LOCAL_URL = 'http://localhost:3000/api/shoots';
const RENDER_URL = 'https://kp11-film-crew.onrender.com/api/shoots';
const CHECK_INTERVAL_MS = 25000; // каждые 25 секунд
const TIMEOUT_MS = 12000;

let localServerProcess = null;
let consecutiveLocalFails = 0;
let consecutiveRenderFails = 0;
let totalRestarts = 0;
let isRestarting = false;
const startTime = Date.now();

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [WATCHDOG] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch (_) {}
}

function readJsonSafe(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {}
  return fallback;
}

function findNodeExecutable() {
  const candidates = [
    process.execPath,
    'C:\\Users\\bad14\\AppData\\Local\\Programs\\com.brotorrent.torrent-client-utorrent\\resources\\app.asar.unpacked\\node_modules\\node\\bin\\node.exe',
    'C:\\Program Files\\nodejs\\node.exe',
    'node'
  ];
  for (const c of candidates) {
    if (c === 'node' || fs.existsSync(c)) {
      return c;
    }
  }
  return 'node';
}

async function sendTelegramAlert(text) {
  try {
    const settings = readJsonSafe(SETTINGS_FILE, {});
    const botToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = settings.defaultChatId || process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return false;

    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 8000
      }, res => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    });
  } catch (_) {
    return false;
  }
}

function checkEndpoint(targetUrl, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const startReq = Date.now();
    const isHttps = targetUrl.startsWith('https:');
    const client = isHttps ? https : http;

    const req = client.get(targetUrl, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startReq;
        let shootsCount = null;
        let isJson = false;
        try {
          const parsed = JSON.parse(data);
          isJson = true;
          if (Array.isArray(parsed.shoots)) {
            shootsCount = parsed.shoots.length;
          }
        } catch (_) {}

        resolve({
          ok: res.statusCode === 200 && isJson,
          statusCode: res.statusCode,
          duration,
          shootsCount,
          error: null
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        ok: false,
        statusCode: null,
        duration: Date.now() - startReq,
        shootsCount: null,
        error: err.message
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ok: false,
        statusCode: null,
        duration: Date.now() - startReq,
        shootsCount: null,
        error: 'Timeout exceeded'
      });
    });
  });
}

function startLocalServer() {
  if (isRestarting) return;
  isRestarting = true;
  totalRestarts++;

  log('Запуск локального сервера node_local_server.js...');
  const nodeBin = findNodeExecutable();
  const scriptPath = path.join(ROOT_DIR, 'node_local_server.js');

  try {
    const child = spawn(nodeBin, [scriptPath], {
      cwd: ROOT_DIR,
      detached: false,
      stdio: 'ignore'
    });

    localServerProcess = child;
    log(`Локальный сервер успешно запущен (PID: ${child.pid}) через ${nodeBin}`);

    child.on('exit', (code, signal) => {
      log(`Локальный сервер завершил работу (code: ${code}, signal: ${signal})`);
      localServerProcess = null;
    });

    child.on('error', (err) => {
      log(`Ошибка процесса локального сервера: ${err.message}`);
      localServerProcess = null;
    });
  } catch (err) {
    log(`Не удалось запустить локальный сервер: ${err.message}`);
  }

  setTimeout(() => {
    isRestarting = false;
  }, 4000);
}

async function runWatchdogCycle() {
  // 1. Проверка локального сервера
  const localRes = await checkEndpoint(LOCAL_URL, 5000);
  
  if (!localRes.ok) {
    consecutiveLocalFails++;
    log(`⚠️ ВНИМАНИЕ: Локальный сервер недоступен (${localRes.error || 'HTTP ' + localRes.statusCode}). Сбоев подряд: ${consecutiveLocalFails}`);
    
    if (!isRestarting) {
      log('🚨 Инициирован автоматический перезапуск локального сервера!');
      startLocalServer();
      sendTelegramAlert(`🚨 <b>[KP11 Watchdog]</b> Обнаружен сбой локального сервера (${localRes.error || 'HTTP ' + localRes.statusCode}). Выполнен автоматический перезапуск.`);
    }
  } else {
    if (consecutiveLocalFails > 0) {
      log(`✅ Локальный сервер восстановлен! Доступен на :3000 (смен: ${localRes.shootsCount}, время: ${localRes.duration}мс)`);
      sendTelegramAlert(`✅ <b>[KP11 Watchdog]</b> Локальный сервер успешно восстановлен и работает штатно (смен: ${localRes.shootsCount}).`);
    }
    consecutiveLocalFails = 0;
  }

  // 2. Проверка облачного сервера Render
  const renderRes = await checkEndpoint(RENDER_URL, 15000);
  if (!renderRes.ok) {
    consecutiveRenderFails++;
    log(`ℹ️ Render сервер: ${renderRes.error || 'HTTP ' + renderRes.statusCode} (сбоев: ${consecutiveRenderFails})`);
    if (consecutiveRenderFails === 3) {
      sendTelegramAlert(`⚠️ <b>[KP11 Watchdog]</b> Продакшн на Render не отвечает более 1 минуты (${renderRes.error || 'HTTP ' + renderRes.statusCode}). Проверьте деплой.`);
    }
  } else {
    if (consecutiveRenderFails > 0) {
      log(`✅ Render сервер активен (смен: ${renderRes.shootsCount}, время отклика: ${renderRes.duration}мс)`);
    }
    consecutiveRenderFails = 0;
  }

  // 3. Сохранение текущего телеметрического статуса
  const statusPayload = {
    status: (localRes.ok && renderRes.ok) ? 'HEALTHY' : (localRes.ok ? 'LOCAL_OK_RENDER_DEGRADED' : 'LOCAL_RECOVERING'),
    watchdogUptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    lastCheck: new Date().toISOString(),
    totalRestarts,
    localServer: {
      status: localRes.ok ? 'ONLINE' : 'OFFLINE',
      statusCode: localRes.statusCode,
      shootsCount: localRes.shootsCount,
      durationMs: localRes.duration,
      error: localRes.error
    },
    renderServer: {
      status: renderRes.ok ? 'ONLINE' : 'DEGRADED',
      statusCode: renderRes.statusCode,
      shootsCount: renderRes.shootsCount,
      durationMs: renderRes.duration,
      error: renderRes.error
    }
  };

  try {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(statusPayload, null, 2), 'utf8');
  } catch (_) {}
}

// Запуск постоянного цикла сторожа
log('=====================================================');
log('🛰️ KP11 Watchdog Agent запущен и активен');
log(`Интервал проверки: ${CHECK_INTERVAL_MS / 1000} сек`);
log('=====================================================');

runWatchdogCycle();
setInterval(runWatchdogCycle, CHECK_INTERVAL_MS);

// Обработка сигналов завершения
process.on('SIGINT', () => {
  log('Сторожевой агент остановлен (SIGINT)');
  if (localServerProcess) {
    try { localServerProcess.kill(); } catch (_) {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Сторожевой агент остановлен (SIGTERM)');
  if (localServerProcess) {
    try { localServerProcess.kill(); } catch (_) {}
  }
  process.exit(0);
});
