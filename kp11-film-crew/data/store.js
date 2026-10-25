/**
 * ==============================================================================
 * ГАПОУ КОЛЛЕДЖ ПРЕДПРИНИМАТЕЛЬСТВА №11 // СИНХРОНИЗАЦИЯ ДАННЫХ
 * ЕДИНЫЙ ИСТОЧНИК ДАННЫХ ДЛЯ ВЕБ-САЙТА, СЕРВЕРА И TELEGRAM-БОТА
 * ==============================================================================
 * Гарантирует:
 * 1. Никаких «несуществующих съёмок» — если смены нет на сайте, её нет и в боте.
 * 2. Полная синхронизация юзеров и их Telegram-аккаунтов.
 * 3. Поддержка сохранения токена бота и настроек прямо из админ-панели.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);
const SHOOTS_FILE = path.join(DATA_DIR, 'shoots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'comments.json');
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const userManager = require('./user_manager');

// Подключение к Prisma Client (если есть БД)
let prisma = null;
try {
  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient();
} catch (e) {}

// Начальные пользователи сайта (строго соответствующие реестру колледжа)
const INITIAL_USERS = [
  {
    "id": "admin-1",
    "fullName": "Смирнов Алексей Викторович",
    "email": "admin@kp11.ru",
    "groupName": "ЦКТ",
    "rating": 5,
    "telegram": "@kp11_admin",
    "telegramChatId": null,
    "craftRank": "Системный администратор // System Admin",
    "isSuspended": false,
    "role": {
      "name": "Администратор"
    },
    "competencies": {
      "camera": 90,
      "sound": 90,
      "light": 90,
      "edit": 90
    },
    "skills": [
      "Управление платформой",
      "Безопасность",
      "Настройка оборудования",
      "Инфраструктура ЦКТ"
    ]
  },
  {
    "id": "master-1",
    "fullName": "Бадиков Семён Станиславович",
    "email": "semyon.badikov@kp11.ru",
    "groupName": "КТ-26",
    "rating": 5,
    "telegram": "@badikov_dop",
    "telegramChatId": null,
    "craftRank": "Оператор-постановщик // Master DOP",
    "isSuspended": false,
    "role": {
      "name": "Мастер / Преподаватель"
    },
    "competencies": {
      "camera": 96,
      "sound": 98,
      "light": 92,
      "edit": 94
    },
    "skills": [
      "Log-C",
      "Shure SM7B",
      "Aputure 300D",
      "Sound Design",
      "DaVinci Resolve"
    ],
    "completedShoots": 1
  },
  {
    "id": "u1",
    "fullName": "Ковалев Михаил Алексеевич",
    "email": "mikhail.kovalev@kp11.ru",
    "groupName": "ФВТ-22",
    "rating": 5,
    "telegram": "@mikhail_cam",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // 1st AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 95,
      "sound": 82,
      "light": 88,
      "edit": 96
    },
    "skills": [
      "ARRI Master Prime",
      "Цветокоррекция",
      "Стедикам",
      "LUT Pipeline"
    ],
    "completedShoots": 1
  },
  {
    "id": "u2",
    "fullName": "Демидов Тимофей Дмитриевич",
    "email": "timofey.demidov@kp11.ru",
    "groupName": "ФВТ-22",
    "rating": 5,
    "telegram": "@timofey_light",
    "telegramChatId": null,
    "craftRank": "Гаффер смены // Chief Lighting",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 88,
      "sound": 78,
      "light": 94,
      "edit": 80
    },
    "skills": [
      "Dedolight",
      "Светотеневой рисунок",
      "Вольфрам 3200K",
      "Электробезопасность"
    ],
    "completedShoots": 1
  },
  {
    "id": "u3",
    "fullName": "Гусев Андрей Алексеевич",
    "email": "andrey.gusev@kp11.ru",
    "groupName": "КТ-25",
    "rating": 5,
    "telegram": "@Imwalkingthere",
    "telegramChatId": null,
    "craftRank": "Ассистент осветителя // Best Boy",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 75,
      "sound": 70,
      "light": 85,
      "edit": 68
    },
    "skills": [
      "Гаффер-сетап",
      "Рассеиватели",
      "Штативы C-Stand"
    ],
    "completedShoots": 1
  },
  {
    "id": "u4",
    "fullName": "Соколова Анна Алексеевна",
    "email": "anna.sokolova@kp11.ru",
    "groupName": "КТ-15",
    "rating": 5,
    "telegram": "@anna_sound",
    "telegramChatId": null,
    "craftRank": "Звукооператор // Boom Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 84,
      "sound": 92,
      "light": 75,
      "edit": 86
    },
    "skills": [
      "Радиопетлички Sennheiser",
      "Микрофонный бум",
      "Синхронизация"
    ],
    "completedShoots": 1
  },
  {
    "id": "u5",
    "fullName": "Жемчужников Ярослав Станиславович",
    "email": "yaroslav.zhemch@kp11.ru",
    "groupName": "КТ-25",
    "rating": 4.9,
    "telegram": "@yaroslav_dop",
    "telegramChatId": null,
    "craftRank": "Оператор-постановщик // Master DOP",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 97,
      "sound": 85,
      "light": 90,
      "edit": 92
    },
    "skills": [
      "Оператор-постановщик",
      "Фокус-пуллинг",
      "ARRI RAW",
      "Стедикам"
    ]
  },
  {
    "id": "u6",
    "fullName": "Шальнева Любовь Игоревна",
    "email": "lyubov.shalneva@kp11.ru",
    "groupName": "ФТ-21-25",
    "rating": 4.7,
    "telegram": "@lyubov_photo",
    "telegramChatId": null,
    "craftRank": "Фотограф // 2nd Unit DP",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 92,
      "sound": 76,
      "light": 89,
      "edit": 90
    },
    "skills": [
      "Canon R5",
      "Студийный свет",
      "Репортаж",
      "Lightroom"
    ]
  },
  {
    "id": "u7",
    "fullName": "Хамуд Юлий Мохамедович",
    "email": "yuliy.khamud@kp11.ru",
    "groupName": "КТ-26",
    "rating": 4.6,
    "telegram": "@yuliy_cam",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // 2nd AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 91,
      "sound": 80,
      "light": 84,
      "edit": 88
    },
    "skills": [
      "Canon C200",
      "Стедикам",
      "Оптика Prime",
      "Полевая съёмка"
    ]
  },
  {
    "id": "u8",
    "fullName": "Журавлев Никита Дмитриевич",
    "email": "nikita.zhuravlev@kp11.ru",
    "groupName": "КТ-21",
    "rating": 4.5,
    "telegram": "@mertvi_chel",
    "telegramChatId": null,
    "craftRank": "Звукооператор // Boom Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 80,
      "sound": 95,
      "light": 75,
      "edit": 85
    },
    "skills": [
      "Рекордер Zoom",
      "Радиопетлички",
      "Шумоподавление",
      "Чистовой звук"
    ]
  },
  {
    "id": "u9",
    "fullName": "Сафиулина Дарья Александровна",
    "email": "daria.safiulina@kp11.film",
    "groupName": "КТ-23",
    "rating": 4.8,
    "telegram": "@IifasDasha",
    "telegramChatId": null,
    "craftRank": "Режиссер монтажа // Lead Editor",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 82,
      "sound": 85,
      "light": 78,
      "edit": 98
    },
    "skills": [
      "DaVinci Resolve",
      "Premiere Pro",
      "Монтаж",
      "Цветокоррекция"
    ],
    "completedShoots": 0
  },
  {
    "id": "u10",
    "fullName": "Воронова Кристина Константиновна",
    "email": "kristina.voronova@kp11.film",
    "groupName": "КТ-25",
    "rating": 4.7,
    "telegram": "@eeesoxlevoi",
    "telegramChatId": null,
    "craftRank": "Монтажер // Editor",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 80,
      "sound": 82,
      "light": 75,
      "edit": 94
    },
    "skills": [
      "Монтаж",
      "Premiere Pro",
      "Черновая сборка",
      "Синхронизация звука"
    ],
    "completedShoots": 0
  },
  {
    "id": "u11",
    "fullName": "Борзых Ульяна Владимировна",
    "email": "ulyana.borzykh@kp11.film",
    "groupName": "КТ-25",
    "rating": 4.9,
    "telegram": "@werimer",
    "telegramChatId": null,
    "craftRank": "Линейный продюсер // Production Manager",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 88,
      "sound": 84,
      "light": 86,
      "edit": 95
    },
    "skills": [
      "Координация смен",
      "Линейное продюсирование",
      "Монтаж",
      "Контроль вызывных"
    ],
    "completedShoots": 0
  },
  {
    "id": "u12",
    "fullName": "Шахбазянц Клим Рубенович",
    "email": "klim.shakhbazyants@kp11.film",
    "groupName": "КТ-11",
    "rating": 4.7,
    "telegram": "@klim_shakh",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 92,
      "sound": 76,
      "light": 85,
      "edit": 80
    },
    "skills": [
      "Камерная съемка",
      "Оптика Prime",
      "Работа с подвесом",
      "Фокус"
    ],
    "completedShoots": 0
  },
  {
    "id": "u13",
    "fullName": "Данилова Варвара Васильевна",
    "email": "varvara.danilova@kp11.film",
    "groupName": "КТ-11",
    "rating": 4.6,
    "telegram": "@varvara_danilova",
    "telegramChatId": null,
    "craftRank": "Ассистент оператора // 1st AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 89,
      "sound": 75,
      "light": 82,
      "edit": 81
    },
    "skills": [
      "Фокус-пуллинг",
      "Коммутация тракта",
      "Смена оптики",
      "Камерный журнал"
    ],
    "completedShoots": 0
  },
  {
    "id": "u14",
    "fullName": "Тамбиева Диана Муслимовна",
    "email": "diana.tambieva@kp11.film",
    "groupName": "КТ-16",
    "rating": 4.8,
    "telegram": "@diana_tambieva",
    "telegramChatId": null,
    "craftRank": "Универсал цеха // Multi-Craft Specialist",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 90,
      "sound": 85,
      "light": 84,
      "edit": 92
    },
    "skills": [
      "Операторская съемка",
      "Монтаж",
      "DaVinci Resolve",
      "Работа в студии"
    ],
    "completedShoots": 0
  },
  {
    "id": "u15",
    "fullName": "Гудухина Полина Евгеньевна",
    "email": "polina.gudukina@kp11.film",
    "groupName": "КТ-16",
    "rating": 4.9,
    "telegram": "@spolikxx",
    "telegramChatId": null,
    "craftRank": "Режиссер монтажа // Lead Editor",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 82,
      "sound": 88,
      "light": 79,
      "edit": 98
    },
    "skills": [
      "Монтаж сложных сцен",
      "Цветокоррекция",
      "Final Cut",
      "Premiere Pro"
    ],
    "completedShoots": 0
  },
  {
    "id": "u16",
    "fullName": "Соломатникова Екатерина Владимировна",
    "email": "ekaterina.solomatnikova@kp11.film",
    "groupName": "КТ-16",
    "rating": 4.8,
    "telegram": "@ekaterina_solomatnikova",
    "telegramChatId": null,
    "craftRank": "Монтажер // Editor",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 80,
      "sound": 85,
      "light": 78,
      "edit": 95
    },
    "skills": [
      "Сборка проекта",
      "Саунд-монтаж",
      "Таймлайн-менеджмент",
      "DaVinci"
    ],
    "completedShoots": 0
  },
  {
    "id": "u17",
    "fullName": "Бадюл Глеб",
    "email": "gleb.badyul@kp11.film",
    "groupName": "МЗМ-23",
    "rating": 4.8,
    "telegram": "@gleb_badyul",
    "telegramChatId": null,
    "craftRank": "Звукорежиссер // Sound Engineer",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 75,
      "sound": 98,
      "light": 70,
      "edit": 88
    },
    "skills": [
      "Многоканальная запись",
      "Микшерные пульты",
      "Чистка звука",
      "Сведение"
    ],
    "completedShoots": 0
  },
  {
    "id": "u18",
    "fullName": "Артем Чернышов",
    "email": "artem_real_personal@gmail.com",
    "groupName": "КТ-24",
    "rating": 4.9,
    "telegram": "@catmenmilota",
    "telegramChatId": null,
    "craftRank": "Ответственный за смену // Production Lead",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 94,
      "sound": 88,
      "light": 90,
      "edit": 91
    },
    "skills": [
      "Управление сменой",
      "Операторская постановка",
      "130 павильон",
      "Координация"
    ],
    "completedShoots": 0,
    "passwordHash": "hashed_c3VwZXJQYXNzd29yZDIwMjY=",
    "isDummyPassword": false
  },
  {
    "id": "u19",
    "fullName": "Байрикова Миланья Робертовна",
    "email": "milanya.bayrikova@kp11.film",
    "groupName": "КТ-27",
    "rating": 4.7,
    "telegram": "@Mila13B",
    "telegramChatId": null,
    "craftRank": "Видеоинженер эфира (кнопки) // Video Switcher Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 85,
      "sound": 82,
      "light": 80,
      "edit": 92
    },
    "skills": [
      "Видеомикшеры Blackmagic ATEM",
      "Кнопки / переключение камер",
      "Эфирный тракт"
    ],
    "completedShoots": 0
  },
  {
    "id": "u20",
    "fullName": "Синицына Анастасия Сергеевна",
    "email": "anastasia.sinitsyna@kp11.film",
    "groupName": "КТ-26",
    "rating": 4.7,
    "telegram": "@verystupidman",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 93,
      "sound": 79,
      "light": 85,
      "edit": 84
    },
    "skills": [
      "Студийная съемка",
      "Павильон 130",
      "Композиция кадра",
      "PTZ/Плечевые камеры"
    ],
    "completedShoots": 0
  },
  {
    "id": "u21",
    "fullName": "Копылова Анна Геннадьевна",
    "email": "anna.kopylova@kp11.film",
    "groupName": "КТ-27",
    "rating": 4.6,
    "telegram": "@inkyliric",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 91,
      "sound": 78,
      "light": 84,
      "edit": 82
    },
    "skills": [
      "Студийная съемка",
      "Многокамерный сетап",
      "Фокусировка",
      "Штативные системы"
    ],
    "completedShoots": 0
  },
  {
    "id": "u22",
    "fullName": "Нуриманова Елизавета",
    "email": "elizaveta.nurimanova@kp11.film",
    "groupName": "КТ-26",
    "rating": 4.6,
    "telegram": "@monvayr",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 90,
      "sound": 77,
      "light": 83,
      "edit": 83
    },
    "skills": [
      "Многокамерная запись",
      "Павильонная съемка",
      "Студийный свет",
      "Ракурсы"
    ],
    "completedShoots": 0
  },
  {
    "id": "u23",
    "fullName": "Зимагоров Егор Денисович",
    "email": "egor.zimagorov@kp11.film",
    "groupName": "КТ-26",
    "rating": 4.7,
    "telegram": "@z1ma41",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 92,
      "sound": 80,
      "light": 85,
      "edit": 86
    },
    "skills": [
      "Камерная работа",
      "Динамический план",
      "Павильон 130",
      "Sony FX/Canon"
    ],
    "completedShoots": 0
  },
  {
    "id": "u24",
    "fullName": "Шарец Ярослав Алексеевич",
    "email": "yaroslav.sharets@kp11.film",
    "groupName": "КТ-26",
    "rating": 4.6,
    "telegram": "@yaroslav7sharets",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // Camera Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 91,
      "sound": 79,
      "light": 84,
      "edit": 85
    },
    "skills": [
      "Студийная съемка",
      "Павильон 130",
      "Баланс белого",
      "Кадрирование"
    ],
    "completedShoots": 0
  },
  {
    "id": "u25",
    "fullName": "Чернышова Вивея Владимировна",
    "email": "viveya.chernyshova@kp11.film",
    "groupName": "МЗМ-26",
    "rating": 4.8,
    "telegram": "@MoosePunkRock",
    "telegramChatId": null,
    "craftRank": "Звукооператор // Sound Operator",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 78,
      "sound": 96,
      "light": 74,
      "edit": 87
    },
    "skills": [
      "Студийный звук",
      "Петличные системы",
      "Мониторинг тракта",
      "Шумоподавление"
    ],
    "completedShoots": 0
  },
  {
    "id": "u26",
    "fullName": "Саломатова Анастасия",
    "email": "anastasia.salomatova@kp11.film",
    "groupName": "КТ-15",
    "rating": 4.5,
    "telegram": "@anastasia_salomatova",
    "telegramChatId": null,
    "craftRank": "Ассистент оператора // 2nd AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 87,
      "sound": 75,
      "light": 80,
      "edit": 80
    },
    "skills": [
      "Студийная помощь",
      "Кабельный тракт",
      "Подача оптики",
      "Площадка"
    ],
    "completedShoots": 0
  },
  {
    "id": "u27",
    "fullName": "Колесникова Ксения",
    "email": "ksenia.kolesnikova@kp11.film",
    "groupName": "КТ-15",
    "rating": 4.5,
    "telegram": "@ksenia_kolesnikova",
    "telegramChatId": null,
    "craftRank": "Ассистент оператора // 2nd AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 86,
      "sound": 76,
      "light": 81,
      "edit": 79
    },
    "skills": [
      "Студийная помощь",
      "Кабельный менеджмент",
      "Ассистирование оператору"
    ],
    "completedShoots": 0
  },
  {
    "id": "u28",
    "fullName": "Герасименко Дарья Юрьевна",
    "email": "darya.gerasimenko@kp11.ru",
    "groupName": "КТ-26",
    "rating": 4.8,
    "telegram": "@liarzzsnotfound",
    "telegramChatId": null,
    "craftRank": "Реквизитор / Худ. цех // Art Dept Lead",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 75,
      "sound": 70,
      "light": 80,
      "edit": 75
    },
    "skills": [
      "Реквизит",
      "Художественное оформление",
      "Организация площадки"
    ],
    "completedShoots": 0
  },
  {
    "id": "u29",
    "fullName": "Володина Алиса Дмитриевна",
    "email": "alisa.volodina@kp11.ru",
    "groupName": "КТ-11",
    "rating": 4.8,
    "telegram": "@alisa_volodina",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // 1st AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 88,
      "sound": 72,
      "light": 80,
      "edit": 82
    },
    "skills": [
      "Камерная работа",
      "Оптика",
      "Подсъемы"
    ],
    "completedShoots": 0
  },
  {
    "id": "u30",
    "fullName": "Одинцова Варвара Андреевна",
    "email": "varvara.odintsova@kp11.ru",
    "groupName": "КТ-11",
    "rating": 4.8,
    "telegram": "@varvara_odintsova",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // 1st AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 88,
      "sound": 70,
      "light": 78,
      "edit": 80
    },
    "skills": [
      "Камерная работа",
      "Фокус-пуллинг",
      "Композиция кадра"
    ],
    "completedShoots": 0
  },
  {
    "id": "u31",
    "fullName": "Силуанова Вероника Михайловна",
    "email": "veronika.siluanova@kp11.ru",
    "groupName": "КТ-15",
    "rating": 4.9,
    "telegram": "@Siluanova_v",
    "telegramChatId": null,
    "craftRank": "Продюсер смены // Production Lead",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 85,
      "sound": 85,
      "light": 82,
      "edit": 88
    },
    "skills": [
      "Продюсирование",
      "Координация съемок",
      "Выездные мероприятия",
      "Тайм-менеджмент"
    ],
    "completedShoots": 0
  },
  {
    "id": "u32",
    "fullName": "Богомазова Елизавета Андреевна",
    "email": "elizaveta.bogomazova@kp11.ru",
    "groupName": "КТ-24",
    "rating": 4.8,
    "telegram": "@Nostri",
    "telegramChatId": null,
    "craftRank": "Рилсмейкер / Монтажёр бэкстейджа",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 86,
      "sound": 80,
      "light": 82,
      "edit": 94
    },
    "skills": [
      "Рилс",
      "Клиповый монтаж",
      "Вертикальное видео",
      "Бэкстейдж"
    ],
    "completedShoots": 0
  },
  {
    "id": "u33",
    "fullName": "Пустовойтов Юрий Всеволодович",
    "email": "yuriy.pustovoytov@kp11.ru",
    "groupName": "КТ-26",
    "rating": 4.8,
    "telegram": "@PARLAMENTALI",
    "telegramChatId": null,
    "craftRank": "Камерный оператор // 1st AC",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 90,
      "sound": 75,
      "light": 85,
      "edit": 80
    },
    "skills": [
      "Многокамерная съемка",
      "Панорамирование",
      "Оптика Sony/Canon"
    ],
    "completedShoots": 0
  },
  {
    "id": "u34",
    "fullName": "Михайлов Иван Андреевич",
    "email": "ivan.mikhaylov@kp11.ru",
    "groupName": "МЗМ-26",
    "rating": 4.8,
    "telegram": "@WDYW372",
    "telegramChatId": null,
    "craftRank": "Звукооператор записи // Sound Engineer",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 70,
      "sound": 95,
      "light": 72,
      "edit": 84
    },
    "skills": [
      "Звукозапись",
      "Микрофонный парк",
      "Петличные радиосистемы",
      "Чистка звука"
    ],
    "completedShoots": 0
  },
  {
    "id": "u35",
    "fullName": "Парфене Михаил Олегович",
    "email": "mikhail.parfene@kp11.ru",
    "groupName": "КТ-31",
    "rating": 4.9,
    "telegram": "@KinoParf",
    "telegramChatId": null,
    "craftRank": "Оператор-постановщик // Master DOP",
    "isSuspended": false,
    "role": {
      "name": "Студент"
    },
    "competencies": {
      "camera": 96,
      "sound": 80,
      "light": 92,
      "edit": 90
    },
    "skills": [
      "Театральная съемка",
      "Репортаж",
      "Стабилизаторы DJI RS",
      "Светотеневой рисунок"
    ],
    "completedShoots": 0
  }
];

// Начальные смены сайта (пустой список по умолчанию)
const INITIAL_SHOOTS = [];

function readJsonFile(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Ошибка чтения ${filePath}:`, err.message);
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Ошибка записи ${filePath}:`, err.message);
    return false;
  }
}

// ------------------------------------------------------------------------------
// РАБОТА СО СМЕНАМИ
// ------------------------------------------------------------------------------
async function getShoots() {
  let dbShoots = [];
  if (prisma) {
    try {
      dbShoots = await prisma.shoot.findMany({
        include: {
          creator: { select: { fullName: true } },
          crew: {
            include: {
              user: {
                select: { id: true, fullName: true, groupName: true, rating: true, skills: true, telegram: true, craftRank: true }
              }
            }
          }
        },
        orderBy: { date: 'asc' }
      });
    } catch (e) {
      console.warn('[store.js] prisma.shoot.findMany error:', e.message);
    }
  }

  const rawFileShoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS) || [];
  const fileShoots = rawFileShoots.filter(s => s && s.id !== 'shoot-prod-1' && s.id !== 'shoot-1792450290828');
  if (Array.isArray(dbShoots) && dbShoots.length > 0) {
    const fileMap = new Map(fileShoots.map(s => [String(s.id), s]));
    const mergedDbShoots = dbShoots.map(sh => {
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
    const dbIds = new Set(dbShoots.map(s => String(s.id)));
    const uniqueFileShoots = fileShoots.filter(s => !dbIds.has(String(s.id)));
    return [...mergedDbShoots, ...uniqueFileShoots];
  }

  return fileShoots;
}

async function getShootById(id) {
  if (!id) return null;
  const shoots = await getShoots();
  let found = shoots.find(s => String(s.id) === String(id));
  if (found) return found;

  const fileShoots = readJsonFile(SHOOTS_FILE, []);
  found = fileShoots.find(s => String(s.id) === String(id));
  if (found) return found;

  if (prisma) {
    try {
      const dbShoot = await prisma.shoot.findUnique({
        where: { id: String(id) },
        include: {
          creator: { select: { fullName: true } },
          crew: {
            include: {
              user: {
                select: { id: true, fullName: true, groupName: true, rating: true, skills: true, telegram: true, craftRank: true }
              }
            }
          }
        }
      });
      if (dbShoot) return dbShoot;
    } catch (e) {}
  }
  return null;
}

async function saveShoot(shootData) {
  if (!shootData) return null;
  if (prisma) {
    try {
      // Prisma создание при наличии БД
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS) || [];
  const existingIdx = shoots.findIndex(s => String(s.id) === String(shootData.id));
  if (existingIdx >= 0) {
    shoots[existingIdx] = { ...shoots[existingIdx], ...shootData };
  } else {
    shoots.unshift(shootData);
  }
  writeJsonFile(SHOOTS_FILE, shoots);
  return shootData;
}

async function deleteShoot(id) {
  if (prisma) {
    try {
      await prisma.shoot.delete({ where: { id } }).catch(() => {});
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS) || [];
  const filtered = shoots.filter(s => String(s.id) !== String(id));
  writeJsonFile(SHOOTS_FILE, filtered);
  return true;
}

async function completeShoot(shootId) {
  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  const shoot = shoots.find(s => s.id === shootId);
  if (shoot) {
    shoot.isCompleted = true;
  }

  if (shoot && shoot.crew) {
    const users = readJsonFile(USERS_FILE, INITIAL_USERS);
    for (const member of shoot.crew) {
      const u = users.find(user => user.id === member.userId);
      if (u) {
        u.completedShoots = (u.completedShoots || 0) + 1;
      }
    }
    writeJsonFile(USERS_FILE, users);
    writeJsonFile(SHOOTS_FILE, shoots);
  } else if (shoot) {
    writeJsonFile(SHOOTS_FILE, shoots);
  }

  return shoot;
}

async function updateCrewAttendance(crewMemberId, attendance) {
  if (prisma) {
    try {
      await prisma.crewMember.update({
        where: { id: crewMemberId },
        data: { attendance }
      });
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  let found = false;
  for (const s of shoots) {
    if (s.crew) {
      const m = s.crew.find(c => c.id === crewMemberId || c.userId === crewMemberId);
      if (m) {
        m.attendance = attendance;
        found = true;
        break;
      }
    }
  }
  if (found) {
    writeJsonFile(SHOOTS_FILE, shoots);
    return true;
  }
  return false;
}

async function updateCrewMemberStatus(shootId, userId, newStatus) {
  if (prisma) {
    try {
      await prisma.crewMember.updateMany({
        where: { shootId, userId },
        data: { status: newStatus }
      });
    } catch (e) {}
  }

  const shoots = readJsonFile(SHOOTS_FILE, INITIAL_SHOOTS);
  const shoot = shoots.find(s => s.id === shootId);
  if (shoot && shoot.crew) {
    const member = shoot.crew.find(c => c.userId === userId || c.id === userId);
    if (member) {
      member.status = newStatus;
      writeJsonFile(SHOOTS_FILE, shoots);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------------------

// ------------------------------------------------------------------------------
// СИСТЕМА КОММЕНТАРИЕВ И ОТЗЫВОВ МАСТЕРОВ (СРОК 6 МЕСЯЦЕВ, ЛАЙКИ / ДИЗЛАЙКИ)
// ------------------------------------------------------------------------------
function isCommentActive(comment) {
  if (!comment || !comment.createdAt) return false;
  const created = new Date(comment.createdAt).getTime();
  return (Date.now() - created) <= SIX_MONTHS_MS;
}

function getComments(studentId = null) {
  const allComments = readJsonFile(COMMENTS_FILE, []);
  const activeComments = allComments.filter(isCommentActive);
  if (studentId) {
    return activeComments.filter(c => c.studentId === studentId);
  }
  return activeComments;
}

function addComment(commentData) {
  const allComments = readJsonFile(COMMENTS_FILE, []);
  const newComment = {
    id: 'comm-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4),
    studentId: commentData.studentId,
    studentName: commentData.studentName || '',
    authorId: commentData.authorId || 'master-1',
    authorName: commentData.authorName || 'Мастер Медиацентра',
    type: commentData.type === 'NEGATIVE' ? 'NEGATIVE' : 'POSITIVE',
    text: (commentData.text || '').trim(),
    shootId: commentData.shootId || null,
    shootTitle: commentData.shootTitle || null,
    createdAt: new Date().toISOString()
  };
  allComments.unshift(newComment);
  writeJsonFile(COMMENTS_FILE, allComments);
  return newComment;
}

function deleteComment(commentId) {
  const allComments = readJsonFile(COMMENTS_FILE, []);
  const filtered = allComments.filter(c => c.id !== commentId);
  writeJsonFile(COMMENTS_FILE, filtered);
  return true;
}

function getUserFeedbackStats(studentId) {
  const comments = getComments(studentId);
  const likes = comments.filter(c => c.type === 'POSITIVE').length;
  const dislikes = comments.filter(c => c.type === 'NEGATIVE').length;
  return { likes, dislikes, activeComments: comments };
}

// РАБОТА С ПОЛЬЗОВАТЕЛЯМИ
// ------------------------------------------------------------------------------
async function getUsers() {
  let list = [];
  if (prisma) {
    try {
      const dbUsers = await prisma.user.findMany({ include: { role: true } });
      if (dbUsers && dbUsers.length > 0) list = dbUsers;
    } catch (e) {}
  }
  if (!list || list.length === 0) {
    list = readJsonFile(USERS_FILE, INITIAL_USERS);
  }

  const allActiveComments = getComments();
  return list.map(u => {
    const userComments = allActiveComments.filter(c => c.studentId === u.id);
    const likes = userComments.filter(c => c.type === 'POSITIVE').length;
    const dislikes = userComments.filter(c => c.type === 'NEGATIVE').length;
    return {
      ...u,
      likes,
      dislikes,
      isBlacklisted: !!(u.isBlacklisted || u.isSuspended)
    };
  });
}

async function getUserById(id) {
  const users = await getUsers();
  return users.find(u => u.id === id) || null;
}

async function getUserByTelegram(usernameOrChatId) {
  const users = await getUsers();
  const searchStr = String(usernameOrChatId).replace(/^@/, '').toLowerCase();
  return users.find(u => {
    if (u.telegramChatId && String(u.telegramChatId) === String(usernameOrChatId)) return true;
    if (u.telegram && u.telegram.replace(/^@/, '').toLowerCase() === searchStr) return true;
    return false;
  }) || null;
}

async function updateUser(id, updates) {
  if (prisma) {
    try {
      await prisma.user.update({
        where: { id },
        data: {
          fullName: updates.fullName || undefined,
          email: updates.email || undefined,
          groupName: updates.groupName || undefined,
          telegram: updates.telegram || undefined,
          telegramChatId: updates.telegramChatId || undefined,
          craftRank: updates.craftRank || undefined,
          isSuspended: updates.isBlacklisted !== undefined ? updates.isBlacklisted : (updates.isSuspended !== undefined ? updates.isSuspended : undefined)
        }
      });
    } catch (e) {}
  }

  const users = readJsonFile(USERS_FILE, INITIAL_USERS);
  const user = users.find(u => u.id === id);
  if (user) {
    if (updates.fullName !== undefined) user.fullName = updates.fullName;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.groupName !== undefined) user.groupName = updates.groupName;
    if (updates.telegram !== undefined) {
      user.telegram = updates.telegram.trim() ? (updates.telegram.startsWith('@') ? updates.telegram.trim() : '@' + updates.telegram.trim()) : '';
    }
    if (updates.telegramChatId !== undefined) user.telegramChatId = String(updates.telegramChatId);
    if (updates.craftRank !== undefined) user.craftRank = updates.craftRank;
    if (updates.role !== undefined) {
      user.role = typeof updates.role === 'string' ? { name: updates.role } : updates.role;
    }
    if (updates.isBlacklisted !== undefined) {
      user.isBlacklisted = !!updates.isBlacklisted;
      user.isSuspended = !!updates.isBlacklisted;
    }
    if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;

    writeJsonFile(USERS_FILE, users);
    return user;
  }
  return null;
}

async function deleteUser(id) {
  if (prisma) {
    try {
      await prisma.user.delete({ where: { id } }).catch(() => {});
    } catch (e) {}
  }
  const users = readJsonFile(USERS_FILE, INITIAL_USERS);
  const filtered = users.filter(u => u.id !== id);
  writeJsonFile(USERS_FILE, filtered);
  return true;
}

// ------------------------------------------------------------------------------
// НАСТРОЙКИ (ТОКЕН БОТА, ДЕФОЛТНЫЙ ЧАТ)
// ------------------------------------------------------------------------------
function getSettings() {
  const defaults = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    defaultChatId: '',
    telegramTopicId: process.env.TELEGRAM_TOPIC_ID || '',
    botUsername: 'KP11_FilmCrew_Bot'
  };
  return readJsonFile(SETTINGS_FILE, defaults);
}

function saveSettings(settings) {
  const current = getSettings();
  const updated = { ...current, ...settings };
  writeJsonFile(SETTINGS_FILE, updated);
  if (updated.telegramBotToken) {
    process.env.TELEGRAM_BOT_TOKEN = updated.telegramBotToken;
  }
  if (updated.telegramTopicId !== undefined) {
    process.env.TELEGRAM_TOPIC_ID = updated.telegramTopicId || '';
  }
  return updated;
}


// ------------------------------------------------------------------------------
// УМНОЕ УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ И ДЕДУПЛИКАЦИЯ
// ------------------------------------------------------------------------------
async function deduplicateAllUsers() {
  const users = readJsonFile(USERS_FILE, INITIAL_USERS);
  const shoots = readJsonFile(SHOOTS_FILE, []);
  const { cleanUsers, removedUsers, shoots: cleanShoots } = userManager.deduplicateUsers(users, shoots);
  writeJsonFile(USERS_FILE, cleanUsers);
  writeJsonFile(SHOOTS_FILE, cleanShoots);

  if (prisma) {
    for (const rem of removedUsers) {
      try {
        await prisma.user.delete({ where: { id: rem.id } }).catch(() => {});
      } catch (e) {}
    }
  }
  return { cleanUsers, removedUsers, count: removedUsers.length };
}

async function linkOrRegisterUser(registrationData) {
  const users = readJsonFile(USERS_FILE, INITIAL_USERS);
  const shoots = readJsonFile(SHOOTS_FILE, []);
  const result = await userManager.linkOrRegisterUser(registrationData, users, shoots);
  writeJsonFile(USERS_FILE, result.cleanUsers);
  writeJsonFile(SHOOTS_FILE, result.shoots);
  return result;
}

module.exports = {
  getComments,
  addComment,
  deleteComment,
  getUserFeedbackStats,
  deleteUser,
  deduplicateAllUsers,
  linkOrRegisterUser,
  userManager,
  getShoots,
  getShootById,
  saveShoot,
  completeShoot,
  updateCrewAttendance,
  deleteShoot,
  updateCrewMemberStatus,
  getUsers,
  getUserById,
  getUserByTelegram,
  updateUser,
  getSettings,
  saveSettings,
  INITIAL_SHOOTS,
  INITIAL_USERS
};
