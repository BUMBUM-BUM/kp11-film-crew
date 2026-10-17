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

// Инициализация базовых ролей при старте сервера
async function initRoles() {
  try {
    let studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    if (!studentRole) {
      studentRole = await prisma.role.create({ data: { name: 'Студент', description: 'Базовая роль для всех учащихся' } });
    }

    let teacherRole = await prisma.role.findUnique({ where: { name: 'Мастер / Преподаватель' } });
    if (!teacherRole) {
      teacherRole = await prisma.role.create({ data: { name: 'Мастер / Преподаватель', description: 'Управление съёмками и составом' } });
    }

    let adminRole = await prisma.role.findUnique({ where: { name: 'Администратор' } });
    if (!adminRole) {
      adminRole = await prisma.role.create({ data: { name: 'Администратор', description: 'Полный доступ к системе и ролям' } });
      
      // Создаем дефолтного админа, если его нет
      const adminExists = await prisma.user.findUnique({ where: { email: 'admin@ckt.ru' } });
      if (!adminExists) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        await prisma.user.create({
          data: {
            email: 'admin@ckt.ru',
            passwordHash,
            fullName: 'Главный Администратор ЦКТ',
            roleId: adminRole.id
          }
        });
        console.log('🛡️ Создан аккаунт администратора: admin@ckt.ru / admin123');
      }
    }
  } catch (err) {
    console.error('Ошибка инициализации ролей:', err.message);
  }
}
initRoles();

// === РЕГИСТРАЦИЯ (всегда получает роль Студент) ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, course, skills } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });

    // Находим дефолтную роль «Студент»
    const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        roleId: studentRole ? studentRole.id : null,
        course: course ? parseInt(course) : 1,
        skills: skills || []
      },
      include: { role: true }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role?.name || 'Студент' } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при регистрации: ' + err.message });
  }
});

// === ВХОД ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { role: { include: { permissions: { include: { permission: true } } } } }
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
        role: user.role?.name || 'Без роли',
        permissions: user.role?.permissions?.map(p => p.permission.code) || []
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при входе: ' + err.message });
  }
});

// === API ДЛЯ АДМИНА: ПОЛУЧИТЬ РОЛИ И ПОЛЬЗОВАТЕЛЕЙ ===
app.get('/api/admin/data', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const users = await prisma.user.findMany({ include: { role: true }, select: { id: true, fullName: true, email: true, role: true, rating: true } });
    const permissions = await prisma.permission.findMany();
    res.json({ roles, users, permissions });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка загрузки админ-панели' });
  }
});

// === API ДЛЯ АДМИНА: СОЗДАТЬ РОЛЬ ===
app.post('/api/admin/roles', async (req, res) => {
  try {
    const { name, description, permissionIds } = req.body;
    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissions: {
          create: permissionIds.map(permissionId => ({ permissionId }))
        }
      },
      include: { permissions: true }
    });
    res.json(role);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания роли: ' + err.message });
  }
});

// === API ДЛЯ АДМИНА: НАЗНАЧИТЬ РОЛЬ ПОЛЬЗОВАТЕЛЮ ===
app.post('/api/admin/assign-role', async (req, res) => {
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

// Получить список съёмок
app.get('/api/shoots', async (req, res) => {
  try {
    const shoots = await prisma.shoot.findMany({
      include: {
        creator: { select: { fullName: true } },
        crew: { include: { user: { select: { id: true, fullName: true, rating: true } } } }
      },
      orderBy: { date: 'asc' }
    });
    res.json(shoots);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения съёмок' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер ЦКТ запущен на порту ${PORT}`);
});
