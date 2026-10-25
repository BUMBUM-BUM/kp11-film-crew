const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.DEMO_PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'demo_data');

const SHOOTS_FILE = path.join(DATA_DIR, 'shoots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultVal;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

function recalculateRatings() {
  const shoots = readJsonFile(SHOOTS_FILE, []);
  const users = readJsonFile(USERS_FILE, []);

  users.forEach(u => {
    const roleName = (u.role && u.role.name) || (typeof u.role === 'string' ? u.role : 'Студент');
    if (!roleName.includes('Студент') && !roleName.includes('Мастер')) return;

    const grades = [];
    shoots.forEach(sh => {
      if (sh.isCompleted && Array.isArray(sh.crew)) {
        sh.crew.forEach(cm => {
          const match = cm.userId === u.id || cm.id === u.id || (cm.user && cm.user.id === u.id);
          if (match && cm.grade !== undefined && cm.grade !== null && cm.attendance !== 'ABSENT') {
            grades.push(Number(cm.grade));
          }
        });
      }
    });

    if (grades.length > 0) {
      const sum = grades.reduce((acc, v) => acc + v, 0);
      u.rating = Math.round((sum / grades.length) * 10) / 10;
      u.completedShoots = grades.length;
    }
  });

  writeJsonFile(USERS_FILE, users);
  return users;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  let body = '';
  req.on('data', chunk => { body += chunk; });
  await new Promise(resolve => req.on('end', resolve));

  let jsonBody = {};
  if (body) {
    try { jsonBody = JSON.parse(body); } catch (e) {}
  }

  // ----------------- DEMO API ENDPOINTS -----------------
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // 1. СМЕНЫ
    if (pathname === '/api/shoots' && req.method === 'GET') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const students = users.filter(u => {
        const r = (u.role && u.role.name) || (typeof u.role === 'string' ? u.role : '');
        return r.includes('Студент');
      });

      const auth = req.headers['authorization'] || '';
      let authUserId = null;
      const match = auth.match(/Bearer\s+(?:token-)?([^\s]+)/i);
      if (match) authUserId = match[1];

      let targetUser = users.find(u => u.id === authUserId || u.email === authUserId);
      if (!targetUser && authUserId === 'student-token') targetUser = users.find(u => u.id === 'u1');
      if (!targetUser && (authUserId === 'admin-token' || authUserId === 'admin-1')) targetUser = users.find(u => u.id === 'admin-1');
      if (!targetUser) targetUser = users.find(u => u.id === 'master-1') || users[0];

      let compPart = 0;
      let totPart = 0;
      if (targetUser) {
        shoots.forEach(sh => {
          if (Array.isArray(sh.crew)) {
            const inCrew = sh.crew.some(cm => cm.userId === targetUser.id || cm.id === targetUser.id);
            if (inCrew) {
              totPart++;
              if (sh.isCompleted) compPart++;
            }
          }
        });
      }

      return res.end(JSON.stringify({
        shoots,
        students,
        stats: {
          totalShoots: shoots.length,
          completedShoots: shoots.filter(s => s.isCompleted).length
        },
        userStats: targetUser ? {
          rating: typeof targetUser.rating === 'number' ? targetUser.rating : 4.8,
          completedParticipated: compPart,
          totalParticipated: totPart,
          craftRank: targetUser.craftRank || 'Специалист съёмочной группы'
        } : null
      }));
    }

    if (pathname === '/api/shoots' && req.method === 'POST') {
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const users = readJsonFile(USERS_FILE, []);
      const masterUser = users.find(u => u.id === 'master-1') || users[0];

      const newShoot = {
        id: `shoot-${Date.now().toString(36)}`,
        title: jsonBody.title || 'Новая съёмочная смена',
        description: jsonBody.description || '',
        type: jsonBody.type || 'ПАВИЛЬОН',
        date: jsonBody.date || new Date().toISOString().split('T')[0],
        callTime: jsonBody.callTime || '10:00',
        startTime: jsonBody.startTime || '11:00',
        endTime: jsonBody.endTime || '18:00',
        timeline: Array.isArray(jsonBody.timeline) ? jsonBody.timeline : [],
        location: jsonBody.location || 'Павильон №1 ЦКТ (Онежская, 3)',
        latitude: jsonBody.latitude || 55.858244,
        longitude: jsonBody.longitude || 37.518423,
        isCompleted: false,
        creator: { fullName: masterUser ? masterUser.fullName : 'Бадиков Семён Станиславович' },
        equipment: Array.isArray(jsonBody.equipment) ? jsonBody.equipment : [],
        crew: Array.isArray(jsonBody.crew) ? jsonBody.crew : []
      };

      shoots.unshift(newShoot);
      writeJsonFile(SHOOTS_FILE, shoots);
      recalculateRatings();

      return res.end(JSON.stringify({ success: true, shoot: newShoot }));
    }

    const shootMatch = pathname.match(/^\/api\/shoots\/([a-zA-Z0-9_\-]+)$/);
    if (shootMatch) {
      const shootId = shootMatch[1];
      const shoots = readJsonFile(SHOOTS_FILE, []);
      const idx = shoots.findIndex(s => s.id === shootId);

      if (idx === -1) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Смена не найдена' }));
      }

      if (req.method === 'GET') {
        return res.end(JSON.stringify(shoots[idx]));
      }

      if (req.method === 'PUT') {
        shoots[idx] = { ...shoots[idx], ...jsonBody };
        writeJsonFile(SHOOTS_FILE, shoots);
        recalculateRatings();
        return res.end(JSON.stringify({ success: true, shoot: shoots[idx] }));
      }

      if (req.method === 'DELETE') {
        const deleted = shoots.splice(idx, 1)[0];
        writeJsonFile(SHOOTS_FILE, shoots);
        recalculateRatings();
        return res.end(JSON.stringify({ success: true, message: 'Смена удалена', shoot: deleted }));
      }
    }

    // 2. ОБОРУДОВАНИЕ
    if (pathname === '/api/inventory' && req.method === 'GET') {
      const inv = readJsonFile(INVENTORY_FILE, []);
      return res.end(JSON.stringify(inv));
    }
    if (pathname === '/api/inventory' && req.method === 'POST') {
      const inv = readJsonFile(INVENTORY_FILE, []);
      const { name, serialNumber, serialNumbers, quantity, category, notes, status, location, signedBy } = jsonBody;

      const trimmedName = (name || 'Съёмочное оборудование').trim();
      const qty = Math.max(1, parseInt(quantity, 10) || 1);

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

      for (let i = 0; i < totalCount; i++) {
        let sn = serialsList[i];
        if (!sn) {
          sn = `${prefix}-${String(100 + i + Math.floor(Math.random() * 900))}`;
        }

        const newItem = {
          id: (i === 0 && jsonBody.id) ? jsonBody.id : `eq-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 1000)}`,
          name: trimmedName,
          category: category || 'Оборудование',
          serialNumber: sn,
          status: status || 'AVAILABLE',
          location: location || 'Склад техники ЦКТ КП11',
          notes: notes || '',
          signedBy: signedBy || 'Бадиков Семён Станиславович',
          signedAt: new Date().toISOString()
        };

        createdItems.push(newItem);
        inv.unshift(newItem);
      }

      writeJsonFile(INVENTORY_FILE, inv);
      return res.end(JSON.stringify({
        success: true,
        count: createdItems.length,
        items: createdItems,
        item: createdItems[0],
        inventory: inv
      }));
    }

    // 3. ЛОКАЦИИ
    if (pathname === '/api/locations' && req.method === 'GET') {
      const locs = readJsonFile(LOCATIONS_FILE, []);
      return res.end(JSON.stringify(locs));
    }

    // 4. ПОЛЬЗОВАТЕЛИ
    if (pathname === '/api/users' && req.method === 'GET') {
      const users = readJsonFile(USERS_FILE, []);
      return res.end(JSON.stringify(users));
    }

    // 5. АВТОРИЗАЦИЯ
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const users = readJsonFile(USERS_FILE, []);
      const email = (jsonBody.email || '').trim().toLowerCase();
      const found = users.find(u => u.email && u.email.trim().toLowerCase() === email);

      if (found) {
        const roleStr = (found.role && found.role.name) || found.role || 'Студент';
        return res.end(JSON.stringify({
          success: true,
          token: `token-${found.id}`,
          user: {
            id: found.id,
            fullName: found.fullName,
            email: found.email,
            groupName: found.groupName,
            role: roleStr,
            telegram: found.telegram,
            craftRank: found.craftRank,
            rating: typeof found.rating === 'number' ? found.rating : 4.8
          }
        }));
      } else {
        res.statusCode = 400;
        return res.end(JSON.stringify({ success: false, error: 'Неверный email или пароль' }));
      }
    }

    // Fallback для остальных API
    return res.end(JSON.stringify({ success: true }));
  }

  // ----------------- РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ -----------------
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end('Access Denied');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.statusCode = 404;
        return res.end('Not Found');
      }

      // Для index.html добавляем демо-панель сверху
      if (ext === '.html') {
        let htmlStr = content.toString('utf8');
        const demoBar = `
<!-- DEMO MODE TOP BAR (PORT ${PORT}) -->
<div id="demoTopBar" style="position:fixed; top:0; left:0; right:0; z-index:99999; background:linear-gradient(90deg, #181818, #2e1010); border-bottom:2px solid #E30613; padding:6px 14px; display:flex; align-items:center; justify-content:space-between; font-family:monospace; font-size:11px; color:#fff; box-shadow:0 3px 12px rgba(0,0,0,0.6);">
  <div style="display:flex; align-items:center; gap:8px;">
    <span style="background:#E30613; color:#fff; padding:2px 6px; font-weight:900; border-radius:3px; font-size:10px;">DEMO :${PORT}</span>
    <span style="font-weight:bold; letter-spacing:0.5px;">ЛОКАЛЬНЫЙ ДЕМОНСТРАЦИОННЫЙ СТЕНД</span>
    <span style="color:#aaa; font-size:10px; display:none; @media(min-width:768px){display:inline;}">(демо-данные изолированы в demo_data)</span>
  </div>
  <div style="display:flex; align-items:center; gap:6px;">
    <span style="color:#888; font-size:10px;">Вход:</span>
    <button onclick="demoLoginAs('student')" style="background:#222; border:1px solid #444; color:#fff; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;" title="Михаил Ковалев">🎓 Студент</button>
    <button onclick="demoLoginAs('master')" style="background:#222; border:1px solid #444; color:#fff; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;" title="Семён Бадиков">🎬 Мастер</button>
    <button onclick="demoLoginAs('admin')" style="background:#222; border:1px solid #444; color:#fff; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:10px; font-weight:bold;" title="Алексей Смирнов">⚙️ Админ</button>
    <button onclick="demoLoginAs('guest')" style="background:#111; border:1px solid #333; color:#888; padding:2px 8px; border-radius:3px; cursor:pointer; font-size:10px;" title="Гостевой режим">Гость</button>
  </div>
</div>
<script>
function demoLoginAs(role) {
  if (role === 'student') {
    localStorage.setItem('user', JSON.stringify({ id: 'u1', fullName: 'Ковалев Михаил Алексеевич', email: 'mikhail.kovalev@kp11.ru', groupName: 'ФВТ-22', role: 'Студент', rating: 4.8, telegram: '@mikhail_cam' }));
    localStorage.setItem('token', 'token-u1');
  } else if (role === 'master') {
    localStorage.setItem('user', JSON.stringify({ id: 'master-1', fullName: 'Бадиков Семён Станиславович', email: 'semyon.badikov@kp11.ru', groupName: 'КТ-26', role: 'Мастер / Преподаватель', rating: 5.0, telegram: '@badikov_dop' }));
    localStorage.setItem('token', 'token-master-1');
  } else if (role === 'admin') {
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', fullName: 'Смирнов Алексей Викторович', email: 'admin@kp11.ru', groupName: 'ЦКТ', role: 'Администратор', rating: 5.0, telegram: '@kp11_admin' }));
    localStorage.setItem('token', 'token-admin-1');
  } else {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }
  location.reload();
}
window.addEventListener('DOMContentLoaded', () => {
  document.body.style.paddingTop = '32px';
});
</script>
`;
        htmlStr = htmlStr.replace('</body>', `${demoBar}</body>`);
        content = Buffer.from(htmlStr, 'utf8');
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`>>> KP11 DEMO STAND Active on Port ${PORT}`);
  console.log(`>>> Demo URL: http://localhost:${PORT}/`);
  console.log(`>>> Isolated demo data in: demo_data/`);
  console.log(`=======================================================`);
});
