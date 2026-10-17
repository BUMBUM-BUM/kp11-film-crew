const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'ckt_kp11_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware проверки авторизации
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена авторизации' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true }
    });
    if (!user) return res.status(403).json({ error: 'Пользователь не найден' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

// Инициализация базы: Роли, Админ и 10 тестовых студентов
async function initDatabase() {
  try {
    let studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    if (!studentRole) {
      studentRole = await prisma.role.create({ data: { name: 'Студент', description: 'Базовая роль для всех учащихся' } });
    }

    let teacherRole = await prisma.role.findUnique({ where: { name: 'Мастер / Преподаватель' } });
    if (!teacherRole) {
      teacherRole = await prisma.role.create({ data: { name: 'Мастер / Преподаватель', description: 'Управление съёмками' } });
    }

    let adminRole = await prisma.role.findUnique({ where: { name: 'Администратор' } });
    if (!adminRole) {
      adminRole = await prisma.role.create({ data: { name: 'Администратор', description: 'Полный доступ' } });
      
      const adminExists = await prisma.user.findUnique({ where: { email: 'admin@ckt.ru' } });
      if (!adminExists) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
          data: { email: 'admin@ckt.ru', passwordHash, fullName: 'Главный Администратор ЦКТ', roleId: adminRole.id }
        });
      }
    }

    // Создание 10 тестовых студентов, если их нет
    for (let i = 1; i <= 10; i++) {
      const email = `test-${i}@ckt.ru`;
      const exists = await prisma.user.findUnique({ where: { email } });
      if (!exists) {
        const passwordHash = await bcrypt.hash('123456', 10);
        const randomRating = parseFloat((3.5 + Math.random() * 1.5).toFixed(1)); // рейтинг от 3.5 до 5.0
        await prisma.user.create({
          data: {
            email,
            passwordHash,
            fullName: `Студент Тест-${i}`,
            roleId: studentRole.id,
            course: 2,
            rating: randomRating,
            skills: ['Оператор', 'Звукорежиссер', 'Осветитель'].slice(0, (i % 3) + 1)
          }
        });
      }
    }
    console.log('✅ База данных инициализирована (роли, админ и 10 тестовых студентов готовы)');
  } catch (err) {
    console.error('Ошибка инициализации БД:', err.message);
  }
}
initDatabase();

// === РЕГИСТРАЦИЯ ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, course, skills } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Пользователь уже существует' });

    const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        roleId: studentRole ? studentRole.id : null,
        course: course ? parseInt(course) : 1,
        rating: 5.0,
        skills: skills || ['Универсал']
      },
      include: { role: true }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role?.name || 'Студент' } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка регистрации: ' + err.message });
  }
});

// === ВХОД ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { role: true }
    });
    if (!user) return res.status(400).json({ error: 'Неверный email или пароль' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        fullName: user.fullName, 
        email: user.email, 
        role: user.role?.name || 'Без роли'
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка входа: ' + err.message });
  }
});

// === АДМИНКА: ДАННЫЕ ===
app.get('/api/admin/data', authenticateToken, async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    const users = await prisma.user.findMany({ 
      include: { role: true }, 
      select: { id: true, fullName: true, email: true, role: true, rating: true } 
    });
    res.json({ roles, users });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки админки: ' + err.message });
  }
});

// === АДМИНКА: СМЕНА РОЛИ ===
app.post('/api/admin/assign-role', authenticateToken, async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: true }
    });
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка назначения роли: ' + err.message });
  }
});

// === СЪЁМКИ: ПОЛУЧИТЬ ВСЕ И СТУДЕНТОВ ДЛЯ НАБОРА ===
app.get('/api/shoots', authenticateToken, async (req, res) => {
  try {
    const shoots = await prisma.shoot.findMany({
      include: {
        creator: { select: { fullName: true } },
        crew: { include: { user: { select: { id: true, fullName: true, rating: true, skills: true } } } }
      },
      orderBy: { date: 'asc' }
    });
    
    // Также отдаем список всех студентов для модалки назначения команды
    const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    const students = await prisma.user.findMany({
      where: { roleId: studentRole ? studentRole.id : undefined },
      select: { id: true, fullName: true, rating: true, skills: true }
    });

    res.json({ shoots, students });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения съёмок' });
  }
});

// === СЪЁМКИ: СОЗДАТЬ ===
app.post('/api/shoots', authenticateToken, async (req, res) => {
  try {
    const { title, description, type, date, location, studentIds } = req.body;
    const shoot = await prisma.shoot.create({
      data: {
        title,
        description,
        type: type || 'СТУДИЯ',
        date: new Date(date),
        location,
        creatorId: req.user.id,
        crew: {
          create: (studentIds || []).map(userId => ({
            userId,
            roleInShoot: 'Участник съёмочной группы',
            status: 'PENDING'
          }))
        }
      },
      include: { crew: true }
    });
    res.json(shoot);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания съёмки: ' + err.message });
  }
});

// === СТУДЕНТ: ПОДТВЕРДИТЬ ИЛИ ОТКЛОНИТЬ УЧАСТИЕ ===
app.post('/api/crew/response', authenticateToken, async (req, res) => {
  try {
    const { crewMemberId, status } = req.body; // status: 'ACCEPTED' или 'DECLINED'
    const updated = await prisma.crewMember.update({
      where: { id: crewMemberId },
      data: { status }
    });
    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка ответа на приглашение' });
  }
});

// === УВЕДОМЛЕНИЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ===
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const invitations = await prisma.crewMember.findMany({
      where: { userId: req.user.id, status: 'PENDING' },
      include: { shoot: true }
    });
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения уведомлений' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер ЦКТ запущен на порту ${PORT}`);
});
