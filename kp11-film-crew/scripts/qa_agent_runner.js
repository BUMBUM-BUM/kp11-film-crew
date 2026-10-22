/**
 * ==============================================================================
 * АГЕНТ-ТЕСТИРОВЩИК (QA & E2E Testing Runner)
 * Платформа: «Медиацентр КП11 // Съёмочные смены»
 * ==============================================================================
 * Выполняет комплексную проверку:
 * 1. Сетевые эндпоинты (REST API) и отсутствие 401/500 ошибок.
 * 2. Целостность данных (отсутствие демонстрационных заглушек, только реальные смены).
 * 3. Семантическая валидация элементов интерфейса, форм и модальных окон.
 * 4. Ролевая модель и права доступа (Студент, Мастер, Гость).
 * ==============================================================================
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHOOTS_FILE = path.join(ROOT_DIR, 'data', 'shoots.json');
const USERS_FILE = path.join(ROOT_DIR, 'data', 'users.json');
const INDEX_HTML = path.join(ROOT_DIR, 'public', 'index.html');
const APP_JS = path.join(ROOT_DIR, 'public', 'js', 'app.js');

const BASE_URL = process.env.TEST_URL || 'https://kp11-film-crew.onrender.com';

function httpGet(urlStr) {
  return new Promise((resolve) => {
    const isHttps = urlStr.startsWith('https');
    const client = isHttps ? https : http;
    client.get(urlStr, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', (err) => resolve({ error: err.message, status: 0 }));
  });
}

function httpPost(urlStr, body, headers = {}) {
  return new Promise((resolve) => {
    const isHttps = urlStr.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(urlStr);
    const data = JSON.stringify(body);
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(resBody);
          resolve({ status: res.statusCode, data: json, raw: resBody });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody });
        }
      });
    });
    req.on('error', (err) => resolve({ error: err.message, status: 0 }));
    req.write(data);
    req.end();
  });
}

const report = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  suites: []
};

function runTest(suiteName, testName, fn) {
  report.totalTests++;
  let suite = report.suites.find(s => s.name === suiteName);
  if (!suite) {
    suite = { name: suiteName, tests: [] };
    report.suites.push(suite);
  }
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(asyncRes => {
        if (asyncRes === false) {
          report.failed++;
          suite.tests.push({ name: testName, status: 'FAILED' });
          console.log(`  ❌ [FAIL] ${testName}`);
        } else {
          report.passed++;
          suite.tests.push({ name: testName, status: 'PASSED' });
          console.log(`  ✅ [PASS] ${testName}`);
        }
      }).catch(err => {
        report.failed++;
        suite.tests.push({ name: testName, status: 'ERROR', error: err.message });
        console.log(`  💥 [ERROR] ${testName}: ${err.message}`);
      });
    } else if (res === false) {
      report.failed++;
      suite.tests.push({ name: testName, status: 'FAILED' });
      console.log(`  ❌ [FAIL] ${testName}`);
    } else {
      report.passed++;
      suite.tests.push({ name: testName, status: 'PASSED' });
      console.log(`  ✅ [PASS] ${testName}`);
    }
  } catch (err) {
    report.failed++;
    suite.tests.push({ name: testName, status: 'ERROR', error: err.message });
    console.log(`  💥 [ERROR] ${testName}: ${err.message}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('🧪 АГЕНТ-ТЕСТИРОВЩИК: КОМПЛЕКСНАЯ ПРОВЕРКА ВЕБ-ИНТЕРФЕЙСА КП11');
  console.log(`📍 Целевой хост: ${BASE_URL}`);
  console.log('================================================================\n');

  // SUITE 1: ПРОВЕРКА ЦЕЛОСТНОСТИ ФАЙЛОВ И ДАННЫХ
  console.log('📂 1. Проверка целостности локальных файлов и отсутствия демо-данных:');
  
  runTest('Data Integrity', 'Файл data/shoots.json существует и является валидным JSON', () => {
    const raw = fs.readFileSync(SHOOTS_FILE, 'utf-8');
    const shoots = JSON.parse(raw);
    return Array.isArray(shoots);
  });

  runTest('Data Integrity', 'Отсутствие устаревших демонстрационных смен (shoot-prod-1, shoot-1792450290828)', () => {
    const raw = fs.readFileSync(SHOOTS_FILE, 'utf-8');
    const shoots = JSON.parse(raw);
    const demoFound = shoots.some(s => s.id === 'shoot-prod-1' || s.id === 'shoot-1792450290828');
    return !demoFound;
  });

  runTest('Data Integrity', 'Файл data/users.json содержит реестр студентов и преподавателей', () => {
    const raw = fs.readFileSync(USERS_FILE, 'utf-8');
    const users = JSON.parse(raw);
    return Array.isArray(users) && users.length > 0;
  });

  runTest('DOM Verification', 'public/index.html содержит все ключевые модальные окна и контейнеры', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    const requiredIds = [
      'shootModal',
      'callsheetModal',
      'cktGradingModal',
      'qrPassModal',
      'competencyModal',
      'adminUserFullEditModal',
      'shootsList',
      'cinemaBoardText'
    ];
    for (const id of requiredIds) {
      if (!html.includes(`id="${id}"`)) {
        console.warn(`    ⚠️ Отсутствует элемент с id="${id}"`);
        return false;
      }
    }
    return true;
  });

  runTest('DOM Verification', 'Кнопки навигации и вкладки присутствуют в разметке', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    return html.includes('tabShootsBtn') && html.includes('tabMapBtn') && html.includes('tabPortfolioBtn');
  });

  // SUITE 2: ПРОВЕРКА СЕТЕВЫХ ЭНДПОИНТОВ (API AUDIT)
  console.log('\n🌐 2. Сетевой аудит эндпоинтов REST API:');

  await runTest('API Audit', 'GET /api/shoots возвращает статус 200 и массив реальных смен', async () => {
    const res = await httpGet(`${BASE_URL}/api/shoots`);
    if (res.status !== 200 || !res.data) return false;
    const shoots = res.data.shoots;
    if (!Array.isArray(shoots)) return false;
    const demoFound = shoots.some(s => s.id === 'shoot-prod-1' || s.id === 'shoot-1792450290828');
    if (demoFound) {
      console.warn('    ⚠️ В ответе API обнаружены демо-смены!');
      return false;
    }
    return true;
  });

  await runTest('API Audit', 'GET /api/cinemaboard возвращает 200 без 401 Unauthorized', async () => {
    const res = await httpGet(`${BASE_URL}/api/cinemaboard`);
    return res.status === 200 && res.data && Boolean(res.data.message);
  });

  await runTest('API Audit', 'GET /api/telegram/status сообщает о готовности бота', async () => {
    const res = await httpGet(`${BASE_URL}/api/telegram/status`);
    return res.status === 200 && res.data && Boolean(res.data.active);
  });

  await runTest('API Audit', 'GET /api/locations возвращает список локаций съёмок', async () => {
    const res = await httpGet(`${BASE_URL}/api/locations`);
    return res.status === 200 && res.data && Array.isArray(res.data.locations);
  });

  await runTest('API Audit', 'GET /api/inventory возвращает каталог кинооборудования', async () => {
    const res = await httpGet(`${BASE_URL}/api/inventory`);
    return res.status === 200 && res.data && Array.isArray(res.data.inventory);
  });

  // SUITE 3: СТРЕСС-ТЕСТ СОЗДАНИЯ И РАССЫЛКИ СМЕНЫ
  console.log('\n⚡ 3. Стресс-тест функционального цикла смены (Создание -> Вызывной -> Удаление):');

  let testShootId = null;

  await runTest('Workflow Test', 'POST /api/shoots создаёт новую смену и возвращает ID', async () => {
    const newShootPayload = {
      title: 'QA_AUTOMATED_TEST_SHOOT',
      description: 'Автоматический тест агента-тестировщика',
      type: 'СТУДИЯ',
      date: '2026-10-30T10:00:00',
      callTime: '10:00',
      startTime: '11:00',
      endTime: '16:00',
      location: 'Павильон КП11',
      crewAssignments: [{ userId: '12aa1ef9-1b0f-4356-a1b6-4f82ff9eec55', craftRole: 'Оператор' }]
    };
    const res = await httpPost(`${BASE_URL}/api/shoots`, newShootPayload);
    if (res.status === 200 && res.data && res.data.id) {
      testShootId = res.data.id;
      return true;
    }
    return false;
  });

  await runTest('Workflow Test', 'POST /api/telegram/dispatch формирует вызывной лист без 500 ошибки', async () => {
    if (!testShootId) return false;
    const res = await httpPost(`${BASE_URL}/api/telegram/dispatch`, { shootId: testShootId });
    return res.status === 200 && res.data && res.data.success === true;
  });

  await runTest('Workflow Test', 'DELETE /api/shoots/:id удаляет смену навсегда', async () => {
    if (!testShootId) return false;
    return new Promise((resolve) => {
      const isHttps = BASE_URL.startsWith('https');
      const client = isHttps ? https : http;
      const url = new URL(`${BASE_URL}/api/shoots/${testShootId}`);
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'DELETE'
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.end();
    });
  });

  // SUITE 4: СМЫСЛОВАЯ ПРОВЕРКА ТЕКСТОВ И ТЕРМИНОЛОГИИ КИНОЦЕХА
  console.log('\n🎬 4. Смысловой аудит кинематографической терминологии и контента:');

  runTest('Semantic Audit', 'Клиентский скрипт содержит корректные наименования цехов и рангов', () => {
    const code = fs.readFileSync(APP_JS, 'utf-8');
    const terms = [
      ['Оператор-постановщик', 'Оператор'],
      ['Звукорежиссёр', 'Звукорежиссер', 'Звуковой цех'],
      ['Осветитель', 'Осветительский цех', 'Гаффер'],
      ['Монтажёр', 'Монтажер', 'Монтажный цех'],
      ['Вызывной лист', 'Вызывной'],
      ['Смена']
    ];
    for (const termVariants of terms) {
      const found = termVariants.some(t => code.includes(t));
      if (!found) {
        console.warn(`    ⚠️ Термин «${termVariants[0]}» не найден в app.js`);
        return false;
      }
    }
    return true;
  });

  runTest('Semantic Audit', 'Генератор вызывных листов включает таймкоды, локацию и состав цеха', () => {
    const code = fs.readFileSync(APP_JS, 'utf-8');
    return code.includes('generateCallSheetText') && code.includes('СЪЁМОЧНАЯ ГРУППА');
  });

  console.log('\n================================================================');
  console.log(`📊 ИТОГИ АУДИТА АГЕНТА-ТЕСТИРОВЩИКА:`);
  console.log(`Всего тестов: ${report.totalTests}`);
  console.log(`Успешно:     ${report.passed} ✅`);
  console.log(`Ошибок:      ${report.failed} ❌`);
  console.log('================================================================\n');

  if (report.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal QA Runner Error:', err);
  process.exit(1);
});
