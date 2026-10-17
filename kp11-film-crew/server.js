const express = require('express');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kp11_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === API: РЕГИСТРАЦИЯ ===
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, role, course, skills } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Пользователь уже существует' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role: role || 'STUDENT',
        course: course ? parseInt(course) : null,
        skills: skills || []
      }
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при регистрации: ' + err.message });
  }
});

// === API: ВХОД ===
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Неверный email или пароль' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка при входе: ' + err.message });
  }
});

// === API: ПОЛУЧИТЬ СПИСОК СЪЁМОК ===
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

// Все остальные запросы перенаправляем на фронтенд
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер КП11 запущен на порту ${PORT}`);
});
