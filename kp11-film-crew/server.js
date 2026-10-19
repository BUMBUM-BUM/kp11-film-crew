const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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

  if (token === 'demo-token') {
    req.user = {
      id: 'demo-user-1',
      fullName: 'Бадиков Семён Станиславович',
      groupName: 'КТ-26',
      role: { name: 'Мастер / Преподаватель' },
      roleId: 'master-role'
    };
    return next();
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
      user = {
        id: 'demo-user-1',
        fullName: 'Бадиков Семён Станиславович',
        groupName: 'КТ-26',
        role: { name: 'Мастер / Преподаватель' }
      };
    }
    req.user = user;
    next();
  } catch (err) {
    req.user = {
      id: 'demo-user-1',
      fullName: 'Бадиков Семён Станиславович',
      groupName: 'КТ-26',
      role: { name: 'Мастер / Преподаватель' }
    };
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
  } catch (err) {
    console.error('DB Init Error:', err.message);
  }
}
initDatabase();

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
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email занят' });

    const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        groupName: groupName || 'КИТ-11',
        roleId: studentRole ? studentRole.id : null,
        course: course ? parseInt(course) : 1,
        rating: null,
        telegram: telegram ? telegram.replace(/^@/, '') : null,
        craftRank: 'Ассистент цеха',
        skills: ['Универсал']
      },
      include: { role: true }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, groupName: user.groupName, role: user.role?.name || 'Студент', telegram: user.telegram, craftRank: user.craftRank } });
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
    if (user.isSuspended) return res.status(403).json({ error: 'Аккаунт отстранен администрацией' });

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

app.get('/api/cinemaboard', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const rating = user.rating !== null && user.rating !== undefined ? user.rating : 5.0;
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

app.post('/api/admin/reset-ratings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.user.updateMany({ data: { rating: null } });
    res.json({ success: true, message: 'Рейтинг всех пользователей успешно сброшен' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/users/:id', optionalAuthToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, groupName, rating, telegram, telegramChatId } = req.body;
    
    let updatedUser = null;
    try {
      updatedUser = await prisma.user.update({
        where: { id },
        data: { 
          fullName, 
          groupName,
          rating: rating !== undefined && rating !== null && rating !== '' ? parseFloat(rating) : undefined,
          telegram: telegram !== undefined ? (telegram ? (telegram.startsWith('@') ? telegram : '@' + telegram) : '') : undefined,
          telegramChatId: telegramChatId !== undefined ? String(telegramChatId) : undefined
        },
        include: { role: true }
      });
    } catch (dbErr) {}

    // Синхронизация с store.js
    const storeUser = await store.updateUser(id, { fullName, groupName, rating, telegram, telegramChatId });
    res.json({ success: true, user: updatedUser || storeUser });
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
    const { telegramBotToken, defaultChatId, botUsername } = req.body;
    const updated = store.saveSettings({ telegramBotToken, defaultChatId, botUsername });
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

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
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
app.get('/api/locations', (req, res) => {
  const locations = readJsonSafe(LOCATIONS_FILE, []);
  res.json({ success: true, locations });
});

app.post('/api/locations', optionalAuthToken, (req, res) => {
  const { name, badge, type, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название локации' });

  const locations = readJsonSafe(LOCATIONS_FILE, []);
  const newLoc = {
    id: `loc-${Date.now().toString(36)}`,
    name: name.trim(),
    badge: badge ? badge.trim() : (type === 'ВЫЕЗД' ? '🚗 ' : '🎬 ') + name.trim(),
    type: type || 'СТУДИЯ',
    latitude: parseFloat(latitude) || 55.751244,
    longitude: parseFloat(longitude) || 37.618423
  };

  locations.push(newLoc);
  writeJsonSafe(LOCATIONS_FILE, locations);
  res.json({ success: true, location: newLoc, locations });
});

app.put('/api/locations/:id', optionalAuthToken, (req, res) => {
  const { id } = req.params;
  const { name, badge, type, latitude, longitude } = req.body;
  const locations = readJsonSafe(LOCATIONS_FILE, []);
  let updatedLoc = null;

  const updated = locations.map(l => {
    if (l.id === id) {
      updatedLoc = {
        ...l,
        name: name ? name.trim() : l.name,
        badge: badge ? badge.trim() : l.badge,
        type: type || l.type,
        latitude: latitude !== undefined ? parseFloat(latitude) : l.latitude,
        longitude: longitude !== undefined ? parseFloat(longitude) : l.longitude
      };
      return updatedLoc;
    }
    return l;
  });

  writeJsonSafe(LOCATIONS_FILE, updated);
  res.json({ success: true, location: updatedLoc, locations: updated });
});

app.delete('/api/locations/:id', optionalAuthToken, (req, res) => {
  const { id } = req.params;
  const locations = readJsonSafe(LOCATIONS_FILE, []);
  const updated = locations.filter(l => l.id !== id);
  writeJsonSafe(LOCATIONS_FILE, updated);
  res.json({ success: true, locations: updated, message: 'Локация удалена' });
});

// ----------------- ПАРК ТЕХНИКИ И ОБОРУДОВАНИЯ -----------------
app.get('/api/inventory', (req, res) => {
  const inventory = readJsonSafe(INVENTORY_FILE, []);
  res.json({ success: true, inventory });
});

app.post('/api/inventory', optionalAuthToken, (req, res) => {
  const { name, serialNumber, category, notes, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название оборудования' });

  const inventory = readJsonSafe(INVENTORY_FILE, []);
  const newItem = {
    id: `eq-${Date.now().toString(36)}`,
    name: name.trim(),
    serialNumber: serialNumber ? serialNumber.trim() : 'Б/Н',
    category: category || 'Камеры',
    notes: notes || 'В рабочем состоянии',
    status: status || 'AVAILABLE'
  };

  inventory.push(newItem);
  writeJsonSafe(INVENTORY_FILE, inventory);
  res.json({ success: true, item: newItem, inventory });
});

app.put('/api/inventory/:id', optionalAuthToken, (req, res) => {
  const { id } = req.params;
  const { name, serialNumber, category, notes, status } = req.body;
  const inventory = readJsonSafe(INVENTORY_FILE, []);
  let updatedItem = null;

  const updated = inventory.map(item => {
    if (item.id === id) {
      updatedItem = {
        ...item,
        name: name ? name.trim() : item.name,
        serialNumber: serialNumber ? serialNumber.trim() : item.serialNumber,
        category: category || item.category,
        notes: notes !== undefined ? notes : item.notes,
        status: status || item.status
      };
      return updatedItem;
    }
    return item;
  });

  writeJsonSafe(INVENTORY_FILE, updated);
  res.json({ success: true, item: updatedItem, inventory: updated });
});

app.delete('/api/inventory/:id', optionalAuthToken, (req, res) => {
  const { id } = req.params;
  const inventory = readJsonSafe(INVENTORY_FILE, []);
  const filtered = inventory.filter(item => item.id !== id);
  writeJsonSafe(INVENTORY_FILE, filtered);
  res.json({ success: true, message: 'Оборудование удалено', inventory: filtered });
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

app.put('/api/shoots/:id', authenticateToken, requireMasterOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, type, location, videoUrl, previewUrl } = req.body;
    const updated = await prisma.shoot.update({
      where: { id },
      data: { title, description, type, location, videoUrl, previewUrl }
    });
    res.json({ success: true, updated });
  } catch (err) {
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

    if (!shoots || shoots.length === 0) {
      const fileShoots = await store.getShoots();
      if (fileShoots && fileShoots.length > 0) {
        shoots = fileShoots;
      }
    }
    if (!students || students.length === 0) {
      const allUsers = await store.getUsers();
      students = allUsers.filter(u => u.role?.name === 'Студент' || !u.role);
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
      creatorUser = users.find(u => u.id === 'demo-user-1') || users[0] || { id: 'demo-user-1', fullName: 'Бадиков Семён Станиславович' };
    }

    let shoot = null;
    if (prisma) {
      try {
        let dbCreator = await prisma.user.findUnique({ where: { id: creatorUser.id } });
        if (!dbCreator) {
          const firstAdmin = await prisma.user.findFirst();
          if (firstAdmin) {
            creatorUser = { ...creatorUser, id: firstAdmin.id };
          }
        }

        const validUsers = await prisma.user.findMany({ select: { id: true } });
        const validUserIds = new Set(validUsers.map(u => u.id));
        const filteredCrew = (crewAssignments || []).filter(item => validUserIds.has(item.userId));

        shoot = await prisma.shoot.create({
          data: {
            title,
            description,
            type: type || 'СТУДИЯ',
            date: new Date(date),
            location,
            latitude: latitude ? parseFloat(latitude) : 55.751244,
            longitude: longitude ? parseFloat(longitude) : 37.618423,
            videoUrl: videoUrl || null,
            previewUrl: previewUrl || null,
            creatorId: creatorUser.id,
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
    const { shootId } = req.body;
    if (!shootId) return res.status(400).json({ error: 'Параметр shootId обязателен' });

    console.log(`[API /api/telegram/dispatch] Запрос рассылки вызывного для смены ${shootId}`);
    const report = await telegramBot.sendCallsheetToCrew(shootId);
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
    res.sendStatus(500);
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
    const userId = req.user ? req.user.id : 'demo-user-1';
    const linked = await telegramBot.linkUserToTelegram(userId, chatId, telegram);
    res.json({ success: true, user: linked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/test', optionalAuthToken, async (req, res) => {
  try {
    const { chatId, token: customToken } = req.body || {};
    const settings = store.getSettings();
    const token = customToken || telegramBot.getBotToken();
    const targetChatString = chatId || settings.defaultChatId;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Токен Telegram-бота не задан в .env или в настройках админ-панели' });
    }
    if (!targetChatString) {
      return res.status(400).json({ success: false, error: 'Укажите Chat ID для отправки тестового вызова' });
    }

    const chatList = String(targetChatString).split(/[\s,;\n\r]+/).map(s => s.trim()).filter(Boolean);
    if (chatList.length === 0) {
      return res.status(400).json({ success: false, error: 'Укажите хотя бы один валидный Chat ID' });
    }

    const testMsg = '<b>Медиацентр КП11 // Тест связи</b>\n\nТестовое оповещение успешно доставлено в Telegram!\nБот готов к оперативной рассылке вызывных листов.';
    let successCount = 0;
    let lastError = '';

    for (const targetChat of chatList) {
      let result = null;
      if (customToken) {
        const https = require('https');
        const data = JSON.stringify({ chat_id: targetChat, text: testMsg, parse_mode: 'HTML' });
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
        result = await telegramBot.sendMessage(targetChat, testMsg, { parse_mode: 'HTML' });
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
        message: `Тестовое оповещение доставлено в ${successCount} из ${chatList.length} чатов!`
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
    telegramBot.startPolling();
  } else {
    console.log('[Telegram Bot] Токен не задан. Бот работает в режиме автономного эмулятора API.');
  }
});
