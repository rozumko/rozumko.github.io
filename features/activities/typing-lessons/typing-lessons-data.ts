// The 35 Klavio typing lessons, in the order they teach the keyboard: every
// lesson adds one or two new keys on top of everything before it.
//
// The teacher picks a series, not a single lesson — a class works through as
// much of it as the period allows — and how much help the screen gives.

export type SeriesId = 'foundation' | 'expansion' | 'alphabet' | 'texts'
export type HintMode = 'guided' | 'finger' | 'independent'

export interface LessonSeries {
  id: SeriesId
  title: string
  /** Inclusive lesson numbers, 1-based. */
  range: [number, number]
}

export const SERIES: readonly LessonSeries[] = [
  { id: 'foundation', title: 'Перші клавіші',      range: [1, 10] },
  { id: 'expansion',  title: 'Розширюємо абетку',  range: [11, 20] },
  { id: 'alphabet',   title: 'Завершуємо абетку',  range: [21, 29] },
  { id: 'texts',      title: 'Знаки й тексти',     range: [30, 35] },
]

export interface HintConfig {
  id: HintMode
  label: string
  /** Light the next key on the virtual keyboard. */
  keyboard: boolean
  /** Name the hand and finger that should press it. */
  finger: boolean
}

export const HINT_MODES: readonly HintConfig[] = [
  { id: 'guided',      label: 'З підказками', keyboard: true,  finger: true },
  { id: 'finger',      label: 'Лише палець',  keyboard: false, finger: true },
  { id: 'independent', label: 'Самостійно',   keyboard: false, finger: false },
]

/** What each lesson introduces; shown above the text. */
const FOCUSES = [
  'А О В', 'Л', 'Д', 'І', 'Ф', 'Ж', 'М', 'Т', 'И', 'Ь',
  'П', 'Р', 'К', 'Г', 'Е', 'Н', 'У', 'Ш', 'Ц', 'Щ',
  'Й', 'З', 'Х', 'Є', 'С', 'Б', 'Ч', 'Ю', 'Я', 'Крапка',
  'Кома', 'Ї', 'Ґ', 'Великі літери', 'Підсумковий текст',
]

const TEXTS = [
  'аааооо ааоао оааоо аоаоа ао оао вввооо ввово оввоо вовов во ввава авваа вавав аавав ав ав вова вова',
  'лллввв ллвлв вллвв аааллл аалал лаалл алала алла вал лава оолол лоолл ололо лов лола овал алло олово',
  'дддввв дввдв двдвд ададд адада даада да дав два д лдллд лддлд одоод ододо до лад ода лада вода влада',
  'іііддд ідіід ідіді дід івівв іівів від ілліл ілііл діл іаіаі іааіа далі іоііо іооіо діло воді доволі',
  'фффддд ффдфд дффдд фдфдф ддфдф фафаф аафаф даф флффл лфлфл фал лафа фофоф фол фіфіф фвффв ліф філіал',
  'жжжффф жжфжф фжжфф жфжфж аж жіжжі ііжіж іж жджжд ждджд діжа фіджі жввжв ажажа жалів лжлжж ложа жало',
  'мммжжж ммдмд момом лммлл мамам мама мода між міла мввмв вам мало фмффм міф вім мова лом водолом',
  'мммттт ммтмт тмттм мтмтм ттмтм та фата літа тотто мото лот літо том тоді ліфт та фото флот атом жмот',
  'иииттт иитит тиитт ти ви аиааи аиаиа жадати жито иимим миими ми ти мимо мило ждати мати жалити живіт',
  'ьььиии ььиьи ттьть ьттьь жить ловить ммьмь ьмьмь тьма міль фільм вимить оььоь толь виводить молотить',
  'пппооо ппапа вппвв піпіп ллплп пффпф ппжж мпипм птпьп пола піп пол пиж випав падав підвал помити',
  'пппррр ппрпр рппрп прпрп ррпрп пир пар ріпа риф рило пара пори порт правда прорив рапіра пропажа',
  'кккррр кклкл іккіі рік крик рик вк вік викрик кооко код кілок кіт лікоть аккак підковка плакати',
  'кккггг ккгкг кг гак гол кгккг гкгкг гірко граф вага оггог ргррг гора ворог кіготь кігті грифа',
  'еееггг еекек аееае пепеп де вітер реле режим джемпер кекек лепет перо торпеда тепер реферат',
  'еееннн гнгнн рнррн ононо фанера липень жовтень півень перина монети пень ремінь на арені поні',
  'уууннн уооуо вувву фуга кут куток рагу уауау уііуі луллу вугіль утка луг круг дуга гудок група',
  'ууушшш ошшош лшлшл гшггш шум шуруп куш душ фішка шуміти шишка шквал кишка шкура грушу укушу',
  'цццшшш ццвцв цфцфц цііці цілити ціль цдцдд цідити цацца ціна лице цариці цукор кцккц цирк цент',
  'щщщццц щшщшщ щдщдщ щлщщл щщжщж щит щука дощ теща щока щипці жалощі щілина щавель щиглик що це',
  'йййщщщ йфйфй цйццй йіййі файл йога герой щуплий шкільний жаркий повний щедрий куций вакцинований',
  'йййззз жзжзж щззщз дзддз злий заразний зайка фзффз фазан груздь зигзаг зазор зашити пізніше',
  'йййххх зхзхх жххжх лшщзх жах хан храм кірха шах халіф хороша хата халупа запахи худий хижак',
  'фффєєє жєжжє зєзєз хєєхє джєдє лжєлж теє віє давнє двоє заєць житіє геєна шкодує немає',
  'сссєєє всвсв лслсс асаас сад вуса маса сосоо іссіс гасити світлий пісок сонце сіяти',
  'сссббб лблбл оббоб дбддб вбвбб жбжжб бокс собор соболь барс субота батько фабрика бути',
  'чччббб ічічі фчффч чуб піч бочок бричка чвчвв бачить чахнути чари часник чорний обруч',
  'чччююю дюдюд жююжю дюна сюжет ключ колючі люллю юббюб брючні брюнет бюджет юрист флюгер',
  'юююяяя фяфяф вяявя іяіія чячяя які якщо ящір ящик шухляда яхта бляха сяє хвоя хартія',
  'яяя... ж.ж.ж ю..ю. є.єє. і т. д. і т. п. та ін. мед. муз. шк. м. англ. грец. лат. укр.',
  '...,,, я,я,, я, ти, він, вона... раз, два, три, чотири... точка, точка, кома. загалом, все.',
  'ааааї ааіаї їхній їхніх їх їсти їжа їжак мої твої свої краї гаї рої поїзд воїн наїзд їдальня',
  'ґґґ ааґаґ ооґоґ ґанок ґудзик ґрунт ґречний аґрус дзиґа ґринджоли ґазда',
  'Токмак Київ Львів Миргород Нетішин Одеса Полтава Рівне Тернопіль Ужгород Харків Чернігів',
  'Джек Лондон. Смок Беллью йшов здовж берега, хитаючись від поривів чужого вітру. У сірому світі шестеро човнів навантажували дорогоцінною поклажею. Фаїна, Європа.',
]

export interface Lesson {
  /** 1-based lesson number, as the children know it. */
  number: number
  focus: string
  text: string
}

export const LESSONS: readonly Lesson[] = TEXTS.map((text, index) => ({
  number: index + 1,
  focus: FOCUSES[index] ?? '',
  text,
}))

export interface LessonsLevel {
  series: LessonSeries
  hints: HintConfig
  lessons: readonly Lesson[]
  /** Characters in the whole series — the unit the run is measured in. */
  totalCharacters: number
}

export function lessonsOfSeries(series: SeriesId): readonly Lesson[] {
  const found = SERIES.find(s => s.id === series)
  if (!found) return []
  return LESSONS.filter(l => l.number >= found.range[0] && l.number <= found.range[1])
}

/** Characters a whole series asks the child to type. */
export function seriesCharacterCount(series: SeriesId): number {
  return lessonsOfSeries(series).reduce((sum, lesson) => sum + lesson.text.length, 0)
}

/**
 * `expansion-finger` → those ten lessons with the finger hint only. Unknown ids
 * fall back to the first series with full help rather than to an empty run.
 */
export function resolveLessonsLevel(level: string): LessonsLevel {
  const [rawSeries, rawHints] = level.split('-')
  const series = SERIES.find(s => s.id === rawSeries) ?? SERIES[0]!
  const hints = HINT_MODES.find(h => h.id === rawHints) ?? HINT_MODES[0]!
  const lessons = lessonsOfSeries(series.id)
  return {
    series,
    hints,
    lessons,
    totalCharacters: lessons.reduce((sum, lesson) => sum + lesson.text.length, 0),
  }
}

export const LESSONS_LEVEL_IDS = SERIES.flatMap(
  series => HINT_MODES.map(hints => `${series.id}-${hints.id}`),
)
