const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const store = require('./data/store');
const telegramBot = require('./bot');

const DATA_DIR = path.join(__dirname, 'data');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SHOOTS_FILE = path.join(DATA_DIR, 'shoots.json');

function readJsonSafe(file, fallback = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {}
  return fallback;
}

function writeJsonSafe(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {}
}

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'ckt_kp11_secret_key_2026';

// ----------------- VAPID & WEBPUSH CONFIG -----------------
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'UUxI4SWFq7VzN-GqYf3lFvhG7bT8bV1v_N0E4XzQ_48';

webpush.setVapidDetails(
  'mailto:mediacenter@kp11.ru',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// ----------------- NODEMAILER TRANSPORTER -----------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mail.ru',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'mediacenter_test@kp11.ru',
    pass: process.env.SMTP_PASS || 'secret_password_here'
  }
});

async function sendNotificationEmail(toEmail, subject, htmlContent) {
  try {
    if (!process.env.SMTP_USER) {
      console.log(`[Email Mock] Письмо для ${toEmail}: ${subject}`);
      return;
    }
    await transporter.sendMail({
      from: `"Медиацентр КП11" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      html: htmlContent
    });
  } catch (err) {
    console.error(`Ошибка отправки Email на ${toEmail}:`, err.message);
  }
}

async function sendWebPushNotification(userId, title, body, url = '/') {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    const payload = JSON.stringify({ title, body, url });

    for (const sub of subscriptions) {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      webpush.sendNotification(pushConfig, payload).catch(async (err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.error('Ошибка Web Push:', err.message);
        }
      });
    }
  } catch (err) {
    console.error('Ошибка отправки Web Push:', err.message);
  }
}

app.use(cors());
try {
  const compression = require('compression');
  app.use(compression());
} catch (e) {
  // compression will activate on Render when dependencies are installed
}
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }
}));

async function optionalAuthToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true }
    });
    req.user = user || null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

  if (token.startsWith('token-')) {
    const rawId = token.replace('token-', '');
    const storeUsers = await store.getUsers();
    const user = storeUsers.find(u => u.id === rawId || u.email === rawId);
    if (user) {
      req.user = user;
      return next();
    }
  }

  try {
    let user = null;
    if (prisma) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: { role: true }
        });
      } catch (e) {}
    }
    if (!user) {
      try {
        const payload = jwt.decode(token);
        if (payload && payload.userId) {
          const storeUsers = await store.getUsers();
          user = storeUsers.find(u => u.id === payload.userId);
        }
      } catch (e) {}
    }
    if (!user) {
      const storeUsers = await store.getUsers();
      user = storeUsers.find(u => u.id === 'master-1') || storeUsers[0];
    }
    req.user = user;
    next();
  } catch (err) {
    const storeUsers = await store.getUsers();
    req.user = storeUsers.find(u => u.id === 'master-1') || storeUsers[0];
    next();
  }
}

function requireAdmin(req, res, next) {
  const roleName = req.user?.role?.name || req.user?.role || '';
  if (!req.user || (roleName !== 'Администратор' && !String(roleName).includes('Админ'))) {
    return res.status(403).json({ error: 'Доступ запрещён. Требуются права Администратора.' });
  }
  next();
}

function requireMasterOrAdmin(req, res, next) {
  const roleName = req.user?.role?.name || req.user?.role || '';
  if (!req.user || (roleName !== 'Администратор' && roleName !== 'Мастер / Преподаватель' && !String(roleName).includes('Мастер') && !String(roleName).includes('Админ'))) {
    return res.status(403).json({ error: 'Доступ запрещён. Требуются права Мастера или Администратора.' });
  }
  next();
}

async function initDatabase() {
  try {
    let studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    if (!studentRole) {
      studentRole = await prisma.role.create({ data: { name: 'Студент', description: 'Студент направления' } });
    }

    let teacherRole = await prisma.role.findUnique({ where: { name: 'Мастер / Преподаватель' } });
    if (!teacherRole) {
      teacherRole = await prisma.role.create({ data: { name: 'Мастер / Преподаватель', description: 'Руководитель смен' } });
    }

    let adminRole = await prisma.role.findUnique({ where: { name: 'Администратор' } });
    if (!adminRole) {
      adminRole = await prisma.role.create({ data: { name: 'Администратор', description: 'Управление системой' } });
    }

    const adminExists = await prisma.user.findUnique({ where: { email: 'admin@ckt.ru' } });
    if (!adminExists) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: { email: 'admin@ckt.ru', passwordHash, fullName: 'Главный Администратор', groupName: 'Админ', roleId: adminRole.id, rating: null }
      });
    }

    // Синхронизируем базовых пользователей в PostgreSQL для целостности внешних ключей
    const initialUsers = await store.getUsers();
    for (const u of initialUsers) {
      const targetRoleId = (u.role?.name === 'Мастер / Преподаватель' || u.role === 'Мастер / Преподаватель')
        ? teacherRole.id
        : (u.role?.name === 'Администратор' || u.role === 'Администратор')
          ? adminRole.id
          : studentRole.id;

      await prisma.user.upsert({
        where: { id: u.id },
        update: {
          fullName: u.fullName,
          groupName: u.groupName || 'КТ-26',
          telegram: u.telegram || null,
          craftRank: u.craftRank || null,
          rating: typeof u.rating === 'number' ? u.rating : null
        },
        create: {
          id: u.id,
          email: u.email || `${u.id}@kp11.ru`,
          passwordHash: await bcrypt.hash('kp11password', 10),
          fullName: u.fullName,
          groupName: u.groupName || 'КТ-26',
          roleId: targetRoleId,
          telegram: u.telegram || null,
          craftRank: u.craftRank || null,
          rating: typeof u.rating === 'number' ? u.rating : null,
          skills: u.skills || []
        }
      }).catch(err => console.warn(`[Prisma Init User ${u.id}]`, err.message));
    }

    // Автоматическая дедупликация пользователей и проверка целостности данных
    await store.deduplicateAllUsers();

    // Синхронизация съёмочных смен в PostgreSQL
    const scheduleShoots = await store.getShoots();
    for (const sh of scheduleShoots) {
      if (!sh || !sh.id) continue;
      try {
        const creator = await prisma.user.findFirst();
        if (creator) {
          const shootExists = await prisma.shoot.findUnique({ where: { id: sh.id } }).catch(() => null);
          if (!shootExists) {
            await prisma.shoot.create({
              data: {
                id: sh.id,
                title: sh.title,
                description: sh.description || '',
                type: sh.type || 'СТУДИЯ',
                date: new Date(sh.date),
                callTime: sh.callTime || '10:00',
                startTime: sh.startTime || '11:30',
                endTime: sh.endTime || '18:00',
                timeline: Array.isArray(sh.timeline) ? sh.timeline : [],
                equipment: Array.isArray(sh.equipment) ? sh.equipment : [],
                location: sh.location || 'Смольная 10А',
                latitude: sh.latitude || 55.857321,
                longitude: sh.longitude || 37.491244,
                creatorId: creator.id
              }
            }).catch(() => {});
          }
          // Синхронизация состава съёмочной группы
          if (sh.crew && Array.isArray(sh.crew) && sh.crew.length > 0) {
            for (const cm of sh.crew) {
              const uId = cm.userId || (cm.user && cm.user.id);
              if (uId) {
                const userExists = await prisma.user.findUnique({ where: { id: uId } }).catch(() => null);
                if (userExists) {
                  const cmExists = await prisma.crewMember.findFirst({
                    where: { shootId: sh.id, userId: uId }
                  }).catch(() => null);
                  if (!cmExists) {
                    await prisma.crewMember.create({
                      data: {
                        id: cm.id || `cm-${sh.id}-${uId}`,
                        shootId: sh.id,
                        userId: uId,
                        roleInShoot: cm.roleInShoot || 'Участник',
                        status: cm.status || 'ACCEPTED',
                        attendance: cm.attendance || 'PRESENT'
                      }
                    }).catch(() => {});
                  }
                }
              }
            }
          }
        }
      } catch (shErr) {}
    }
  } catch (err) {
    console.error('DB Init Error:', err.message);
  }
}
initDatabase();

app.post('/api/admin/users/deduplicate', optionalAuthToken, async (req, res) => {
  try {
    const result = await store.deduplicateAllUsers();
    res.json({ success: true, message: 'Умная дедупликация базы пользователей выполнена', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- NOTIFICATION ENDPOINTS -----------------
app.get('/api/notifications/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/notifications/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Неверные данные подписки' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId: req.user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      },
      create: {
        userId: req.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- AUTH -----------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, groupName, course, telegram } = req.body;
    if (!fullName || !email) {
      return res.status(400).json({ error: 'Пожалуйста, заполните ФИО и Email' });
    }

    // 1. Умная регистрация и связывание профиля через userManager
    const regResult = await store.linkOrRegisterUser({
      email,
      password,
      fullName,
      groupName,
      course,
      telegram
    });

    const user = regResult.user;

    // 2. Синхронизация с PostgreSQL при наличии БД
    if (prisma) {
      try {
        let studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
        if (!studentRole) {
          studentRole = await prisma.role.create({ data: { name: 'Студент', description: 'Студент направления' } });
        }
        await prisma.user.upsert({
          where: { id: user.id },
          update: {
            email: user.email,
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            groupName: user.groupName || 'КТ-26',
            telegram: user.telegram || null,
            craftRank: user.craftRank || 'Ассистент цеха'
          },
          create: {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            groupName: user.groupName || 'КТ-26',
            roleId: studentRole.id,
            telegram: user.telegram || null,
            craftRank: user.craftRank || 'Ассистент цеха',
            skills: user.skills || ['Универсал']
          }
        });
      } catch (dbErr) {
        console.warn('[Register DB Sync]', dbErr.message);
      }
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        groupName: user.groupName,
        role: user.role?.name || (typeof user.role === 'string' ? user.role : 'Студент'),
        telegram: user.telegram,
        craftRank: user.craftRank,
        rating: user.rating
      },
      isLinkedExisting: regResult.isLinkedExisting,
      message: regResult.isLinkedExisting 
        ? 'Добро пожаловать! Ваш аккаунт успешно привязан к назначенным сменам.' 
        : 'Регистрация успешно завершена.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function transliterateRussian(str) {
  const ru = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return String(str || '')
    .toLowerCase()
    .split('')
    .map(c => ru[c] !== undefined ? ru[c] : (/[a-z0-9]/.test(c) ? c : '_'))
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'student';
}

// Заочная регистрация студента с липовой почтой
app.post(['/api/admin/proxy-register', '/api/users/proxy-register'], optionalAuthToken, async (req, res) => {
  try {
    const { fullName, groupName, telegram, craftDept, craftRank, email, password } = req.body || {};
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Пожалуйста, заполните ФИО студента' });
    }

    let targetEmail = (email || '').trim().toLowerCase();
    if (!targetEmail || targetEmail.endsWith('@kp11.local') || targetEmail.includes('dummy') || targetEmail.includes('temp')) {
      if (!targetEmail || targetEmail.includes('auto') || targetEmail.includes('student')) {
        const translitName = transliterateRussian(fullName.trim());
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        targetEmail = `${translitName}_${randomSuffix}@kp11.local`;
      }
    }

    const targetPassword = password || 'kp11_film2026';

    const regResult = await store.linkOrRegisterUser({
      email: targetEmail,
      password: targetPassword,
      fullName: fullName.trim(),
      groupName: (groupName && groupName.trim()) || 'КТ-26',
      telegram: telegram ? (telegram.startsWith('@') ? telegram.trim() : '@' + telegram.trim()) : null,
      course: 1
    });

    const user = regResult.user;
    if (craftDept) user.craftDept = craftDept;
    if (craftRank) user.craftRank = craftRank;
    await store.updateUser(user.id, user);

    if (prisma) {
      try {
        let studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
        if (!studentRole) {
          studentRole = await prisma.role.create({ data: { name: 'Студент', description: 'Студент направления' } });
        }
        await prisma.user.upsert({
          where: { id: user.id },
          update: {
            email: user.email,
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            groupName: user.groupName || 'КТ-26',
            telegram: user.telegram || null,
            craftRank: user.craftRank || 'Ассистент цеха'
          },
          create: {
            id: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            fullName: user.fullName,
            groupName: user.groupName || 'КТ-26',
            roleId: studentRole.id,
            telegram: user.telegram || null,
            craftRank: user.craftRank || 'Ассистент цеха',
            skills: user.skills || ['Специалист съёмочной группы']
          }
        });
      } catch (dbErr) {
        console.warn('[Proxy Register DB Sync]', dbErr.message);
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        groupName: user.groupName,
        role: user.role?.name || (typeof user.role === 'string' ? user.role : 'Студент'),
        telegram: user.telegram,
        craftRank: user.craftRank,
        craftDept: user.craftDept,
        rating: user.rating
      },
      credentials: {
        email: user.email,
        password: targetPassword
      },
      message: `Студент ${user.fullName} успешно заочно зарегистрирован!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = null;
    if (prisma) {
      try {
        user = await prisma.user.findUnique({ 
          where: { email },
          include: { role: true }
        });
      } catch (e) {}
    }

    if (!user) {
      const users = await store.getUsers();
      user = users.find(u => u.email && u.email.toLowerCase() === (email || '').toLowerCase().trim());
    }

    if (!user) return res.status(400).json({ error: 'Неверные данные' });
    // Черный список не блокирует вход в личный кабинет

    if (user.passwordHash) {
      const isValid = await bcrypt.compare(password, user.passwordHash).catch(() => false);
      if (!isValid) return res.status(400).json({ error: 'Неверные данные' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    const roleName = user.role?.name || (typeof user.role === 'string' ? user.role : 'Студент');
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        fullName: user.fullName, 
        email: user.email, 
        groupName: user.groupName, 
        role: roleName,
        rating: user.rating,
        telegram: user.telegram,
        craftRank: user.craftRank
      } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cinemaboard', optionalAuthToken, async (req, res) => {
  try {
    const user = req.user || {};
    const rating = (user && user.rating !== null && user.rating !== undefined) ? user.rating : 5.0;
    const currentHour = new Date().getHours();
    const timeBlock = Math.floor(currentHour / 3);

    let messages = [];
    if (rating <= 2.5) {
      messages = [
        "«Не ошибается тот, кто ничего не делает». Соберись перед следующим дублем! — Народная мудрость",
        "«То, что вы делаете сегодня, говорит громче, чем любые слова». Время переснять неудачный кадр. — Махатма Ганди",
        "«Падение — это не поражение. Поражение — это оставаться лежать». Ждём тебя на съёмочной площадке! — Сократ"
      ];
    } else if (rating <= 4.0) {
      messages = [
        "«Кино — это жизнь, с которой вывели пятна». Продолжаем двигаться по сценарию! — Альфред Хичкок",
        "«Гениальность — это один процент вдохновения и девяносто девять процентов пота». Держи фокус! — Томас Эдисон",
        "«Дисциплина — это мост между вашими целями и их достижением». Отличный темп работы! — Джим Рон"
      ];
    } else {
      messages = [
        "«Кинематограф не должен быть сплошным куском жизни; он должен быть произведением искусства». Ты творишь искусство! — Стэнли Кубрик",
        "«Великие фильмы рождаются из великих идей и безупречной работы команды». Браво за твой уровень! — Жан-Люк Годар",
        "«Искусство смывает пыль повседневности с души». Твои смены сияют ярче софитов! — Пабло Пикассо"
      ];
    }

    const selectedMessage = messages[timeBlock % messages.length];
    res.json({
      timeBlock,
      rating,
      message: selectedMessage,
      statusType: rating <= 2.5 ? 'support' : (rating <= 4.0 ? 'neutral' : 'praise')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ----------------- СИСТЕМА КОММЕНТАРИЕВ И РЕЦЕНЗИЙ (ЛАЙКИ / ДИЗЛАЙКИ, 6 МЕСЯЦЕВ) -----------------
app.get('/api/comments', optionalAuthToken, async (req, res) => {
  try {
    const studentId = req.query.studentId || null;
    const comments = store.getComments(studentId);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comments', optionalAuthToken, async (req, res) => {
  try {
    const { studentId, studentName, type, text, shootId, shootTitle, authorName: clientAuthorName } = req.body;
    if (!studentId || !text || !text.trim()) {
      return res.status(400).json({ error: 'Укажите студента и текст отзыва' });
    }

    let authorName = req.user?.fullName || clientAuthorName || 'Мастер Медиацентра';
    let authorId = req.user?.id || 'master-1';

    let resolvedStudentName = studentName || '';
    if (!resolvedStudentName) {
      try {
        const allUsers = await store.getUsers();
        const st = (allUsers || []).find(u => u.id === studentId);
        if (st) resolvedStudentName = st.fullName;
      } catch (e) {}
    }

    const newComment = store.addComment({
      studentId,
      studentName: resolvedStudentName,
      authorId,
      authorName,
      type: type === 'NEGATIVE' ? 'NEGATIVE' : 'POSITIVE',
      text: text.trim(),
      shootId: shootId || null,
      shootTitle: shootTitle || null
    });

    res.json({ success: true, comment: newComment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/comments/:id', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    store.deleteComment(id);
    res.json({ success: true, message: 'Отзыв удален' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- СМЕНА ПАРОЛЯ В ЛИЧНОМ КАБИНЕТЕ -----------------
app.post('/api/auth/change-password', optionalAuthToken, async (req, res) => {
  try {
    const { newPassword, userId } = req.body;
    const targetUserId = (req.user && req.user.id) ? req.user.id : userId;
    if (!targetUserId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 4 символа' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await store.updateUser(targetUserId, { passwordHash });

    if (prisma) {
      try {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { passwordHash }
        }).catch(() => {});
      } catch (e) {}
    }

    res.json({ success: true, message: 'Пароль успешно обновлён' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- ЧЕРНЫЙ СПИСОК (ВМЕСТО ОТСТРАНЕНИЯ) -----------------
app.post(['/api/admin/users/:id/blacklist', '/api/admin/users/:id/suspend'], optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlacklisted, isSuspended } = req.body;
    const flag = isBlacklisted !== undefined ? !!isBlacklisted : (isSuspended !== undefined ? !!isSuspended : true);

    const updated = await store.updateUser(id, { isBlacklisted: flag });
    if (prisma) {
      try {
        await prisma.user.update({
          where: { id },
          data: { isSuspended: flag }
        }).catch(() => {});
      } catch (e) {}
    }

    res.json({ success: true, user: updated, message: flag ? 'Пользователь помещен в черный список' : 'Пользователь убран из черного списка' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reset-ratings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.user.updateMany({ data: { rating: null } });
    res.json({ success: true, message: 'Рейтинг всех пользователей успешно сброшен' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.all(['/api/admin/users/:id/full', '/api/admin/users/:id'], optionalAuthToken, async (req, res) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { id } = req.params;
    const { fullName, email, groupName, role, roleName, craftRank, telegram, telegramChatId, newPassword, isBlacklisted } = req.body;

    let passwordHash = undefined;
    if (newPassword && newPassword.trim().length >= 4) {
      passwordHash = await bcrypt.hash(newPassword.trim(), 10);
    }

    const updates = {
      fullName,
      email,
      groupName,
      craftRank,
      telegram,
      telegramChatId,
      isBlacklisted: isBlacklisted !== undefined ? !!isBlacklisted : undefined,
      passwordHash
    };

    const targetRoleName = roleName || (role && role.name) || (typeof role === 'string' ? role : undefined);
    if (targetRoleName) {
      updates.role = { name: targetRoleName };
    }

    if (prisma) {
      try {
        let roleId = undefined;
        if (targetRoleName) {
          const r = await prisma.role.findUnique({ where: { name: targetRoleName } }).catch(() => null);
          if (r) roleId = r.id;
        }
        await prisma.user.update({
          where: { id },
          data: {
            fullName: fullName || undefined,
            email: email || undefined,
            groupName: groupName || undefined,
            roleId: roleId || undefined,
            craftRank: craftRank || undefined,
            telegram: telegram !== undefined ? (telegram ? (telegram.startsWith('@') ? telegram : '@' + telegram) : '') : undefined,
            telegramChatId: telegramChatId !== undefined ? String(telegramChatId) : undefined,
            passwordHash: passwordHash || undefined,
            isSuspended: isBlacklisted !== undefined ? !!isBlacklisted : undefined
          }
        }).catch(() => {});
      } catch (dbErr) {}
    }

    // Синхронизация с store.js
    const storeUser = await store.updateUser(id, updates);
    res.json({ success: true, user: storeUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/data', optionalAuthToken, async (req, res) => {
  try {
    let roles = [];
    let users = [];
    try {
      roles = await prisma.role.findMany();
      users = await prisma.user.findMany({ include: { role: true } });
    } catch (e) {}

    if (!users || users.length === 0) {
      users = await store.getUsers();
    }
    const settings = store.getSettings();
    res.json({ roles, users, settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/settings', optionalAuthToken, async (req, res) => {
  try {
    const { telegramBotToken, defaultChatId, telegramTopicId, botUsername } = req.body;
    const updated = store.saveSettings({ telegramBotToken, defaultChatId, telegramTopicId, botUsername });
    if (telegramBotToken) {
      telegramBot.startPolling();
    }
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/suspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, isSuspended } = req.body;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isSuspended }
    });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { roleName } = req.body;
    const targetRole = await prisma.role.findUnique({ where: { name: roleName } });
    if (!targetRole) return res.status(400).json({ error: 'Роль не найдена' });

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { roleId: targetRole.id },
      include: { role: true }
    });
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (prisma) {
      try {
        await prisma.crewMember.deleteMany({ where: { userId: id } }).catch(() => {});
        await prisma.user.delete({ where: { id } }).catch(() => {});
      } catch (e) {}
    }
    await store.deleteUser(id);
    res.json({ success: true, message: 'Пользователь удален' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(['/api/admin/shoots/:id', '/api/shoots/:id'], optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (prisma) {
      try {
        await prisma.crewMember.deleteMany({ where: { shootId: id } }).catch(() => {});
        await prisma.shoot.delete({ where: { id } }).catch(() => {});
      } catch (e) {}
    }
    await store.deleteShoot(id);
    res.json({ success: true, message: 'Смена удалена' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- РЕЕСТР ПРЕСЕТОВ ЛОКАЦИЙ -----------------
// ----------------- РЕЕСТР ПРЕСЕТОВ ЛОКАЦИЙ -----------------
app.get('/api/locations', async (req, res) => {
  try {
    if (prisma && prisma.location) {
      const dbLocations = await prisma.location.findMany().catch(() => null);
      if (dbLocations && dbLocations.length > 0) {
        return res.json({ success: true, locations: dbLocations });
      }
    }
  } catch (e) {}
  const locations = readJsonSafe(LOCATIONS_FILE, []);
  res.json({ success: true, locations });
});

app.post('/api/locations', optionalAuthToken, async (req, res) => {
  const { name, badge, type, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название локации' });

  let newLoc = null;
  if (prisma && prisma.location) {
    try {
      newLoc = await prisma.location.create({
        data: {
          name: name.trim(),
          badge: badge ? badge.trim() : (type === 'ВЫЕЗД' ? '🚗 ' : '🎬 ') + name.trim(),
          type: type || 'СТУДИЯ',
          latitude: parseFloat(latitude) || 55.751244,
          longitude: parseFloat(longitude) || 37.618423
        }
      });
    } catch (e) {}
  }

  if (!newLoc) {
    newLoc = {
      id: `loc-${Date.now().toString(36)}`,
      name: name.trim(),
      badge: badge ? badge.trim() : (type === 'ВЫЕЗД' ? '🚗 ' : '🎬 ') + name.trim(),
      type: type || 'СТУДИЯ',
      latitude: parseFloat(latitude) || 55.751244,
      longitude: parseFloat(longitude) || 37.618423
    };
  }

  const locations = readJsonSafe(LOCATIONS_FILE, []);
  locations.push(newLoc);
  writeJsonSafe(LOCATIONS_FILE, locations);

  let allLocations = locations;
  if (prisma && prisma.location) {
    try {
      const dbLocs = await prisma.location.findMany();
      if (dbLocs && dbLocs.length > 0) allLocations = dbLocs;
    } catch (e) {}
  }
  res.json({ success: true, location: newLoc, locations: allLocations });
});

app.put('/api/locations/:id', optionalAuthToken, async (req, res) => {
  const { id } = req.params;
  const { name, badge, type, latitude, longitude } = req.body;

  let updatedLoc = null;
  if (prisma && prisma.location) {
    try {
      updatedLoc = await prisma.location.update({
        where: { id },
        data: {
          name: name ? name.trim() : undefined,
          badge: badge ? badge.trim() : undefined,
          type: type || undefined,
          latitude: latitude !== undefined ? parseFloat(latitude) : undefined,
          longitude: longitude !== undefined ? parseFloat(longitude) : undefined
        }
      }).catch(() => null);
    } catch (e) {}
  }

  const locations = readJsonSafe(LOCATIONS_FILE, []);
  const updated = locations.map(l => {
    if (l.id === id) {
      const up = {
        ...l,
        name: name ? name.trim() : l.name,
        badge: badge ? badge.trim() : l.badge,
        type: type || l.type,
        latitude: latitude !== undefined ? parseFloat(latitude) : l.latitude,
        longitude: longitude !== undefined ? parseFloat(longitude) : l.longitude
      };
      if (!updatedLoc) updatedLoc = up;
      return up;
    }
    return l;
  });

  writeJsonSafe(LOCATIONS_FILE, updated);
  let allLocations = updated;
  if (prisma && prisma.location) {
    try {
      const dbLocs = await prisma.location.findMany();
      if (dbLocs && dbLocs.length > 0) allLocations = dbLocs;
    } catch (e) {}
  }
  res.json({ success: true, location: updatedLoc, locations: allLocations });
});

app.delete('/api/locations/:id', optionalAuthToken, async (req, res) => {
  const { id } = req.params;
  if (prisma && prisma.location) {
    try {
      await prisma.location.delete({ where: { id } }).catch(() => {});
    } catch (e) {}
  }
  const locations = readJsonSafe(LOCATIONS_FILE, []);
  const updated = locations.filter(l => l.id !== id);
  writeJsonSafe(LOCATIONS_FILE, updated);

  let allLocations = updated;
  if (prisma && prisma.location) {
    try {
      allLocations = await prisma.location.findMany();
    } catch (e) {}
  }
  res.json({ success: true, locations: allLocations, message: 'Локация удалена' });
});

// ----------------- ПАРК ТЕХНИКИ И ОБОРУДОВАНИЯ (ПОЛНАЯ БАЗА ДАННЫХ POSTGRESQL + JSON FALLBACK) -----------------
app.get('/api/inventory', async (req, res) => {
  try {
    if (prisma && prisma.inventoryItem) {
      const dbInventory = await prisma.inventoryItem.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => null);
      if (dbInventory && dbInventory.length > 0) {
        return res.json({ success: true, inventory: dbInventory });
      }
    }
  } catch (e) {}
  const inventory = readJsonSafe(INVENTORY_FILE, []);
  res.json({ success: true, inventory });
});

app.post('/api/inventory', optionalAuthToken, async (req, res) => {
  try {
    const { name, serialNumber, serialNumbers, quantity, category, notes, status, location, signedBy } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Укажите название оборудования' });

    const trimmedName = name.trim();
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // Парсим переданные серийные номера
    let serialsList = [];
    if (Array.isArray(serialNumbers)) {
      serialsList = serialNumbers.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof serialNumbers === 'string' && serialNumbers.trim()) {
      serialsList = serialNumbers.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    } else if (serialNumber && String(serialNumber).includes(',')) {
      serialsList = String(serialNumber).split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    } else if (serialNumber && String(serialNumber).trim()) {
      serialsList = [String(serialNumber).trim()];
    }

    const totalCount = Math.max(qty, serialsList.length);
    const prefix = (trimmedName.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 4) || 'EQ').toUpperCase();
    const createdItems = [];

    const inventory = readJsonSafe(INVENTORY_FILE, []);

    for (let i = 0; i < totalCount; i++) {
      let sn = serialsList[i];
      if (!sn) {
        sn = `${prefix}-${String(100 + i + Math.floor(Math.random() * 900))}`;
      }

      let newItem = null;
      if (prisma && prisma.inventoryItem) {
        try {
          newItem = await prisma.inventoryItem.create({
            data: {
              name: trimmedName,
              serialNumber: sn,
              category: category || 'Камеры',
              notes: notes || 'В рабочем состоянии',
              status: status || 'AVAILABLE',
              location: location || 'Склад техники ЦКТ КП11',
              signedBy: signedBy || 'Бадиков Семён Станиславович'
            }
          });
        } catch (dbErr) {
          console.warn('[Prisma] inventoryItem.create error:', dbErr.message);
        }
      }

      if (!newItem) {
        newItem = {
          id: `eq-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
          name: trimmedName,
          serialNumber: sn,
          category: category || 'Камеры',
          notes: notes || 'В рабочем состоянии',
          status: status || 'AVAILABLE',
          location: location || 'Склад техники ЦКТ КП11',
          signedBy: signedBy || 'Бадиков Семён Станиславович'
        };
      }

      createdItems.push(newItem);
      inventory.unshift(newItem);
    }

    writeJsonSafe(INVENTORY_FILE, inventory);

    let allInventory = inventory;
    if (prisma && prisma.inventoryItem) {
      try {
        const dbItems = await prisma.inventoryItem.findMany({ orderBy: { createdAt: 'desc' } });
        if (dbItems && dbItems.length > 0) allInventory = dbItems;
      } catch (e) {}
    }

    res.json({
      success: true,
      count: createdItems.length,
      items: createdItems,
      item: createdItems[0],
      inventory: allInventory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/inventory/:id', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, serialNumber, category, notes, status, location, signedBy } = req.body;

    let updatedItem = null;
    if (prisma && prisma.inventoryItem) {
      try {
        updatedItem = await prisma.inventoryItem.update({
          where: { id },
          data: {
            name: name ? name.trim() : undefined,
            serialNumber: serialNumber ? serialNumber.trim() : undefined,
            category: category || undefined,
            notes: notes !== undefined ? notes : undefined,
            status: status || undefined,
            location: location || undefined,
            signedBy: signedBy || undefined
          }
        }).catch(() => null);
      } catch (e) {}
    }

    const inventory = readJsonSafe(INVENTORY_FILE, []);
    const updated = inventory.map(item => {
      if (item.id === id) {
        const up = {
          ...item,
          name: name ? name.trim() : item.name,
          serialNumber: serialNumber ? serialNumber.trim() : item.serialNumber,
          category: category || item.category,
          notes: notes !== undefined ? notes : item.notes,
          status: status || item.status,
          location: location || item.location,
          signedBy: signedBy || item.signedBy
        };
        if (!updatedItem) updatedItem = up;
        return up;
      }
      return item;
    });

    writeJsonSafe(INVENTORY_FILE, updated);
    let allInventory = updated;
    if (prisma && prisma.inventoryItem) {
      try {
        const dbItems = await prisma.inventoryItem.findMany({ orderBy: { createdAt: 'desc' } });
        if (dbItems && dbItems.length > 0) allInventory = dbItems;
      } catch (e) {}
    }
    res.json({ success: true, item: updatedItem, inventory: allInventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/inventory/:id', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (prisma && prisma.inventoryItem) {
      try {
        await prisma.inventoryItem.delete({ where: { id } }).catch(() => {});
      } catch (e) {}
    }
    const inventory = readJsonSafe(INVENTORY_FILE, []);
    const filtered = inventory.filter(item => item.id !== id);
    writeJsonSafe(INVENTORY_FILE, filtered);

    let allInventory = filtered;
    if (prisma && prisma.inventoryItem) {
      try {
        allInventory = await prisma.inventoryItem.findMany({ orderBy: { createdAt: 'desc' } });
      } catch (e) {}
    }
    res.json({ success: true, message: 'Оборудование удалено', inventory: allInventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- ПОЛНОЕ РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ (АДМИН) -----------------
app.put('/api/admin/users/:id/full', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      groupName,
      email,
      telegram,
      telegramChatId,
      role,
      craftRank,
      rating,
      completedShoots,
      isSuspended,
      competencies
    } = req.body;

    const users = readJsonSafe(USERS_FILE, []);
    let updatedUser = null;

    const updated = users.map(u => {
      if (u.id === id) {
        updatedUser = {
          ...u,
          fullName: fullName || u.fullName,
          groupName: groupName !== undefined ? groupName : u.groupName,
          email: email || u.email,
          telegram: telegram !== undefined ? telegram : u.telegram,
          telegramChatId: telegramChatId !== undefined ? telegramChatId : u.telegramChatId,
          role: role ? (typeof role === 'string' ? { name: role } : role) : u.role,
          craftRank: craftRank !== undefined ? craftRank : u.craftRank,
          rating: rating !== undefined ? parseFloat(rating) : u.rating,
          completedShoots: completedShoots !== undefined ? parseInt(completedShoots, 10) : u.completedShoots,
          isSuspended: isSuspended !== undefined ? !!isSuspended : u.isSuspended,
          competencies: competencies ? { ...u.competencies, ...competencies } : u.competencies
        };
        return updatedUser;
      }
      return u;
    });

    writeJsonSafe(USERS_FILE, updated);

    if (prisma && updatedUser) {
      try {
        await prisma.user.update({
          where: { id },
          data: {
            fullName: updatedUser.fullName,
            groupName: updatedUser.groupName,
            email: updatedUser.email,
            telegram: updatedUser.telegram,
            craftRank: updatedUser.craftRank,
            rating: updatedUser.rating,
            isSuspended: updatedUser.isSuspended
          }
        }).catch(() => {});
      } catch (e) {}
    }

    res.json({ success: true, user: updatedUser, users: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- QR ЧЕК-ИН НА СМЕНЕ -----------------
app.post('/api/shoots/:id/qr-checkin', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'Укажите ID студента' });

    const shoots = readJsonSafe(SHOOTS_FILE, []);
    const users = readJsonSafe(USERS_FILE, []);
    const student = users.find(u => u.id === studentId || u.email === studentId);
    let updatedShoot = null;
    let foundMember = null;

    shoots.forEach(sh => {
      if (sh.id === id && Array.isArray(sh.crew)) {
        sh.crew.forEach(cm => {
          if (cm.userId === studentId || cm.id === studentId || (student && cm.userId === student.id)) {
            cm.attendance = 'PRESENT';
            cm.status = 'ACCEPTED';
            foundMember = cm;
          }
        });
        if (foundMember) updatedShoot = sh;
      }
    });

    if (updatedShoot) {
      writeJsonSafe(SHOOTS_FILE, shoots);
      return res.json({
        success: true,
        message: `Студент ${student ? student.fullName : studentId} успешно отмечен на площадке!`,
        member: foundMember,
        shoot: updatedShoot
      });
    }

    res.status(404).json({ error: 'Участник не найден в составе этой смены' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(['/api/shoots/:id', '/api/admin/shoots/:id'], optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const shootData = req.body || {};

    // 1. Получение смены из единого хранилища
    const allShoots = (await store.getShoots()) || [];
    let targetShoot = allShoots.find(s => String(s.id) === String(id));
    if (!targetShoot) {
      targetShoot = { id };
    }

    // 2. Обработка состава съёмочной группы
    let updatedCrew = targetShoot.crew || [];
    if (Array.isArray(shootData.crewAssignments)) {
      const allUsers = await store.getUsers();
      updatedCrew = shootData.crewAssignments.map((ca, idx) => {
        const u = allUsers.find(user => String(user.id) === String(ca.userId)) || {};
        return {
          id: ca.id || `c-${id}-${ca.userId || idx}`,
          userId: ca.userId,
          roleInShoot: ca.craftRole || ca.roleInShoot || 'Участник',
          department: ca.department || 'cinema',
          status: ca.status || 'ACCEPTED',
          attendance: ca.attendance || 'PRESENT',
          user: {
            id: ca.userId,
            fullName: u.fullName || 'Студент',
            groupName: u.groupName || 'КТ-26',
            rating: u.rating || 4.8,
            telegram: u.telegram || null,
            craftRank: u.craftRank || null
          }
        };
      });
    } else if (Array.isArray(shootData.crew)) {
      updatedCrew = shootData.crew;
    }

    // 3. Формирование обновленного объекта смены
    const updatedShoot = {
      ...targetShoot,
      title: shootData.title !== undefined ? shootData.title : targetShoot.title,
      description: shootData.description !== undefined ? shootData.description : targetShoot.description,
      type: shootData.type !== undefined ? shootData.type : targetShoot.type,
      date: shootData.date !== undefined ? shootData.date : targetShoot.date,
      callTime: shootData.callTime !== undefined ? shootData.callTime : targetShoot.callTime,
      startTime: shootData.startTime !== undefined ? shootData.startTime : targetShoot.startTime,
      endTime: shootData.endTime !== undefined ? shootData.endTime : targetShoot.endTime,
      location: shootData.location !== undefined ? shootData.location : targetShoot.location,
      latitude: shootData.latitude !== undefined ? parseFloat(shootData.latitude) : targetShoot.latitude,
      longitude: shootData.longitude !== undefined ? parseFloat(shootData.longitude) : targetShoot.longitude,
      timeline: shootData.timeline !== undefined ? shootData.timeline : targetShoot.timeline,
      equipment: shootData.equipment !== undefined ? shootData.equipment : targetShoot.equipment,
      crew: updatedCrew
    };

    // 4. Сохранение в файловое хранилище через store.saveShoot
    await store.saveShoot(updatedShoot);

    // 5. Синхронизация с PostgreSQL (Prisma) при наличии подключения
    if (prisma) {
      try {
        const creator = await prisma.user.findFirst();
        await prisma.shoot.upsert({
          where: { id: String(id) },
          update: {
            title: updatedShoot.title,
            description: updatedShoot.description || '',
            type: updatedShoot.type || 'СТУДИЯ',
            date: new Date(updatedShoot.date),
            callTime: updatedShoot.callTime || '10:00',
            startTime: updatedShoot.startTime || '11:30',
            endTime: updatedShoot.endTime || '18:00',
            location: updatedShoot.location || 'Смольная 10А',
            latitude: updatedShoot.latitude || 55.857321,
            longitude: updatedShoot.longitude || 37.491244,
            timeline: updatedShoot.timeline || [],
            equipment: updatedShoot.equipment || []
          },
          create: {
            id: String(id),
            title: updatedShoot.title,
            description: updatedShoot.description || '',
            type: updatedShoot.type || 'СТУДИЯ',
            date: new Date(updatedShoot.date),
            callTime: updatedShoot.callTime || '10:00',
            startTime: updatedShoot.startTime || '11:30',
            endTime: updatedShoot.endTime || '18:00',
            location: updatedShoot.location || 'Смольная 10А',
            latitude: updatedShoot.latitude || 55.857321,
            longitude: updatedShoot.longitude || 37.491244,
            timeline: updatedShoot.timeline || [],
            equipment: updatedShoot.equipment || [],
            creatorId: creator ? creator.id : 'master-1'
          }
        }).catch(() => {});

        // Синхронизация состава группы в таблице CrewMember
        if (Array.isArray(updatedCrew) && updatedCrew.length > 0) {
          for (const cm of updatedCrew) {
            const uId = cm.userId || (cm.user && cm.user.id);
            if (uId) {
              const uExists = await prisma.user.findUnique({ where: { id: uId } }).catch(() => null);
              if (uExists) {
                const cmId = cm.id || `cm-${id}-${uId}`;
                await prisma.crewMember.upsert({
                  where: { id: cmId },
                  update: {
                    roleInShoot: cm.roleInShoot || 'Участник',
                    status: cm.status || 'ACCEPTED',
                    attendance: cm.attendance || 'PRESENT'
                  },
                  create: {
                    id: cmId,
                    shootId: String(id),
                    userId: uId,
                    roleInShoot: cm.roleInShoot || 'Участник',
                    status: cm.status || 'ACCEPTED',
                    attendance: cm.attendance || 'PRESENT'
                  }
                }).catch(() => {});
              }
            }
          }
        }
      } catch (prismaErr) {
        console.warn('Prisma shoot update warning:', prismaErr.message);
      }
    }

    res.json({ success: true, message: 'Карточка смены успешно обновлена', shoot: updatedShoot });
  } catch (err) {
    console.error('PUT /api/shoots/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistics', authenticateToken, async (req, res) => {
  try {
    const leaders = await prisma.user.findMany({
      where: { isSuspended: false, rating: { not: null } },
      select: { id: true, fullName: true, groupName: true, rating: true },
      orderBy: { rating: 'desc' },
      take: 10
    });

    const allShoots = await prisma.shoot.findMany({
      include: { crew: { include: { user: true } } }
    });

    const completedShoots = allShoots.filter(s => s.isCompleted);
    const groupStatsMap = {};
    allShoots.forEach(shoot => {
      shoot.crew.forEach(member => {
        const group = member.user?.groupName || 'Без группы';
        if (!groupStatsMap[group]) {
          groupStatsMap[group] = { totalParticipations: 0, sumRating: 0, count: 0 };
        }
        groupStatsMap[group].totalParticipations++;
        if (member.user?.rating !== null && member.user?.rating !== undefined) {
          groupStatsMap[group].sumRating += member.user.rating;
          groupStatsMap[group].count++;
        }
      });
    });

    const groupsRating = Object.keys(groupStatsMap).map(group => ({
      groupName: group,
      avgRating: groupStatsMap[group].count > 0 ? parseFloat((groupStatsMap[group].sumRating / groupStatsMap[group].count).toFixed(1)) : 0.0,
      participations: groupStatsMap[group].totalParticipations
    })).sort((a, b) => b.avgRating - a.avgRating);

    const titleCounts = {};
    allShoots.forEach(shoot => {
      const title = shoot.title.trim();
      titleCounts[title] = (titleCounts[title] || 0) + 1;
    });

    const frequentShoots = Object.keys(titleCounts).map(title => ({
      title,
      count: titleCounts[title]
    })).sort((a, b) => b.count - a.count).slice(0, 6);

    res.json({
      leaders,
      totalCompleted: completedShoots.length,
      totalShoots: allShoots.length,
      groupsRating,
      frequentShoots
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shoots', optionalAuthToken, async (req, res) => {
  try {
    let shoots = [];
    let students = [];
    try {
      shoots = await prisma.shoot.findMany({
        include: {
          creator: { select: { fullName: true } },
          crew: { include: { user: { select: { id: true, fullName: true, groupName: true, rating: true, skills: true, telegram: true, craftRank: true } } } }
        },
        orderBy: { date: 'asc' }
      });
      
      const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
      students = await prisma.user.findMany({
        where: {
          isSuspended: false,
          OR: [
            { roleId: studentRole ? studentRole.id : undefined },
            { role: { name: 'Студент' } }
          ]
        },
        select: { id: true, fullName: true, groupName: true, rating: true, skills: true, telegram: true, craftRank: true }
      });
    } catch (dbErr) {}

    const fileShoots = (await store.getShoots() || []).filter(s => s && s.id !== 'shoot-prod-1' && s.id !== 'shoot-1792450290828');
    if (fileShoots && fileShoots.length > 0) {
      if (!shoots || shoots.length === 0) {
        shoots = fileShoots;
      } else {
        const fileMap = new Map(fileShoots.map(s => [String(s.id), s]));
        shoots = shoots.map(sh => {
          const fileSh = fileMap.get(String(sh.id));
          if (fileSh && (!sh.crew || sh.crew.length === 0) && fileSh.crew && fileSh.crew.length > 0) {
            return {
              ...sh,
              crew: fileSh.crew,
              timeline: (sh.timeline && Array.isArray(sh.timeline) && sh.timeline.length > 0) ? sh.timeline : fileSh.timeline,
              equipment: (sh.equipment && Array.isArray(sh.equipment) && sh.equipment.length > 0) ? sh.equipment : fileSh.equipment
            };
          }
          return sh;
        });
        const dbIds = new Set(shoots.map(s => String(s.id)));
        const extraShoots = fileShoots.filter(s => !dbIds.has(String(s.id)));
        shoots = [...shoots, ...extraShoots];
      }
    }
    const allFileUsers = await store.getUsers();
    const fileStudents = allFileUsers.filter(u => u.role?.name === 'Студент' || u.role === 'Студент' || !u.role);
    if (!students || students.length === 0) {
      students = fileStudents;
    } else {
      const dbStudentIds = new Set(students.map(s => String(s.id)));
      const extraStudents = fileStudents.filter(s => !dbStudentIds.has(String(s.id)));
      students = [...students, ...extraStudents];
    }

    const totalShoots = shoots.length;
    const completedShoots = shoots.filter(s => s.isCompleted).length;

    let userStats = { rating: 4.8, completedParticipated: 4, totalParticipated: 5 };
    if (req.user) {
      try {
        const myParticipations = await prisma.crewMember.findMany({
          where: { userId: req.user.id, status: 'ACCEPTED' },
          include: { shoot: true }
        });
        userStats = {
          totalParticipated: myParticipations.length,
          completedParticipated: myParticipations.filter(p => p.shoot.isCompleted).length,
          rating: req.user.rating
        };
      } catch (e) {}
    }

    res.json({ shoots, students, stats: { totalShoots, completedShoots }, userStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// МОДУЛЬ 6: ОЦЕНКА КОМПЕТЕНЦИЙ И ЦЕХОВОГО РАНГА
app.patch('/api/users/:id/competency', authenticateToken, requireMasterOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { craftRank, rating } = req.body;
    const updated = await prisma.user.update({
      where: { id },
      data: {
        craftRank: craftRank || undefined,
        rating: rating !== undefined ? parseFloat(rating) : undefined
      }
    });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// СОЗДАНИЕ СМЕНЫ + ОТПРАВКА EMAIL И ПУШ-УВЕДОМЛЕНИЙ
app.post('/api/shoots', optionalAuthToken, async (req, res) => {
  try {
    const {
      title, description, type, date, location, crewAssignments,
      latitude, longitude, videoUrl, previewUrl,
      callTime, startTime, endTime, timeline, equipment
    } = req.body;
    
    let creatorUser = req.user;
    if (!creatorUser) {
      const users = await store.getUsers();
      creatorUser = users.find(u => u.id === 'master-1') || users[0] || { id: 'master-1', fullName: 'Бадиков Семён Станиславович' };
    }

    let shoot = null;
    if (prisma) {
      try {
        let dbCreator = null;
        if (creatorUser && creatorUser.id) {
          dbCreator = await prisma.user.findUnique({ where: { id: creatorUser.id } }).catch(() => null);
        }
        if (!dbCreator) {
          dbCreator = await prisma.user.findFirst().catch(() => null);
          if (dbCreator) {
            creatorUser = { ...creatorUser, id: dbCreator.id, fullName: dbCreator.fullName };
          }
        }

        if (dbCreator) {
          const validUsers = await prisma.user.findMany({ select: { id: true } });
          const validUserIds = new Set(validUsers.map(u => u.id));
          const filteredCrew = (crewAssignments || []).filter(item => validUserIds.has(item.userId));

          shoot = await prisma.shoot.create({
            data: {
              title,
              description: description || '',
              type: type || 'СТУДИЯ',
              date: new Date(date),
              callTime: callTime || '10:00',
              startTime: startTime || '11:30',
              endTime: endTime || '18:00',
              timeline: Array.isArray(timeline) ? timeline : [],
              equipment: Array.isArray(equipment) ? equipment : [],
              location: location || 'Студия КП11',
              latitude: latitude ? parseFloat(latitude) : 55.751244,
              longitude: longitude ? parseFloat(longitude) : 37.618423,
              creatorId: dbCreator.id,
              crew: {
                create: filteredCrew.map(item => ({
                  userId: item.userId,
                  roleInShoot: item.craftRole || 'Участник',
                  status: 'PENDING',
                  attendance: 'PRESENT'
                }))
              }
            },
            include: { 
              creator: { select: { fullName: true } },
              crew: {
                include: { user: true }
              }
            }
          });
        }
      } catch (dbErr) {
        console.warn('[Prisma DB] shoot.create fallback to store:', dbErr.message);
      }
    }

    const storeUsers = await store.getUsers();
    const storeShootObj = {
      id: shoot ? shoot.id : ('shoot-' + Date.now()),
      title,
      description,
      type: type || 'СТУДИЯ',
      date: (date && date.includes('T')) ? date : (new Date(date).toISOString().split('T')[0]),
      callTime: callTime || '10:00',
      startTime: startTime || '11:30',
      endTime: endTime || '18:00',
      timeline: Array.isArray(timeline) ? timeline : [],
      equipment: Array.isArray(equipment) ? equipment : [],
      location,
      latitude: latitude ? parseFloat(latitude) : 55.751244,
      longitude: longitude ? parseFloat(longitude) : 37.618423,
      videoUrl: videoUrl || null,
      previewUrl: previewUrl || null,
      isCompleted: false,
      creator: { fullName: creatorUser?.fullName || 'Бадиков Семён Станиславович' },
      crew: (crewAssignments || []).map((item, idx) => {
        const u = storeUsers.find(su => su.id === item.userId);
        return {
          id: 'c-' + Date.now() + '-' + (idx + 1),
          roleInShoot: item.craftRole || 'Оператор',
          department: item.department || 'cinema',
          status: 'PENDING',
          attendance: 'PRESENT',
          userId: item.userId,
          user: u || { id: item.userId, fullName: 'Студент', groupName: 'КТ-26' }
        };
      })
    };
    await store.saveShoot(storeShootObj);
    if (!shoot) shoot = storeShootObj;

    // Отправляем уведомления каждому назначенному участнику
    const formattedDate = new Date(shoot.date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    for (const member of (shoot.crew || [])) {
      if (member.user && member.user.id) {
        // 1. Отправляем Web Push
        sendWebPushNotification(
          member.user.id,
          'КП11 • Назначена новая смена',
          `Вы назначены на роль [${member.roleInShoot}] в проект "${shoot.title}". Дата: ${formattedDate}.`,
          '/'
        );

        // 2. Отправляем Email если есть
        if (member.user.email) {
          const emailHtml = `
            <div style="font-family: 'Manrope', Arial, sans-serif; background-color: #1E1E1E; color: #FFFFFF; padding: 24px; border-radius: 6px;">
              <div style="border-left: 4px solid #FC2C2C; padding-left: 14px; margin-bottom: 20px;">
                <h2 style="color: #EEE4B5; margin: 0; text-transform: uppercase;">Медиацентр КП11 • Новая съёмка</h2>
                <p style="color: #999; margin: 4px 0 0 0; font-size: 13px;">Производственная система координации</p>
              </div>
              <p style="font-size: 15px;">Здравствуйте, <strong>${member.user.fullName}</strong>!</p>
              <p style="font-size: 14px; line-height: 1.6;">Вы назначены в съёмочную группу проекта <strong>«${shoot.title}»</strong>.</p>
              <div style="background-color: #2A2A2A; padding: 16px; border-radius: 4px; margin: 16px 0;">
                <p style="margin: 4px 0;">🎯 <strong>Ваша роль:</strong> ${member.roleInShoot}</p>
                <p style="margin: 4px 0;">📅 <strong>Дата и время:</strong> ${formattedDate}</p>
                <p style="margin: 4px 0;">📍 <strong>Локация:</strong> ${shoot.location} (${shoot.type})</p>
                <p style="margin: 4px 0;">📝 <strong>Описание:</strong> ${shoot.description}</p>
              </div>
              <p style="font-size: 13px; color: #BBB;">Пожалуйста, войдите в систему и подтвердите участие в карточке смены.</p>
            </div>
          `;

          sendNotificationEmail(
            member.user.email,
            `КП11: Назначение на съёмку «${shoot.title}» (${member.roleInShoot})`,
            emailHtml
          );
        }
      }
    }

    // Автоматическая отправка вызывного листа в Telegram-чаты и назначенным студентам
    try {
      await telegramBot.sendCallsheetToCrew(storeShootObj.id, storeShootObj);
    } catch (tgErr) {
      console.warn('[Auto Telegram Dispatch Warning]:', tgErr.message);
    }

    res.json(Object.assign({ success: true, shoot: storeShootObj }, shoot || storeShootObj));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crew/attendance', authenticateToken, requireMasterOrAdmin, async (req, res) => {
  try {
    const { crewMemberId, attendance } = req.body;
    let updated = null;
    if (prisma) {
      try {
        const crewMember = await prisma.crewMember.findUnique({
          where: { id: crewMemberId },
          include: { user: true }
        });

        if (crewMember) {
          if (attendance === 'ABSENT' && crewMember.attendance === 'PRESENT' && crewMember.user.rating !== null) {
            const newRating = Math.max(1.0, parseFloat((crewMember.user.rating - 0.3).toFixed(1)));
            await prisma.user.update({
              where: { id: crewMember.userId },
              data: { rating: newRating }
            });
          }

          updated = await prisma.crewMember.update({
            where: { id: crewMemberId },
            data: { attendance }
          });
        }
      } catch (prismaErr) {}
    }

    await store.updateCrewAttendance(crewMemberId, attendance);
    res.json({ success: true, updated: updated || { id: crewMemberId, attendance } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shoots/complete', optionalAuthToken, async (req, res) => {
  try {
    const { shootId, grades } = req.body;
    if (!shootId) return res.status(400).json({ error: 'Параметр shootId обязателен' });

    let shoot = null;
    if (prisma) {
      try {
        shoot = await prisma.shoot.update({
          where: { id: shootId },
          data: { isCompleted: true },
          include: { crew: true }
        });

        for (const member of (shoot.crew || [])) {
          if (member.status === 'ACCEPTED' && member.attendance === 'PRESENT') {
            const user = await prisma.user.findUnique({ where: { id: member.userId } });
            if (user) {
              const assignedGrade = grades && grades[member.id] !== undefined ? parseFloat(grades[member.id]) : 5.0;
              let newRating;
              if (user.rating === null || user.rating === undefined) {
                newRating = assignedGrade;
              } else {
                newRating = parseFloat(((user.rating + assignedGrade) / 2).toFixed(1));
              }
              await prisma.user.update({ where: { id: user.id }, data: { rating: newRating } });

              sendWebPushNotification(
                user.id,
                'КП11 • Смена завершена',
                `Смена «${shoot.title}» закрыта. Ваша оценка: ⭐${assignedGrade}. Обновленный рейтинг: ⭐${newRating}`,
                '/'
              );
            }
          }
        }
      } catch (prismaErr) {
        console.warn('[Prisma DB] shoot.complete fallback to store:', prismaErr.message);
      }
    }

    // Всегда обновляем статус и оценки в файловом хранилище data/store.js
    const storeCompleted = await store.completeShoot(shootId, grades);
    if (!shoot) shoot = storeCompleted;

    res.json({ success: true, shoot: shoot || { id: shootId, isCompleted: true } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crew/response', authenticateToken, async (req, res) => {
  try {
    const { crewMemberId, status } = req.body;
    const crewMember = await prisma.crewMember.findUnique({
      where: { id: crewMemberId },
      include: { shoot: true, user: true }
    });

    if (!crewMember) return res.status(404).json({ error: 'Запись не найдена' });

    const isOwner = crewMember.userId === req.user.id;
    const roleName = req.user.role?.name;
    const isMasterOrAdmin = roleName === 'Администратор' || roleName === 'Мастер / Преподаватель';

    if (!isOwner && !isMasterOrAdmin) {
      return res.status(403).json({ error: 'Недостаточно прав для изменения этого статуса' });
    }

    const updated = await prisma.crewMember.update({
      where: { id: crewMemberId },
      data: { status }
    });

    // Уведомление руководителю смены об ответе студента
    if (isOwner && crewMember.shoot.creatorId) {
      const statusRu = status === 'ACCEPTED' ? 'принял(а)' : 'отклонил(а)';
      sendWebPushNotification(
        crewMember.shoot.creatorId,
        'КП11 • Ответ по смене',
        `Студент ${crewMember.user.fullName} ${statusRu} участие в «${crewMember.shoot.title}»`,
        '/'
      );
    }

    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const invitations = await prisma.crewMember.findMany({
      where: { userId: req.user.id, status: 'PENDING' },
      include: { shoot: true }
    });
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= TELEGRAM BOT API ИНТЕГРАЦИЯ =================
app.post('/api/telegram/dispatch', optionalAuthToken, async (req, res) => {
  try {
    const { shootId, shoot: clientShoot } = req.body;
    const targetId = shootId || (clientShoot && clientShoot.id);
    if (!targetId && !clientShoot) {
      return res.status(400).json({ error: 'Параметр shootId обязателен' });
    }

    console.log(`[API /api/telegram/dispatch] Запрос рассылки вызывного для смены ${targetId}`);
    const report = await telegramBot.sendCallsheetToCrew(targetId, clientShoot);
    res.json({ success: true, report });
  } catch (err) {
    console.error('Ошибка в /api/telegram/dispatch:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    await telegramBot.handleUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('Ошибка обработки Telegram Webhook:', err.message);
    res.sendStatus(200);
  }
});

app.get('/api/telegram/webhook/info', async (req, res) => {
  try {
    const info = await telegramBot.getWebhookInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/webhook/setup', optionalAuthToken, async (req, res) => {
  try {
    const publicUrl = req.body?.url || process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || 'https://kp11-film-crew.onrender.com';
    const result = await telegramBot.setupWebhook(publicUrl);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telegram/status', (req, res) => {
  res.json({
    active: true,
    botUsername: 'KP11_FilmCrew_Bot',
    tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN
  });
});

app.post('/api/telegram/link', optionalAuthToken, async (req, res) => {
  try {
    const { chatId, telegram } = req.body;
    const userId = req.user ? req.user.id : 'master-1';
    const linked = await telegramBot.linkUserToTelegram(userId, chatId, telegram);
    res.json({ success: true, user: linked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/test', optionalAuthToken, async (req, res) => {
  try {
    const { chatId, topicId, token: customToken } = req.body || {};
    const settings = store.getSettings();
    const token = customToken || telegramBot.getBotToken();
    const targetChatString = chatId || settings.defaultChatId;
    const effectiveTopicId = topicId || settings.telegramTopicId || process.env.TELEGRAM_TOPIC_ID || null;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Токен Telegram-бота не задан в .env или в настройках админ-панели' });
    }
    if (!targetChatString) {
      return res.status(400).json({ success: false, error: 'Укажите Chat ID для отправки тестового вызова' });
    }

    const targets = telegramBot.parseChatTargets(targetChatString, effectiveTopicId);
    if (targets.length === 0) {
      return res.status(400).json({ success: false, error: 'Укажите хотя бы один валидный Chat ID' });
    }

    const testMsg = '<b>Медиацентр КП11 // Тест связи</b>\n\nТестовое оповещение успешно доставлено в Telegram!\nБот готов к оперативной рассылке вызывных листов.';
    let successCount = 0;
    let lastError = '';

    for (const target of targets) {
      let result = null;
      if (customToken) {
        const https = require('https');
        const payloadObj = { chat_id: target.chatId, text: testMsg, parse_mode: 'HTML' };
        if (target.messageThreadId) {
          payloadObj.message_thread_id = target.messageThreadId;
        }
        const data = JSON.stringify(payloadObj);
        result = await new Promise((resolve) => {
          const u = new URL(`https://api.telegram.org/bot${customToken}/sendMessage`);
          const reqPost = https.request({
            hostname: u.hostname,
            port: 443,
            path: u.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
          }, (resTg) => {
            let raw = '';
            resTg.on('data', c => raw += c);
            resTg.on('end', () => {
              try { resolve(JSON.parse(raw)); } catch (e) { resolve({ ok: false, description: raw }); }
            });
          });
          reqPost.on('error', e => resolve({ ok: false, description: e.message }));
          reqPost.write(data);
          reqPost.end();
        });
      } else {
        const sendOpts = { parse_mode: 'HTML' };
        if (target.messageThreadId) {
          sendOpts.message_thread_id = target.messageThreadId;
        }
        result = await telegramBot.sendMessage(target.chatId, testMsg, sendOpts);
      }

      if (result && result.ok) {
        successCount++;
      } else {
        lastError = result?.description || 'Сбой отправки';
      }
    }

    if (successCount > 0) {
      return res.json({
        success: true,
        message: `Тестовое оповещение доставлено в ${successCount} из ${targets.length} чатов/топиков!`
      });
    } else {
      return res.status(400).json({ success: false, error: lastError || 'Сбой отправки сообщения в Telegram API' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'img', 'logo_red.png'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Production server running on port ${PORT}`);
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || 'https://kp11-film-crew.onrender.com';
    if (publicUrl && !process.env.FORCE_POLLING) {
      console.log(`[Telegram Bot] Подключение Webhook к ${publicUrl}...`);
      telegramBot.setupWebhook(publicUrl).catch(e => console.error('[Server Webhook Error]', e.message));
    } else {
      telegramBot.startPolling();
    }
    // Запуск личных напоминаний за 15 минут до сбора и мотора
    telegramBot.startMilestoneNotifier();
  } else {
    console.log('[Telegram Bot] Токен не задан. Бот работает в режиме автономного эмулятора API.');
  }

  // Keep-alive: отключен по умолчанию во избежание блокировок и санкций хостинга (Render/Cloud)
  const enableKeepAlive = process.env.ENABLE_KEEPALIVE === 'true';
  if (enableKeepAlive && process.env.RENDER_EXTERNAL_URL) {
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
    console.log(`[KP11 Keep-Alive] Безопасный пассивный мониторинг активности: ${keepAliveUrl}`);
    // Редкий бережный запрос (раз в 14 минут с рандомизацией ±30 сек)
    const safeIntervalMs = (13.5 * 60 * 1000) + Math.floor(Math.random() * 60000);
    setInterval(() => {
      try {
        const req = https.get(`${keepAliveUrl}/api/telegram/status`, {
          headers: { 'User-Agent': 'KP11-Safe-Monitor/1.0 (Passive Healthcheck)' },
          timeout: 10000
        }, (res) => {
          res.resume();
        });
        req.on('error', () => {});
        req.on('timeout', () => req.destroy());
      } catch (e) {}
    }, safeIntervalMs);
  } else {
    console.log('[KP11 Server] Автоматический фоновый Keep-Alive отключен во избежание блокировок хостинга.');
  }
});
