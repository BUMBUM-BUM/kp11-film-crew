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
    return res.status(403).json({ error: 'Недействительный сеанс или токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role?.name !== 'Администратор') {
    return res.status(403).json({ error: 'Доступ запрещён. Требуются права Администратора.' });
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
        data: { email: 'admin@ckt.ru', passwordHash, fullName: 'Главный Администратор', groupName: 'Админ', roleId: adminRole.id }
      });
    }
  } catch (err) {
    console.error('DB Init Error:', err.message);
  }
}
initDatabase();

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, groupName, course } = req.body;
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
        rating: null, // У новых пользователей нет рейтинга
        skills: ['Универсал']
      },
      include: { role: true }
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, fullName: user.fullName, email: user.email, groupName: user.groupName, role: user.role?.name || 'Студент' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { role: true }
    });
    if (!user) return res.status(400).json({ error: 'Неверные данные' });
    if (user.isSuspended) return res.status(403).json({ error: 'Аккаунт отстранен администрацией' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(400).json({ error: 'Неверные данные' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        fullName: user.fullName, 
        email: user.email, 
        groupName: user.groupName,
        role: user.role?.name || 'Без роли'
      } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/data', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    const users = await prisma.user.findMany({ include: { role: true } });
    res.json({ roles, users });
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

app.delete('/api/admin/shoots/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.shoot.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Эндпоинт для статистики и лидеров
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
    const shoots = await prisma.shoot.findMany({
      include: {
        creator: { select: { fullName: true } },
        crew: { include: { user: { select: { id: true, fullName: true, groupName: true, rating: true, skills: true } } } }
      },
      orderBy: { date: 'asc' }
    });
    
    const studentRole = await prisma.role.findUnique({ where: { name: 'Студент' } });
    const students = await prisma.user.findMany({
      where: {
        isSuspended: false,
        OR: [
          { roleId: studentRole ? studentRole.id : undefined },
          { role: { name: 'Студент' } }
        ]
      },
      select: { id: true, fullName: true, groupName: true, rating: true, skills: true }
    });

    const totalShoots = shoots.length;
    const completedShoots = shoots.filter(s => s.isCompleted).length;

    let userStats = null;
    if (req.user) {
      const myParticipations = await prisma.crewMember.findMany({
        where: { userId: req.user.id, status: 'ACCEPTED' },
        include: { shoot: true }
      });
      userStats = {
        totalParticipated: myParticipations.length,
        completedParticipated: myParticipations.filter(p => p.shoot.isCompleted).length,
        rating: req.user.rating
      };
    }

    res.json({ shoots, students, stats: { totalShoots, completedShoots }, userStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shoots', authenticateToken, async (req, res) => {
  try {
    const { title, description, type, date, location, crewAssignments, latitude, longitude } = req.body;
    const shoot = await prisma.shoot.create({
      data: {
        title,
        description,
        type: type || 'СТУДИЯ',
        date: new Date(date),
        location,
        latitude: latitude ? parseFloat(latitude) : 55.751244,
        longitude: longitude ? parseFloat(longitude) : 37.618423,
        creatorId: req.user.id,
        crew: {
          create: (crewAssignments || []).map(item => ({
            userId: item.userId,
            roleInShoot: item.craftRole || 'Участник',
            status: 'PENDING',
            attendance: 'PRESENT'
          }))
        }
      },
      include: { crew: true }
    });
    res.json(shoot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crew/attendance', authenticateToken, async (req, res) => {
  try {
    const { crewMemberId, attendance } = req.body;
    const crewMember = await prisma.crewMember.findUnique({
      where: { id: crewMemberId },
      include: { user: true }
    });

    if (!crewMember) return res.status(404).json({ error: 'Участник не найден' });

    if (attendance === 'ABSENT' && crewMember.attendance === 'PRESENT' && crewMember.user.rating !== null) {
      const newRating = Math.max(1.0, parseFloat((crewMember.user.rating - 0.3).toFixed(1)));
      await prisma.user.update({
        where: { id: crewMember.userId },
        data: { rating: newRating }
      });
    }

    const updated = await prisma.crewMember.update({
      where: { id: crewMemberId },
      data: { attendance }
    });

    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Завершение смены с выставлением оценки (среднее арифметическое)
app.post('/api/shoots/complete', authenticateToken, async (req, res) => {
  try {
    const { shootId, grade } = req.body;
    const shoot = await prisma.shoot.update({
      where: { id: shootId },
      data: { isCompleted: true },
      include: { crew: true }
    });

    for (const member of shoot.crew) {
      if (member.status === 'ACCEPTED' && member.attendance === 'PRESENT') {
        const user = await prisma.user.findUnique({ where: { id: member.userId } });
        if (user) {
          let newRating;
          if (user.rating === null || user.rating === undefined) {
            newRating = grade; // Первая оценка
          } else {
            newRating = parseFloat(((user.rating + grade) / 2).toFixed(1)); // Среднее арифметическое
          }
          await prisma.user.update({ where: { id: user.id }, data: { rating: newRating } });
        }
      }
    }

    res.json({ success: true, shoot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/crew/response', authenticateToken, async (req, res) => {
  try {
    const { crewMemberId, status } = req.body;
    const updated = await prisma.crewMember.update({
      where: { id: crewMemberId },
      data: { status }
    });
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Production server running on port ${PORT}`);
});
