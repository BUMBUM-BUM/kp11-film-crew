const fs = require('fs');
const store = require('./store');

const action = process.argv[2];
const param = process.argv[3];

async function run() {
  try {
    if (action === 'delete') {
      await store.deleteShoot(param);
      process.stdout.write(JSON.stringify({ success: true }));
    } else if (action === 'add') {
      let body = param;
      if (param && fs.existsSync(param)) {
        body = fs.readFileSync(param, 'utf-8');
      }
      if (typeof body === 'string') {
        body = body.replace(/^\uFEFF/, '').trim();
      }
      const data = JSON.parse(body);
      
      // If data comes from web client with raw create payload:
      if (!data.id) {
        data.id = 'shoot-' + Date.now();
      }
      if (data.crewAssignments && !data.crew) {
        const users = await store.getUsers();
        data.crew = data.crewAssignments.map((ca, idx) => {
          const st = users.find(u => u.id === ca.userId) || { id: ca.userId, fullName: 'Студент', groupName: 'КТ-26' };
          return {
            id: 'c-' + data.id + '-' + (idx + 1),
            roleInShoot: ca.craftRole || 'Специалист цеха',
            status: 'PENDING',
            attendance: 'PRESENT',
            userId: ca.userId,
            user: st
          };
        });
      }
      if (!data.isCompleted) {
        data.isCompleted = false;
      }
      if (!data.creator) {
        const users = await store.getUsers();
        data.creator = { fullName: users[0]?.fullName || 'Мастер Медиацентра КП11' };
      }

      const saved = await store.saveShoot(data);
      process.stdout.write(JSON.stringify({ success: true, shoot: saved }));
    }
  } catch (err) {
    process.stderr.write(err.message);
    process.exit(1);
  }
}

run();
