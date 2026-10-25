/**
 * ==============================================================================
 * ГАПОУ КП11 // УМНАЯ СИСТЕМА УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ
 * ДЕДУПЛИКАЦИЯ, АНАЛИЗ ПОЛНОТЫ ДАННЫХ И БЕСШОВНАЯ СИНХРОНИЗАЦИЯ РЕГИСТРАЦИИ
 * ==============================================================================
 */

let bcrypt = null;
try {
  bcrypt = require('bcryptjs');
} catch (e) {}

async function safeHash(pass) {
  if (bcrypt) return await bcrypt.hash(pass, 10);
  return 'hashed_' + Buffer.from(pass).toString('base64');
}

/**
 * Нормализует имя для устойчивого сравнения:
 * убирает лишние пробелы, приводит к нижнему регистру, заменяет 'ё' на 'е',
 * удаляет спецсимволы и знаки препинания.
 */
function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Нормализует логин Telegram (@user -> user)
 */
function normalizeTg(tg) {
  if (!tg) return '';
  return String(tg).replace(/^@/, '').toLowerCase().trim();
}

/**
 * Проверяет соответствие двух имен (ФИО или Имя Фамилия):
 * - Полное совпадение нормализованных строк
 * - Совпадение фамилии и имени (например "Саломатова Анастасия" и "Саломатова Анастасия Александровна")
 */
function areNamesMatching(nameA, nameB) {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const partsA = normA.split(' ');
  const partsB = normB.split(' ');

  // Если оба имеют как минимум Фамилию и Имя:
  if (partsA.length >= 2 && partsB.length >= 2) {
    // 1. Прямой порядок: [Фамилия, Имя]
    if (partsA[0] === partsB[0] && partsA[1] === partsB[1]) return true;

    // 2. Обратный порядок: [Имя, Фамилия]
    if (partsA[0] === partsB[1] && partsA[1] === partsB[0]) return true;

    // 3. Крайние слова (Фамилия и Имя/Отчество)
    if (partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]) return true;
  }

  // Если одно имя состоит из 2 слов, а второе из 1 (редкий случай)
  if ((partsA.length === 1 && partsB.includes(partsA[0])) || (partsB.length === 1 && partsA.includes(partsB[0]))) {
    return false; // Не считаем совпадением одиночное имя во избежание ложных слияний однофамильцев
  }

  return false;
}

/**
 * Проверяет, является ли email служебной/липовой/placeholder-почтой
 */
function isPlaceholderEmail(email) {
  if (!email) return true;
  const em = String(email).toLowerCase().trim();
  return (
    em.endsWith('@kp11.film') ||
    em.endsWith('@kp11.local') ||
    em.includes('@dummy') ||
    em.includes('@temp') ||
    em.includes('@example.com') ||
    em.includes('placeholder') ||
    em.startsWith('temp_') ||
    em.startsWith('dummy_')
  );
}

/**
 * Расчёт оценки полноты профиля пользователя (Completeness Score).
 * Чем полнее заполнен аккаунт, тем выше балл.
 */
function calculateUserCompleteness(user, shoots = []) {
  let score = 0;
  if (!user) return score;

  // 1. Полнота Email (реальная личная почта студента приоритетнее заглушки)
  if (user.email && !isPlaceholderEmail(user.email)) {
    score += 25;
  } else if (user.email) {
    score += 5;
  }

  // 2. Наличие привязки Telegram-аккаунта
  if (user.telegram && user.telegram.trim() && user.telegram !== '@') {
    score += 15;
  }

  // 3. Наличие активного Telegram Chat ID (пользователь подключил бота)
  if (user.telegramChatId) {
    score += 20;
  }

  // 4. Пароль: пользовательский хэш (не стандартный дефолтный)
  if (user.passwordHash && !user.isDummyPassword) {
    score += 10;
  }

  // 5. Учебная группа указана конкретно
  if (user.groupName && user.groupName !== 'Без группы' && user.groupName !== 'КИТ-11' && user.groupName !== 'ЦКТ') {
    score += 10;
  }

  // 6. Рейтинг и накопленные смены
  if (typeof user.rating === 'number' && user.rating > 0) {
    score += 10;
  }
  if (user.completedShoots && user.completedShoots > 0) {
    score += 10;
  }

  // 7. Профиль компетенций
  if (user.competencies && typeof user.competencies === 'object') {
    const compCount = Object.keys(user.competencies).length;
    score += Math.min(compCount * 2.5, 10);
  }

  // 8. Список практических навыков
  if (Array.isArray(user.skills) && user.skills.length > 0) {
    score += Math.min(user.skills.length * 2, 10);
  }

  // 9. Цеховой ранг
  if (user.craftRank && user.craftRank !== 'Ассистент цеха' && user.craftRank !== 'Специалист цеха') {
    score += 10;
  }

  // 10. Участие в сменах (история продакшна)
  if (Array.isArray(shoots) && shoots.length > 0) {
    let participations = 0;
    shoots.forEach(s => {
      if (Array.isArray(s.crew)) {
        if (s.crew.some(m => m.userId === user.id || m.id === user.id)) {
          participations++;
        }
      }
    });
    score += participations * 5;
  }

  return score;
}

/**
 * Объединяет два аккаунта (победитель + проигравший):
 * переносит все данные в профиль победителя и перелинковывает все смены.
 */
function mergeUserAccounts(winner, loser, shoots = []) {
  // 1. Почта: если у победителя заглушка, а у проигравшего реальная — берём реальную!
  if (isPlaceholderEmail(winner.email) && !isPlaceholderEmail(loser.email)) {
    winner.email = loser.email;
  }

  // 2. Telegram: если у победителя не было или у проигравшего новее
  if ((!winner.telegram || winner.telegram === '@') && loser.telegram) {
    winner.telegram = loser.telegram;
  }
  if (!winner.telegramChatId && loser.telegramChatId) {
    winner.telegramChatId = loser.telegramChatId;
  }

  // 3. Группа: если у победителя дефолт
  if ((!winner.groupName || winner.groupName === 'КИТ-11') && loser.groupName) {
    winner.groupName = loser.groupName;
  }

  // 4. Пароль: если у победителя не было или дефолт
  if (!winner.passwordHash && loser.passwordHash) {
    winner.passwordHash = loser.passwordHash;
  }

  // 5. Компетенции и навыки
  if (loser.competencies && typeof loser.competencies === 'object') {
    winner.competencies = { ...(loser.competencies || {}), ...(winner.competencies || {}) };
  }
  if (Array.isArray(loser.skills)) {
    const combinedSkills = new Set([...(winner.skills || []), ...loser.skills]);
    winner.skills = Array.from(combinedSkills);
  }

  // 6. Рейтинг и смены
  if (typeof loser.rating === 'number' && (typeof winner.rating !== 'number' || winner.rating === 0)) {
    winner.rating = loser.rating;
  }
  winner.completedShoots = Math.max(winner.completedShoots || 0, loser.completedShoots || 0);

  // 7. Перелинковываем смены: все участия loser.id заменяем на winner.id
  if (Array.isArray(shoots)) {
    shoots.forEach(shoot => {
      if (shoot.creatorId === loser.id) {
        shoot.creatorId = winner.id;
      }
      if (Array.isArray(shoot.crew)) {
        shoot.crew.forEach(member => {
          if (member.userId === loser.id) {
            member.userId = winner.id;
            member.user = {
              id: winner.id,
              fullName: winner.fullName,
              groupName: winner.groupName,
              rating: winner.rating,
              telegram: winner.telegram,
              craftRank: winner.craftRank
            };
          }
        });
      }
    });
  }

  return { winner, mergedShoots: shoots };
}

/**
 * Автоматическая дедупликация списка пользователей:
 * Ищет дубликаты по ФИО или Telegram.
 * Оставляет аккаунт с максимальной полнотой данных,
 * удаляет менее полный, перелинковывая все смены.
 */
function deduplicateUsers(users, shoots = []) {
  if (!Array.isArray(users)) return { cleanUsers: [], removedUsers: [], shoots };

  const cleanUsers = [...users];
  const removedUsers = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < cleanUsers.length; i++) {
      for (let j = i + 1; j < cleanUsers.length; j++) {
        const uA = cleanUsers[i];
        const uB = cleanUsers[j];

        const matchByName = areNamesMatching(uA.fullName, uB.fullName);
        const matchByTg = uA.telegram && uB.telegram && normalizeTg(uA.telegram) === normalizeTg(uB.telegram);
        const matchByEmail = uA.email && uB.email && uA.email.toLowerCase().trim() === uB.email.toLowerCase().trim();

        if (matchByName || matchByTg || matchByEmail) {
          const scoreA = calculateUserCompleteness(uA, shoots);
          const scoreB = calculateUserCompleteness(uB, shoots);

          let winner, loser, winnerIdx, loserIdx;
          if (scoreA >= scoreB) {
            winner = uA;
            loser = uB;
            winnerIdx = i;
            loserIdx = j;
          } else {
            winner = uB;
            loser = uA;
            winnerIdx = j;
            loserIdx = i;
          }

          // Выполняем умное слияние данных
          mergeUserAccounts(winner, loser, shoots);

          // Удаляем проигравший менее полный аккаунт
          cleanUsers.splice(loserIdx, 1);
          removedUsers.push(loser);

          changed = true;
          break; // перезапускаем проход
        }
      }
      if (changed) break;
    }
  }

  return { cleanUsers, removedUsers, shoots };
}

/**
 * Умная регистрация студента:
 * Если студент с таким именем или Telegram уже был добавлен (например, из производственного графика),
 * система не создаёт дубликат, а обновляет существующий профиль, подставляет его реальный email,
 * задаёт пароль и мгновенно авторизует.
 */
async function linkOrRegisterUser(registrationData, existingUsers = [], shoots = []) {
  const { email, password, fullName, groupName, telegram, course } = registrationData;

  const normTargetName = normalizeName(fullName);
  const normTargetTg = normalizeTg(telegram);
  const normTargetEmail = (email || '').toLowerCase().trim();

  // Ищем существующий профиль по Email, Telegram или ФИО
  let matchedUser = existingUsers.find(u => {
    if (u.email && u.email.toLowerCase().trim() === normTargetEmail) return true;
    if (normTargetTg && u.telegram && normalizeTg(u.telegram) === normTargetTg) return true;
    if (normTargetName && areNamesMatching(u.fullName, fullName)) return true;
    return false;
  });

  const passwordHash = password ? await safeHash(password) : undefined;

  if (matchedUser) {
    // Пользователь найден — обновляем существующий аккаунт его реальными данными!
    matchedUser.email = normTargetEmail;
    if (passwordHash) matchedUser.passwordHash = passwordHash;
    if (fullName) matchedUser.fullName = fullName.trim();
    if (groupName && groupName.trim()) matchedUser.groupName = groupName.trim();
    if (telegram && telegram.trim()) {
      matchedUser.telegram = telegram.startsWith('@') ? telegram.trim() : '@' + telegram.trim();
    }
    if (course) matchedUser.course = parseInt(course, 10);
    matchedUser.isDummyPassword = false;

    // Проверяем, нет ли других дубликатов
    const dedupResult = deduplicateUsers(existingUsers, shoots);

    return {
      user: matchedUser,
      isLinkedExisting: true,
      cleanUsers: dedupResult.cleanUsers,
      shoots: dedupResult.shoots
    };
  }

  // Иначе создаём нового пользователя
  const newUser = {
    id: 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5),
    fullName: fullName.trim(),
    email: normTargetEmail,
    passwordHash: passwordHash || await safeHash('kp11password'),
    groupName: groupName ? groupName.trim() : 'КТ-26',
    role: { name: 'Студент' },
    rating: null,
    course: course ? parseInt(course, 10) : 1,
    telegram: telegram ? (telegram.startsWith('@') ? telegram.trim() : '@' + telegram.trim()) : null,
    telegramChatId: null,
    craftRank: 'Ассистент цеха',
    isSuspended: false,
    competencies: { camera: 75, sound: 75, light: 75, edit: 75 },
    skills: ['Универсал'],
    completedShoots: 0
  };

  existingUsers.push(newUser);
  const dedupResult = deduplicateUsers(existingUsers, shoots);

  return {
    user: newUser,
    isLinkedExisting: false,
    cleanUsers: dedupResult.cleanUsers,
    shoots: dedupResult.shoots
  };
}

module.exports = {
  normalizeName,
  normalizeTg,
  areNamesMatching,
  isPlaceholderEmail,
  calculateUserCompleteness,
  mergeUserAccounts,
  deduplicateUsers,
  linkOrRegisterUser
};
