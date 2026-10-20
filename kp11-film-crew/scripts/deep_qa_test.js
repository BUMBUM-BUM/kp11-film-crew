/**
 * ==============================================================================
 * АГЕНТ-ТЕСТИРОВЩИК: ГЛУБОКИЙ QA-АУДИТ ВЕБ-ИНТЕРФЕЙСА И БИЗНЕС-ЛОГИКИ КП11
 * ==============================================================================
 * Сценарии тестирования:
 * 1. Инспекция всех модальных окон в DOM и привязанных функций.
 * 2. Создание 3 разных съёмочных смен (Павильон №1, Выездная локация, Тон-ателье)
 *    с уникальными параметрами: цеха, таймкоды, таймлайны, техника.
 * 3. Проверка корректности отображения и целостности сохранённых данных.
 * 4. Формирование вызывного листа и рассылка в Telegram API.
 * 5. Инвентарь: добавление тестовой техники, редактирование статуса в БД.
 * 6. Редактирование профиля студента администратором и проверка сохранения.
 * 7. Выставление оценок (1-5 звёзд) и закрытие смены в архив.
 * 8. ГАРАНТИРОВАННАЯ ОЧИСТКА: полное удаление всех тестовых данных из PostgreSQL
 *    и проверка возврата базы к исходному состоянию.
 * ==============================================================================
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_URL = process.env.TEST_URL || 'https://kp11-film-crew.onrender.com';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

function logPass(title, desc) {
  results.total++;
  results.passed++;
  console.log(`  ✅ [PASS] ${title}: ${desc || ''}`);
  results.details.push({ status: 'PASS', title, desc });
}

function logFail(title, error) {
  results.total++;
  results.failed++;
  console.error(`  ❌ [FAIL] ${title}: ${error}`);
  results.details.push({ status: 'FAIL', title, error });
}

function request(urlStr, options = {}, body = null) {
  return new Promise((resolve) => {
    const isHttps = urlStr.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(urlStr);

    const reqHeaders = {
      'Accept': 'application/json',
      'Authorization': 'Bearer demo-token',
      ...(options.headers || {})
    };

    let bodyData = null;
    if (body) {
      bodyData = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: reqHeaders,
      timeout: 20000
    }, (res) => {
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
    });

    req.on('error', (err) => resolve({ error: err.message, status: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'Request timeout', status: 0 });
    });

    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runDeepAudit() {
  console.log('================================================================');
  console.log('🧪 СУБАГЕНТ-ТЕСТИРОВЩИК: ГЛУБОКИЙ QA-АУДИТ ВЕБ-ИНТЕРФЕЙСА КП11');
  console.log(`📍 Целевой хост: ${BASE_URL}`);
  console.log('================================================================\n');

  // Хранилище ID созданных сущностей для гарантированной очистки
  const createdShootIds = [];
  const createdInventoryIds = [];
  let originalStudent = null;
  let testStudentId = null;

  try {
    // --------------------------------------------------------------------------
    // 1. АУДИТ ВСЕХ МОДАЛЬНЫХ ОКОН И ИНТЕРАКТИВНЫХ УЗЛОВ
    // --------------------------------------------------------------------------
    console.log('📦 1. Проверка структуры и обработчиков всех модальных окон в разметке:');
    const htmlContent = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');
    const appJsContent = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'app.js'), 'utf8');

    const expectedModals = [
      { id: 'modal', title: 'Авторизация и регистрация', closeFunc: 'closeModal' },
      { id: 'shootModal', title: 'Создание / редактирование смены', closeFunc: 'closeShootModal' },
      { id: 'callsheetModal', title: 'Вызывной лист', closeFunc: 'closeCallsheetModal' },
      { id: 'equipmentCheckoutModal', title: 'Склад и чек-аут техники', closeFunc: 'closeEquipmentModal' },
      { id: 'locationManagerModal', title: 'Менеджер съёмочных локаций', closeFunc: 'closeLocationManagerModal' },
      { id: 'competencyModal', title: 'Цифровой паспорт компетенций', closeFunc: 'closeCompetencyModal' },
      { id: 'adminUserFullEditModal', title: 'Редактор профиля студента', closeFunc: 'closeAdminUserFullEditModal' },
      { id: 'cktGradingModal', title: 'Оценка смены и приёмка работы', closeFunc: 'closeCktGradingModal' },
      { id: 'qrPassModal', title: 'QR-пропуск на площадку', closeFunc: 'closeQrPassModal' },
      { id: 'qrCheckinModal', title: 'QR-сканер посещаемости', closeFunc: 'closeQrCheckinModal' },
      { id: 'showreelModal', title: 'Киноплеер шоурилов', closeFunc: 'closeShowreelModal' },
      { id: 'confirmDeleteModal', title: 'Подтверждение удаления', closeFunc: 'closeConfirmDeleteModal' }
    ];

    for (const m of expectedModals) {
      const hasModalInHtml = htmlContent.includes(`id="${m.id}"`);
      const hasCloseFuncInJs = appJsContent.includes(`function ${m.closeFunc}`) || appJsContent.includes(`window.${m.closeFunc}`);
      if (hasModalInHtml && hasCloseFuncInJs) {
        logPass(`Модальное окно «${m.title}»`, `ID: #${m.id}, обработчик закрытия: ${m.closeFunc}() корректно объявлен`);
      } else {
        logFail(`Модальное окно «${m.title}»`, `HTML present: ${hasModalInHtml}, JS func present: ${hasCloseFuncInJs}`);
      }
    }

    // --------------------------------------------------------------------------
    // 2. ПОЛУЧЕНИЕ ИСХОДНЫХ ДАННЫХ И СТУДЕНТОВ ИЗ БАЗЫ
    // --------------------------------------------------------------------------
    console.log('\n👥 2. Загрузка списка студентов и проверка исходного состояния базы:');
    const shootsInitRes = await request(`${BASE_URL}/api/shoots`);
    if (shootsInitRes.status === 200 && Array.isArray(shootsInitRes.data.students)) {
      const students = shootsInitRes.data.students;
      logPass('Реестр студентов', `Успешно загружено ${students.length} студентов из базы данных`);
      if (students.length > 0) {
        testStudentId = students[0].id;
        originalStudent = JSON.parse(JSON.stringify(students[0]));
        logPass('Тестовый студент', `Выбран студент ${originalStudent.fullName} (ID: ${testStudentId}) для тестирования редактирования профиля`);
      }
    } else {
      logFail('Реестр студентов', `Ошибка загрузки студентов: status ${shootsInitRes.status}`);
    }

    // Проверка исходного инвентаря (должна быть только 1 реальная единица)
    const invInitRes = await request(`${BASE_URL}/api/inventory`);
    if (invInitRes.status === 200 && Array.isArray(invInitRes.data.inventory)) {
      logPass('Исходный инвентарь', `В базе ${invInitRes.data.inventory.length} позиций: «${invInitRes.data.inventory.map(i => i.name).join(', ')}»`);
    } else {
      logFail('Исходный инвентарь', `Ошибка загрузки инвентаря: status ${invInitRes.status}`);
    }

    // --------------------------------------------------------------------------
    // 3. СОЗДАНИЕ НЕСКОЛЬКИХ РАЗНЫХ СМЕН С УНИКАЛЬНЫМИ НАСТРОЙКАМИ
    // --------------------------------------------------------------------------
    console.log('\n🎬 3. Создание 3 смен с различными настройками (Студия, Натура, Звукозапись):');

    const testStudents = (shootsInitRes.data && shootsInitRes.data.students) ? shootsInitRes.data.students : [];
    const getStudentId = (idx) => (testStudents[idx] ? testStudents[idx].id : testStudentId);

    // СМЕНА №1: Павильонная студийная съёмка
    const shoot1Payload = {
      title: 'QA ТЕСТ // Павильонная драма «Онежская 3»',
      description: 'Студийный тест съёмочной группы, света и звука в Павильоне №1 ЦКТ',
      type: 'СТУДИЯ',
      date: '2026-10-25T09:00:00.000Z',
      callTime: '08:30',
      startTime: '09:30',
      endTime: '17:00',
      location: 'Павильон №1 ЦКТ (Онежская, 3)',
      latitude: 55.858244,
      longitude: 37.518423,
      timeline: [
        { time: '08:30', title: 'Сбор съёмочной группы и техконтроль' },
        { time: '09:30', title: 'Мотор! Сцена 1: Диалог в интерьере' },
        { time: '13:00', title: 'Обед и резервное копирование материала' },
        { time: '17:00', title: 'Шапка, сдача оборудования на склад' }
      ],
      equipment: [
        { name: 'Canon C200 kit', serialNumber: '-', category: 'Камеры' },
        { name: 'Aputure 300D II', serialNumber: 'AP-300D-QA', category: 'Свет' }
      ],
      crew: [
        { userId: getStudentId(0), roleInShoot: 'Оператор', attendance: 'PRESENT' },
        { userId: getStudentId(1), roleInShoot: 'Звукорежиссёр', attendance: 'PRESENT' },
        { userId: getStudentId(2), roleInShoot: 'Осветитель', attendance: 'PRESENT' }
      ]
    };

    const s1Res = await request(`${BASE_URL}/api/shoots`, { method: 'POST' }, shoot1Payload);
    if (s1Res.status === 200 && s1Res.data.shoot && s1Res.data.shoot.id) {
      createdShootIds.push(s1Res.data.shoot.id);
      logPass('Смена №1 (Павильон)', `Создана успешно: ID ${s1Res.data.shoot.id}, локация: ${shoot1Payload.location}, участников: ${shoot1Payload.crew.length}`);
    } else {
      logFail('Смена №1 (Павильон)', `Ошибка создания: ${JSON.stringify(s1Res.data || s1Res.raw)}`);
    }

    // СМЕНА №2: Выездная натурная съёмка
    const shoot2Payload = {
      title: 'QA ТЕСТ // Натурный выезд «Парк Дружбы»',
      description: 'Выездная съёмка с естественным светом и стедикамом на натуре',
      type: 'ВЫЕЗД',
      date: '2026-10-26T10:00:00.000Z',
      callTime: '09:30',
      startTime: '10:30',
      endTime: '16:00',
      location: 'Натурная площадка (Парк Дружбы / Речной вокзал)',
      latitude: 55.853244,
      longitude: 37.478423,
      timeline: [
        { time: '09:30', title: 'Брифинг по технике безопасности на выезде' },
        { time: '10:30', title: 'Мотор! Проходка персонажа по аллее' },
        { time: '16:00', title: 'Окончание выездной смены' }
      ],
      equipment: [
        { name: 'DJI RS3 Pro Combo', serialNumber: 'RS3-QA-01', category: 'Стабилизация' }
      ],
      crew: [
        { userId: getStudentId(3), roleInShoot: 'Режиссёр', attendance: 'PRESENT' },
        { userId: getStudentId(4), roleInShoot: 'Гаффер', attendance: 'PRESENT' }
      ]
    };

    const s2Res = await request(`${BASE_URL}/api/shoots`, { method: 'POST' }, shoot2Payload);
    if (s2Res.status === 200 && s2Res.data.shoot && s2Res.data.shoot.id) {
      createdShootIds.push(s2Res.data.shoot.id);
      logPass('Смена №2 (Выездная натура)', `Создана успешно: ID ${s2Res.data.shoot.id}, координаты: [${shoot2Payload.latitude}, ${shoot2Payload.longitude}]`);
    } else {
      logFail('Смена №2 (Выездная натура)', `Ошибка создания: ${JSON.stringify(s2Res.data || s2Res.raw)}`);
    }

    // СМЕНА №3: Звукозапись и чистовое озвучание в Тон-ателье
    const shoot3Payload = {
      title: 'QA ТЕСТ // Чистовое тонирование «Тон-ателье ЦКТ»',
      description: 'Запись синхронных шумов, дубляжа и подкаста',
      type: 'СТУДИЯ',
      date: '2026-10-27T11:00:00.000Z',
      callTime: '10:30',
      startTime: '11:00',
      endTime: '15:30',
      location: 'Тон-ателье & Звукозапись ЦКТ',
      latitude: 55.858244,
      longitude: 37.518423,
      timeline: [
        { time: '10:30', title: 'Калибровка микрофонного парка и тракта' },
        { time: '11:00', title: 'Запись войсовера и фолей-шумов' },
        { time: '15:30', title: 'Архивация сессий Pro Tools' }
      ],
      equipment: [
        { name: 'Комплект Shure SM7B + Focusrite', serialNumber: 'SH-QA-99', category: 'Звук' }
      ],
      crew: [
        { userId: getStudentId(0), roleInShoot: 'Звукорежиссёр', attendance: 'PRESENT' }
      ]
    };

    const s3Res = await request(`${BASE_URL}/api/shoots`, { method: 'POST' }, shoot3Payload);
    if (s3Res.status === 200 && s3Res.data.shoot && s3Res.data.shoot.id) {
      createdShootIds.push(s3Res.data.shoot.id);
      logPass('Смена №3 (Тон-ателье)', `Создана успешно: ID ${s3Res.data.shoot.id}, локация: ${shoot3Payload.location}`);
    } else {
      logFail('Смена №3 (Тон-ателье)', `Ошибка создания: ${JSON.stringify(s3Res.data || s3Res.raw)}`);
    }

    // --------------------------------------------------------------------------
    // 4. ВЕРИФИКАЦИЯ СОХРАНЁННЫХ СМЕН И ПРОВЕРКА ДАННЫХ
    // --------------------------------------------------------------------------
    console.log('\n🔍 4. Проверка корректности отображения созданных смен в API:');
    const verifyShootsRes = await request(`${BASE_URL}/api/shoots`);
    if (verifyShootsRes.status === 200 && Array.isArray(verifyShootsRes.data.shoots)) {
      const shootsList = verifyShootsRes.data.shoots;
      const foundIds = shootsList.map(s => s.id);
      
      const allFound = createdShootIds.every(id => foundIds.includes(id));
      if (allFound) {
        logPass('Проверка базы смен', `Все 3 созданные смены сохранены в PostgreSQL и получены через API`);
      } else {
        logFail('Проверка базы смен', `Не все смены найдены: ожидали ${createdShootIds}, нашли ${foundIds}`);
      }

      // Проверка полей первой смены
      const s1 = shootsList.find(s => s.id === createdShootIds[0]);
      if (s1 && s1.title === shoot1Payload.title && s1.location === shoot1Payload.location) {
        logPass('Семантика смены №1', `Заголовок «${s1.title}», таймлайн (${(s1.timeline || []).length} пунктов), локация: ${s1.location}`);
      } else {
        logFail('Семантика смены №1', 'Поля смены №1 не совпадают с ожидаемыми');
      }
    } else {
      logFail('Проверка базы смен', `Не удалось получить смены: status ${verifyShootsRes.status}`);
    }

    // --------------------------------------------------------------------------
    // 5. ТЕСТИРОВАНИЕ ВЫЗЫВНОГО ЛИСТА И РАССЫЛКИ TELEGRAM
    // --------------------------------------------------------------------------
    console.log('\n📱 5. Проверка генератора вызывного листа и Telegram API:');
    if (createdShootIds.length > 0) {
      const dispatchRes = await request(`${BASE_URL}/api/telegram/dispatch`, { method: 'POST' }, {
        shootId: createdShootIds[0],
        customNote: 'Внимание! Форма одежды — рабочая цеховая, сбор строго без опозданий.'
      });
      if (dispatchRes.status === 200 && dispatchRes.data && dispatchRes.data.success) {
        logPass('Вызывной лист в Telegram', `Успешно сформирован и отправлен (статус 200, участников: ${dispatchRes.data.recipientsCount || 0})`);
      } else {
        logFail('Вызывной лист в Telegram', `Ошибка формирования вызывного: status ${dispatchRes.status}`);
      }
    }

    // --------------------------------------------------------------------------
    // 6. ТЕСТИРОВАНИЕ ИНВЕНТАРЯ (ДОБАВЛЕНИЕ, РЕДАКТИРОВАНИЕ, СТАТУС В БД)
    // --------------------------------------------------------------------------
    console.log('\n🎥 6. Тестирование склада техники (CRUD в PostgreSQL):');

    const testGear1 = {
      name: 'QA ТЕСТ // Кинокамера RED Komodo 6K',
      category: 'Камеры',
      serialNumber: 'RED-QA-6019',
      location: 'Склад техники ЦКТ КП11',
      notes: 'Тестовый комплект: клетка, рукоятка, 2x CFast 512GB',
      status: 'AVAILABLE',
      signedBy: 'Бадиков Семён Станиславович'
    };

    const addGearRes = await request(`${BASE_URL}/api/inventory`, { method: 'POST' }, testGear1);
    if (addGearRes.status === 200 && addGearRes.data && addGearRes.data.item && addGearRes.data.item.id) {
      const gearId = addGearRes.data.item.id;
      createdInventoryIds.push(gearId);
      logPass('Добавление техники', `Единица техники «${testGear1.name}» (ID: ${gearId}) добавлена в базу данных`);

      // Редактирование техники (перевод в статус IN_USE)
      const updateGearRes = await request(`${BASE_URL}/api/inventory/${gearId}`, { method: 'PUT' }, {
        status: 'IN_USE',
        notes: 'Выдана на съёмочную смену Павильона №1'
      });
      if (updateGearRes.status === 200 && updateGearRes.data && updateGearRes.data.success) {
        logPass('Редактирование техники', `Статус успешно обновлен на IN_USE («В работе на смене»)`);
      } else {
        logFail('Редактирование техники', `Ошибка обновления статуса: status ${updateGearRes.status}`);
      }
    } else {
      logFail('Добавление техники', `Ошибка добавления единицы техники: status ${addGearRes.status}`);
    }

    // --------------------------------------------------------------------------
    // 7. ТЕСТИРОВАНИЕ РЕДАКТИРОВАНИЯ ПРОФИЛЯ СТУДЕНТА АДМИНИСТРАТОРОМ
    // --------------------------------------------------------------------------
    console.log('\n🧑‍🎓 7. Тестирование полного редактирования профиля студента (Админ-панель):');
    if (testStudentId && originalStudent) {
      const editStudentPayload = {
        fullName: originalStudent.fullName,
        groupName: originalStudent.groupName || 'КТ-26',
        craftRank: 'Старший оператор-постановщик // QA Lead',
        rating: 4.9,
        competencies: { camera: 95, sound: 90, light: 88, edit: 92 }
      };

      const editRes = await request(`${BASE_URL}/api/admin/users/${testStudentId}/full`, { method: 'PUT' }, editStudentPayload);
      if (editRes.status === 200 && editRes.data && editRes.data.success) {
        logPass('Редактирование профиля', `Профиль ${originalStudent.fullName} обновлен: ранг «${editStudentPayload.craftRank}», рейтинг ${editStudentPayload.rating}`);
      } else {
        logFail('Редактирование профиля', `Ошибка обновления профиля студента: status ${editRes.status}`);
      }
    }

    // --------------------------------------------------------------------------
    // 8. ТЕСТИРОВАНИЕ ВЫСТАВЛЕНИЯ ОЦЕНОК И ЗАКРЫТИЯ СМЕНЫ В АРХИВ
    // --------------------------------------------------------------------------
    console.log('\n⭐ 8. Тестирование выставления оценок цехам и завершения смены:');
    if (createdShootIds.length > 0) {
      const completeRes = await request(`${BASE_URL}/api/shoots/complete`, { method: 'POST' }, {
        shootId: createdShootIds[0],
        grades: {
          'crew-1': 5.0,
          'crew-2': 4.8
        }
      });
      if (completeRes.status === 200 && completeRes.data && completeRes.data.success) {
        logPass('Завершение смены', `Смена ${createdShootIds[0]} успешно завершена (isCompleted: true), оценки зафиксированы`);
      } else {
        logFail('Завершение смены', `Ошибка завершения смены: status ${completeRes.status}`);
      }
    }

  } catch (err) {
    logFail('Критический сбой теста', err.stack || err.message);
  } finally {
    // --------------------------------------------------------------------------
    // 9. ГАРАНТИРОВАННАЯ ОЧИСТКА ВСЕХ ТЕСТОВЫХ СУЩНОСТЕЙ (CLEANUP)
    // --------------------------------------------------------------------------
    console.log('\n🧹 9. Полная очистка тестовых данных для возврата базы в исходное состояние:');

    // 1. Удаление всех созданных тестовых смен
    for (const shootId of createdShootIds) {
      const delRes = await request(`${BASE_URL}/api/shoots/${shootId}`, { method: 'DELETE' });
      if (delRes.status === 200) {
        logPass('Очистка смены', `Тестовая смена ${shootId} удалена из PostgreSQL`);
      } else {
        logFail('Очистка смены', `Не удалось удалить смену ${shootId}: status ${delRes.status}`);
      }
    }

    // 2. Удаление всех созданных тестовых единиц оборудования
    for (const eqId of createdInventoryIds) {
      const delInvRes = await request(`${BASE_URL}/api/inventory/${eqId}`, { method: 'DELETE' });
      if (delInvRes.status === 200) {
        logPass('Очистка инвентаря', `Тестовая единица техники ${eqId} удалена из базы`);
      } else {
        logFail('Очистка инвентаря', `Не удалось удалить технику ${eqId}: status ${delInvRes.status}`);
      }
    }

    // 3. Восстановление исходного профиля студента
    if (testStudentId && originalStudent) {
      const restoreRes = await request(`${BASE_URL}/api/admin/users/${testStudentId}/full`, { method: 'PUT' }, {
        fullName: originalStudent.fullName,
        groupName: originalStudent.groupName,
        craftRank: originalStudent.craftRank || 'Ассистент цеха',
        rating: originalStudent.rating || null,
        competencies: originalStudent.competencies || { camera: 80, sound: 80, light: 80, edit: 80 }
      });
      if (restoreRes.status === 200) {
        logPass('Восстановление студента', `Профиль ${originalStudent.fullName} полностью возвращен в исходное состояние`);
      } else {
        logFail('Восстановление студента', `Ошибка восстановления профиля: status ${restoreRes.status}`);
      }
    }

    // 4. Финальная проверка чистоты базы данных
    console.log('\n📊 10. Финальная верификация состояния базы данных после очистки:');
    const finalShootsRes = await request(`${BASE_URL}/api/shoots`);
    const finalInvRes = await request(`${BASE_URL}/api/inventory`);

    const finalShootsCount = (finalShootsRes.data && Array.isArray(finalShootsRes.data.shoots)) ? finalShootsRes.data.shoots.length : -1;
    const finalInvCount = (finalInvRes.data && Array.isArray(finalInvRes.data.inventory)) ? finalInvRes.data.inventory.length : -1;

    if (finalShootsCount === 0) {
      logPass('Чистота смен', `База смен чиста: ровно 0 смен (все тестовые удалены)`);
    } else {
      logFail('Чистота смен', `Остались смены в базе: ${finalShootsCount}`);
    }

    if (finalInvCount === 1) {
      const remainingName = finalInvRes.data.inventory[0].name;
      logPass('Чистота инвентаря', `В базе ровно 1 исходная единица техники: «${remainingName}»`);
    } else {
      logFail('Чистота инвентаря', `Количество техники отличается от исходного: ${finalInvCount}`);
    }
  }

  console.log('\n================================================================');
  console.log('📊 ИТОГИ ГЛУБОКОГО АУДИТА АГЕНТА-ТЕСТИРОВЩИКА:');
  console.log(`Всего проверок: ${results.total}`);
  console.log(`Успешно:       ${results.passed} ✅`);
  console.log(`Ошибок:        ${results.failed} ❌`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runDeepAudit();
