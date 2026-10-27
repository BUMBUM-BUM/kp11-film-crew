/**
 * Скрипт отправки вопроса или запроса на подтверждение ТОЛЬКО мастеру разработки (@Min1_M1chael)
 * Использование:
 *   node scripts/ask_master.js "Текст вопроса" "Вариант 1" "Вариант 2" ...
 */

const bot = require('../bot');
const store = require('../data/store');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Использование: node scripts/ask_master.js "Текст вопроса" [Вариант1] [Вариант2] ...');
    process.exit(1);
  }

  const questionText = args[0];
  const options = args.slice(1);

  console.log(`[Ask Master] Отправка вопроса мастеру @${bot.TARGET_MASTER_USERNAME}...`);
  console.log(`Вопрос: ${questionText}`);
  if (options.length > 0) {
    console.log(`Варианты: ${options.join(' | ')}`);
  }

  const result = await bot.askMaster(questionText, options);
  console.log('[Ask Master] Результат:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('[Ask Master Error]:', err.message);
  process.exit(1);
});
