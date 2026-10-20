const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
const js = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'app.js'), 'utf-8');

// Находим все onclick атрибуты в HTML
const regex = /onclick="([a-zA-Z0-9_]+)\s*\(/g;
let match;
const handlerNames = new Set();
while ((match = regex.exec(html)) !== null) {
  handlerNames.add(match[1]);
}

console.log('Всего уникальных обработчиков onclick в index.html:', handlerNames.size);
const missingHandlers = [];
for (const fn of handlerNames) {
  const isDefined = js.includes('function ' + fn) || 
                    js.includes('window.' + fn) || 
                    js.includes(fn + ' = function') || 
                    js.includes('const ' + fn + ' =') || 
                    js.includes('let ' + fn + ' =') ||
                    js.includes('var ' + fn + ' =');
  if (!isDefined) {
    missingHandlers.push(fn);
  }
}

if (missingHandlers.length > 0) {
  console.log('❌ Отсутствующие функции:', missingHandlers);
  process.exit(1);
} else {
  console.log('✅ Все', handlerNames.size, 'обработчиков кликов объявлены в app.js:');
  console.log(Array.from(handlerNames).sort().join(', '));
}
