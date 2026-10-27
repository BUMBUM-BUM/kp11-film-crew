/**
 * ==============================================================================
 * ГАПОУ КП11 // ДЕМОН НЕПРЕРЫВНОГО ОТСЛЕЖИВАНИЯ КОМАНД МАСТЕРА (@Min1_M1chael)
 * ==============================================================================
 * Непрерывно мониторит:
 * 1. Новые задачи от @Min1_M1chael в data/master_tasks.json и Telegram
 * 2. Команды деплоя (автоматический git add/commit/push в origin main)
 * 3. Доступность localhost:3000 и Render, поддерживая активность серверов
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const store = require('../data/store');
const bot = require('../bot');

const CHECK_INTERVAL_MS = 5000;
let isRunning = true;

async function checkServerHealth(url) {
  return new Promise((resolve) => {
    try {
      const client = url.startsWith('https') ? https : http;
      const req = client.get(url, { timeout: 8000 }, (res) => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT' }); });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function loop() {
  if (!isRunning) return;

  try {
    const data = store.getMasterTasksData();
    const tasks = data.tasks || [];

    // Поиск новых задач от мастера
    const newTasks = tasks.filter(t => t.status === 'NEW');
    for (const t of newTasks) {
      console.log(`[Master Daemon] Обнаружена новая задача ${t.id} от ${t.author}: «${t.text}»`);

      const lower = t.text.toLowerCase();

      // Автоматическое выполнение команды деплоя
      if (lower.includes('деплой') || lower.includes('deploy') || lower.startsWith('/deploy')) {
        console.log(`[Master Daemon] Выполнение деплоя по задаче ${t.id}...`);
        t.status = 'IN_PROGRESS';
        store.updateMasterTask(t.id, { status: 'IN_PROGRESS' });

        const deployResult = await bot.triggerDeploy(`deploy: task ${t.id} requested by @Min1_M1chael via Telegram`);
        if (deployResult.success) {
          store.updateMasterTask(t.id, {
            status: 'DONE',
            solution: 'Изменения отправлены в GitHub origin/main, запущен Render деплой',
            deployOutput: deployResult.output
          });

          const masterChatId = store.getMasterChatId();
          if (masterChatId) {
            await bot.sendMessage(masterChatId,
              `🚀 <b>ДЕПЛОЙ ВЫПОЛНЕН // ${t.id}</b>\n` +
              `════════════════════════════════════\n` +
              `Команда деплоя успешно выполнена агентом!\n` +
              `Изменения отправлены в <code>origin main</code>. Render производит обновление сайта.\n\n` +
              `<i>Лог:</i> <code>${bot.formatCallsheetMessage ? t.id : ''} ${String(deployResult.output).slice(-250)}</code>`
            );
          }
        } else {
          store.updateMasterTask(t.id, {
            status: 'FAILED',
            solution: 'Ошибка git push: ' + deployResult.output
          });
          const masterChatId = store.getMasterChatId();
          if (masterChatId) {
            await bot.sendMessage(masterChatId, `⚠️ Ошибка выполнения деплоя: ${deployResult.output}`);
          }
        }
      }
    }

    // Периодический мониторинг здоровья серверов (раз в минуту)
    if (!global._lastHealthCheck || (Date.now() - global._lastHealthCheck > 60000)) {
      global._lastHealthCheck = Date.now();
      const local = await checkServerHealth('http://localhost:3000/api/health');
      if (!local.ok) {
        console.warn('[Master Daemon Health] Предупреждение: localhost:3000 статус:', local.statusCode || local.error);
      }
    }

  } catch (err) {
    console.error('[Master Daemon Error]:', err.message);
  }

  setTimeout(loop, CHECK_INTERVAL_MS);
}

console.log('[Master Daemon] Запуск демона непрерывного отслеживания команд @Min1_M1chael...');
loop();
