import type { SimScenario, SimChoice, SimState } from './simulator-engine.js'

// Сценарії симуляторів — порт із temp/new/assembly (hardware.html, software.html)
// без чужої аналітики/SEO; SVG-іконки замінено емодзі, тексти збережено.
// «Збірка ПК» — 2–3 клас (informatics/computer-systems),
// «Налаштування ОС» — 4 клас (informatics/digital-tools), піде в карту 4 класу.

// ── Збірка ПК: Майстерня ────────────────────────────────────────────────────

const hwInitial = () => ({
  power_on: false,
  cpu_installed: false,
  cooler_installed: false,
  ram_installed: false,
  storage_installed: false,
  storage_screwed: false,
  gpu_installed: false,
})

const hwInstalledCount = (s: SimState) =>
  [s.cpu_installed && s.cooler_installed, s.ram_installed, s.storage_installed && s.storage_screwed, s.gpu_installed]
    .filter(Boolean).length

const hwAllDone = (s: SimState) =>
  s.cpu_installed && s.cooler_installed && s.ram_installed
  && s.storage_installed && s.storage_screwed && s.gpu_installed

/** Вибір «встановити деталь»: під напругою веде у fail_safety без установки. */
function hwInstall(text: string, key: string, next: string): SimChoice {
  return {
    text,
    next: s => (s.power_on ? 'fail_safety' : next),
    action: s => { if (!s.power_on) s[key] = true },
  }
}

export const HARDWARE_SCENARIO: SimScenario = {
  id: 'assembly-hardware',
  title: 'Збірка ПК: Майстерня',
  initialState: hwInitial,
  statuses: [
    { label: 'Процесор',    active: s => !!(s.cpu_installed && s.cooler_installed) },
    { label: 'Памʼять',     active: s => !!s.ram_installed },
    { label: 'Накопичувач', active: s => !!(s.storage_installed && s.storage_screwed) },
    { label: 'Відеокарта',  active: s => !!s.gpu_installed },
    {
      label: s => (s.power_on ? 'Живлення: УВІМКНЕНО' : 'Живлення: вимкнено'),
      active: () => false,
      danger: s => !!s.power_on,
    },
  ],
  startNode: 'start',
  winNode: 'win',
  nodes: {
    start: {
      icon: '🧰',
      text: 'Перед тобою порожній корпус компʼютера з головною платою. Поруч лежать інші деталі. Твоє завдання — правильно зібрати компʼютер. Головне правило: не підключай деталі, коли подано живлення!',
      info: 'Материнська плата — це ніби велике місто з дорогами. Вона зʼєднує між собою всі інші деталі, щоб вони могли «спілкуватися» одна з одною.',
      choices: [{ text: 'Подивитися на материнську плату', next: 'motherboard' }],
    },
    motherboard: {
      icon: '🖥️',
      text: s => {
        const installed = hwInstalledCount(s)
        if (installed === 4 && s.power_on) return 'Усі головні деталі на своїх місцях, живлення увімкнено. Можна запускати!'
        let text = `Ти дивишся на материнську плату. Тут є багато різних гнізд для деталей.\nВстановлено деталей: ${installed} із 4.`
        if (installed === 0) text += '\n\nПідказка: майстри зазвичай починають з процесора.'
        if (installed === 4 && !s.power_on) text += '\n\nДеталі встановлено. Час увімкнути блок живлення.'
        return text
      },
      choices: s => {
        if (hwAllDone(s) && s.power_on) {
          return [{ text: 'Натиснути кнопку «Увімкнення»!', next: 'win' }]
        }
        return [
          { text: 'Місце для Процесора (Мозок)', next: 'cpu' },
          { text: 'Місце для Памʼяті (Робочий стіл)', next: 'ram' },
          { text: 'Розʼєм для Накопичувача (Шафа)', next: 'storage' },
          { text: 'Довгий розʼєм для Відеокарти (Художник)', next: 'gpu' },
          { text: 'Блок живлення (Серце)', next: 'power' },
        ]
      },
    },
    power: {
      icon: '🔌',
      text: s => (s.power_on
        ? 'Блок живлення увімкнено (кнопка на «I»). Електрика подається по проводах.'
        : 'Блок живлення вимкнено (кнопка на «O»). Компʼютер безпечний для збірки.'),
      info: 'Блок живлення — це серце компʼютера. Він бере електрику з розетки і безпечно роздає її всім іншим деталям.',
      choices: s => [
        {
          text: s.power_on ? 'Вимкнути живлення (Положення «O»)' : 'Увімкнути живлення (Положення «I»)',
          action: st => { st.power_on = !st.power_on },
          next: 'power',
        },
        { text: 'Повернутися назад', next: 'motherboard' },
      ],
    },
    cpu: {
      icon: '🧠',
      text: s => {
        if (s.cooler_installed) return 'Відмінна робота! Процесор на місці, а зверху стоїть вентилятор. Йому не буде гаряче.'
        if (s.cpu_installed) return 'Чудово, процесор у гнізді. Але якщо на нього зараз подати живлення, він перегріється. Зверху потрібно поставити вентилятор (кулер).'
        return 'Гніздо для процесора порожнє. Його потрібно встановлювати дуже обережно, щоб не погнути маленькі ніжки.'
      },
      info: 'Процесор — це мозок компʼютера. Він дуже швидко думає, вирішує задачі та керує всіма іншими деталями. Від думок він сильно гріється.',
      choices: s => {
        const options: SimChoice[] = []
        if (!s.cpu_installed) options.push(hwInstall('Обережно встановити процесор у гніздо', 'cpu_installed', 'cpu'))
        else if (!s.cooler_installed) options.push(hwInstall('Поставити вентилятор охолодження', 'cooler_installed', 'cpu'))
        options.push({ text: 'Повернутися назад', next: 'motherboard' })
        return options
      },
    },
    ram: {
      icon: '🗂️',
      text: s => (s.ram_installed
        ? 'Супер! Планки памʼяті клацнули — усе стало на місце! Процесору буде зручно працювати.'
        : 'Слоти для памʼяті порожні. Планку треба вставляти рівно, щоб спеціальний виріз збігся з перегородкою.'),
      info: 'Оперативна памʼять — це як робочий стіл для процесора. Чим більший стіл, тим більше зошитів (програм) можна відкрити одночасно.',
      choices: s => {
        const options: SimChoice[] = []
        if (!s.ram_installed) {
          options.push({ text: 'Вставити силою, не звертаючи уваги на виріз', next: 'fail_ram' })
          options.push(hwInstall('Зіставити виріз та вставити до клацання', 'ram_installed', 'ram'))
        }
        options.push({ text: 'Повернутися назад', next: 'motherboard' })
        return options
      },
    },
    fail_ram: {
      icon: '⚠️',
      isFail: true,
      text: 'Стій! Планка не лізе, бо виріз не збігається. Якщо тиснути силою, можна зламати і памʼять, і плату.',
      choices: [{ text: 'Спробувати обережніше', next: 'ram' }],
    },
    storage: {
      icon: '🗄️',
      text: s => {
        if (s.storage_screwed) return 'Супер! Накопичувач встановлено та зафіксовано. Тепер компʼютер зможе зберігати файли.'
        if (s.storage_installed) return 'SSD-накопичувач у розʼємі, але він стирчить під кутом. Його треба зафіксувати, щоб не випав.'
        return 'На материнській платі є спеціальний розʼєм для сучасного SSD-накопичувача. Він виглядає як маленька прямокутна пластинка.'
      },
      info: 'Накопичувач (SSD) — це велика шафа. Тут назавжди зберігаються всі твої фотографії, ігри та програми.',
      choices: s => {
        const options: SimChoice[] = []
        if (!s.storage_installed) options.push(hwInstall('Вставити SSD-накопичувач у розʼєм', 'storage_installed', 'storage'))
        else if (!s.storage_screwed) options.push(hwInstall('Зафіксувати маленьким гвинтиком', 'storage_screwed', 'storage'))
        options.push({ text: 'Повернутися назад', next: 'motherboard' })
        return options
      },
    },
    gpu: {
      icon: '🎨',
      text: s => (s.gpu_installed
        ? 'Клас! Велика відеокарта надійно стоїть на своєму місці.'
        : 'Тут є найдовший розʼєм на платі. Сюди встановлюється відеокарта.'),
      info: 'Відеокарта — це швидкий художник. Вона малює все, що ти бачиш на екрані монітора: красиву графіку в іграх та відео.',
      choices: s => {
        const options: SimChoice[] = []
        if (!s.gpu_installed) options.push(hwInstall('Вставити відеокарту', 'gpu_installed', 'gpu'))
        options.push({ text: 'Повернутися назад', next: 'motherboard' })
        return options
      },
    },
    fail_safety: {
      icon: '⚠️',
      isFail: true,
      text: 'Ой! Деталь можна зіпсувати, якщо ставити її під напругою. Вимикай живлення перед збіркою — це головне правило майстра.',
      choices: [{
        text: 'Вимкнути живлення і бути обережнішим',
        action: s => { s.power_on = false },
        next: 'motherboard',
      }],
    },
    win: {
      icon: '🎉',
      text: 'Вентилятори тихо закрутилися. На екрані зʼявився логотип системи. Ти правильно зібрав компʼютер і нічого не зламав!\n\nПідсумок знань:\n• Процесор — мозок\n• Оперативна памʼять — робочий стіл\n• Накопичувач — велика шафа\n• Відеокарта — швидкий художник\n• Блок живлення — серце',
      choices: [{ text: 'Зібрати компʼютер ще раз', next: 'start' }],
    },
  },
}

// ── Налаштування ОС та ПЗ (4 клас) ──────────────────────────────────────────

const swInitial = () => ({
  power_on: false,
  usb_inserted: false,
  os_installed: false,
  network_connected: false,
  drivers_installed: false,
  software_installed: false,
})

export const SOFTWARE_SCENARIO: SimScenario = {
  id: 'assembly-software',
  title: 'Налаштування ОС та ПЗ',
  initialState: swInitial,
  statuses: [
    { label: s => (s.power_on ? 'Живлення: УВІМКНЕНО' : 'Живлення: вимкнено'), active: s => !!s.power_on },
    { label: 'ОС',       active: s => !!s.os_installed },
    { label: 'Мережа',   active: s => !!s.network_connected },
    { label: 'Драйвери', active: s => !!s.drivers_installed },
    { label: 'Програми', active: s => !!s.software_installed },
  ],
  startNode: 'start',
  winNode: 'win',
  nodes: {
    start: {
      icon: '🖥️',
      text: 'Перед тобою щойно зібраний компʼютер. Деталі готові, але накопичувач абсолютно порожній. Щоб ПК почав працювати, потрібна операційна система.',
      info: 'Без програм деталі не вміють робити нічого корисного. Операційна система (ОС) — це головна програма, яка керує всім компʼютером.',
      choices: s => {
        if (s.os_installed && s.power_on) return [{ text: 'Перейти до Робочого столу', next: 'desktop' }]
        const options: SimChoice[] = [{
          text: s.power_on ? 'Вимкнути компʼютер' : 'Увімкнути компʼютер',
          action: st => { st.power_on = !st.power_on },
          next: st => (st.power_on ? 'boot_sequence' : 'start'),
        }]
        if (!s.os_installed) {
          options.push({
            text: s.usb_inserted ? 'Витягти USB-флешку' : 'Вставити завантажувальну USB-флешку з ОС',
            action: st => { st.usb_inserted = !st.usb_inserted },
            next: 'start',
          })
        }
        return options
      },
    },
    boot_sequence: {
      icon: '🖥️',
      text: s => {
        if (s.os_installed) return 'Завантаження ОС…'
        if (s.usb_inserted) return 'Знайдено завантажувальну флешку. Запуск програми встановлення…'
        return 'Помилка: компʼютеру немає з чого завантажитися. Вставте флешку з ОС і спробуйте знову.'
      },
      choices: s => {
        if (s.os_installed) return [{ text: 'Продовжити', next: 'desktop' }]
        if (s.usb_inserted) return [{ text: 'Почати встановлення ОС', next: 'os_install' }]
        return [{ text: 'Вимкнути ПК', action: st => { st.power_on = false }, next: 'start' }]
      },
    },
    os_install: {
      icon: '💿',
      text: 'Встановлення ОС розпочато. Компʼютер копіює файли, розпаковує компоненти і ставить оновлення. Після перезавантаження система буде готова до роботи.',
      info: 'Завантажувальна флешка містить «образ» операційної системи — програма встановлення розгортає його на накопичувач.',
      choices: [{
        text: 'Завершити встановлення та перезавантажити',
        action: s => { s.os_installed = true; s.usb_inserted = false },
        next: 'rebooting',
      }],
    },
    rebooting: {
      icon: '🔄',
      text: 'Система перезавантажується…\nНа екрані логотип…\nЗапуск служб…',
      choices: [{ text: 'Продовжити', next: 'desktop' }],
    },
    desktop: {
      icon: '🪟',
      text: s => {
        if (s.software_installed) return 'Робочий стіл завантажено. Всі системи працюють як слід.'
        if (s.drivers_installed) return 'Система розпізнала всі деталі. Зображення стало чітким. Час встановити робочі програми.'
        if (s.network_connected) return 'Є інтернет! Але зображення на екрані розтягнуте, а деякі пристрої система не впізнає. Потрібні драйвери.'
        return 'Робочий стіл ОС. Система встановлена, але немає інтернету, зображення нечітке, відсутній звук і базові програми.'
      },
      choices: s => {
        if (s.network_connected && s.drivers_installed && s.software_installed) {
          return [{ text: 'Завершити налаштування', next: 'win' }]
        }
        const options: SimChoice[] = []
        if (!s.network_connected) options.push({ text: 'Підключитися до мережі (Wi-Fi або кабель)', next: 'network' })
        if (!s.drivers_installed) options.push({ text: 'Завантажити та встановити драйвери', next: 'drivers' })
        if (!s.software_installed) options.push({ text: 'Встановити базові програми', next: 'software' })
        options.push({ text: 'Вимкнути компʼютер', action: st => { st.power_on = false }, next: 'start' })
        return options
      },
    },
    network: {
      icon: '📶',
      text: 'Ти підключив мережевий кабель (або ввів пароль Wi-Fi). Компʼютер отримав адресу в мережі — зʼявився доступ до інтернету.',
      info: 'Інтернет потрібен, щоб завантажити свіжі драйвери, оновлення безпеки та програми.',
      choices: [{ text: 'Повернутися на Робочий стіл', action: s => { s.network_connected = true }, next: 'desktop' }],
    },
    drivers: {
      icon: '⚙️',
      text: s => (!s.network_connected
        ? 'Без інтернету свіжі драйвери завантажити не вийде.'
        : 'Завантаження драйверів для відеокарти, звуку і мережі. Екран кілька разів блимає — це нормально, система застосовує налаштування.'),
      info: 'Драйвер — це програма-перекладач: вона пояснює операційній системі, як розмовляти з конкретною деталлю.',
      choices: s => (!s.network_connected
        ? [{ text: 'Повернутися', next: 'desktop' }]
        : [{ text: 'Перезавантажити після встановлення драйверів', action: st => { st.drivers_installed = true }, next: 'desktop' }]),
    },
    software: {
      icon: '📦',
      text: s => {
        if (!s.network_connected) return 'Програми завантажити не вийде: немає інтернету.'
        if (!s.drivers_installed) return 'Встановлення йде дуже повільно, все гальмує — без драйверів відеокарти компʼютеру важко.'
        return 'Встановлення браузера, текстового редактора, архіватора, плеєра та антивіруса. Компʼютер повністю укомплектовано.'
      },
      choices: s => (!s.network_connected || !s.drivers_installed
        ? [{ text: 'Повернутися та виправити помилки', next: 'desktop' }]
        : [{ text: 'Завершити встановлення програм', action: st => { st.software_installed = true }, next: 'desktop' }]),
    },
    win: {
      icon: '🎉',
      text: 'ПК повністю налаштований і готовий до роботи!\n\nЛогіка процесу:\n1. Завантаження з USB-флешки.\n2. Встановлення операційної системи.\n3. Підключення до мережі.\n4. Встановлення драйверів.\n5. Встановлення програм.',
      choices: [{ text: 'Почати заново (стерти накопичувач)', next: 'start' }],
    },
  },
}
