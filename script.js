// Firebase config previously inlined in index.html
const firebaseConfig = {
  apiKey: "AIzaSyBgyNmD9ixU_vHOo-MM4_UARiHU35hlt6k",
  authDomain: "tests4-2a91a.firebaseapp.com",
  projectId: "tests4-2a91a",
  storageBucket: "tests4-2a91a.firebasestorage.app",
  messagingSenderId: "706201183615",
  appId: "1:706201183615:web:7104601b8da69ee1ff664a"
};
const __firebase_config = JSON.stringify(firebaseConfig);

// Centralized Firebase service
import {
  app, auth, db, isFirebaseActive, initFirebase,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signInWithCustomToken, signInAnonymously,
  sendEmailVerification,
  doc, getDoc, setDoc, updateDoc, increment, onSnapshot,
  collection, getDocs, query, where
} from './services/firebase.js';

// Імпорт функцій валідації
import {
  validateEmail,
  validatePassword,
  RecaptchaService,
  showPasswordStrength,
  showValidationErrors
} from './utils/validation.js';

// Налаштування підтримуваних класів і reCAPTCHA
const SUBJECT_GRADE_MAP = { informatics: [1, 2, 3, 4] };
const SUPPORTED_GRADES = Array.from(new Set(Object.values(SUBJECT_GRADE_MAP).flat())).sort((a, b) => a - b);

const RECAPTCHA_SITE_KEY = '6LfrF-MrAAAAAJhW8g0-BwvB_3k0gTGM0mI4zcCa';
const RECAPTCHA_ENABLED = false;
const recaptchaService = RECAPTCHA_ENABLED ? new RecaptchaService(RECAPTCHA_SITE_KEY) : null;
if (recaptchaService) {
  recaptchaService.load().catch(error => console.error('Не вдалося завантажити reCAPTCHA:', error));
}

// DOM and UI helpers
import { getRefs, showScreen, setLoadingState, showToast, showModal, hideModal } from './ui/dom.js';
const { welcomeContainer, authContainer, dashboardContainer, testContainer, resultsModal, reviewModal, confirmationModal, infoModal, optionsContainer } = getRefs();

// State
let currentUser = null;
let currentUserData = null;
let currentStudentProfile = null;
let teacherDashboardCache = { students: [], results: [] };
let unsubscribeUserDataListener = null;
let currentTest = { questions: [], subject: '', currentIndex: 0, score: 0, mode: 'practice', reviewData: [], grade: null, difficulty: null, startedAt: null };
import { createTimer } from './features/timer.js';
import { displayQuestion as renderQuestion, updateProgressUI as renderProgress, showReview as renderReview } from './features/quiz.js';
let timerApi = null;
const MODE_CONFIG = {
  practice: {
    label: 'Тренування',
    startButtonLabel: 'Почати тренування',
    questionsCount: 5,
    timeMinutes: null,
    requiresFullscreen: false
  },
  exam: {
    label: 'Демо-версія',
    startButtonLabel: 'Почати демо-олімпіаду',
    questionsCount: 5,
    timeMinutes: 10,
    requiresFullscreen: true,
    difficulty: 'hard'
  },
  olympiad: {
    label: 'Основна олімпіада',
    startButtonLabel: 'Почати основну олімпіаду',
    questionsCount: 10,
    timeMinutes: 15,
    requiresFullscreen: true,
    difficulty: 'hard',
    saveCollection: 'olympiad_results',
    allowRetry: false
  }
};
const OLYMPIAD_EVENT = {
  eventId: 'spring-2026',
  title: 'Весняна олімпіада 2026'
};
const STUDENT_CODE_WORDS = ['ОРЕЛ', 'СОВА', 'ЛОСЬ', 'ЗІРКА', 'ВЕСНА', 'ХМАРА', 'ЛІС', 'ПРОМІНЬ'];
const STUDENT_SESSION_KEY = 'studentCode';
const NEW_CLASS_OPTION_VALUE = '__new__';
const ALL_CLASSES_FILTER_VALUE = 'all';
const PAYMENT_LINK_PATH = '/pay';
const MAX_OFFLINE_SCORES = 100;
let activeTestSessionId = null;
let isLockdownWarningActive = false;
let penalizedQuestions = new Set();
let teacherDashboardFilters = { classId: ALL_CLASSES_FILTER_VALUE };

const badges = {
  informatics_rookie:{ icon:'fas fa-laptop', name:'Юний програміст', subject:'informatics', score:10 },
  informatics_adept:{ icon:'fas fa-code', name:'Хакер', subject:'informatics', score:50 },
  genius:{ icon:'fas fa-brain', name:'Юний геній', subject:'total', score:100 },
  mastermind:{ icon:'fas fa-trophy', name:'Володар знань', subject:'total', score:200 }
};

// --- CORE LOGIC ---

function setMode(mode){
  currentTest.mode = mode;
  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn=>{
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('is-active',isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  updateModeDependentUI();
}

function hydrateModeButtons() {
  const modePresentation = {
    practice: {
      icon: 'fas fa-book-open',
      title: 'Тренування',
      description: 'Обери клас і складність для підготовки.'
    },
    exam: {
      icon: 'fas fa-rocket',
      title: 'Демо-версія',
      description: 'Спробуй формат олімпіади перед основним проходженням.'
    },
    olympiad: {
      icon: 'fas fa-medal',
      title: 'Основна олімпіада',
      description: 'Офіційний прохід за кодом учня.'
    }
  };

  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
    const data = modePresentation[btn.dataset.mode];
    if (!data) return;
    btn.innerHTML = `
      <span class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 text-lg mb-3">
        <i class="${data.icon}" aria-hidden="true"></i>
      </span>
      <span class="block text-lg font-bold">${data.title}</span>
      <span class="block text-sm font-normal mt-1">${data.description}</span>
    `;
  });
}

function getModeConfig(mode = currentTest.mode) {
  return MODE_CONFIG[mode] || MODE_CONFIG.practice;
}

function normalizeStudentCode(code) {
  return code.trim().toUpperCase();
}

function transliterateUkText(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ь: '', ю: 'iu', я: 'ia'
  };

  return String(value || '')
    .split('')
    .map(char => map[char] ?? map[char.toLowerCase()] ?? char)
    .join('');
}

function slugifyTeacherClassName(value) {
  return transliterateUkText(String(value || '').trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function createDefaultTeacherClasses() {
  return SUPPORTED_GRADES.map(grade => ({
    id: `grade-${grade}`,
    grade,
    name: `${grade} клас`
  }));
}

function normalizeTeacherClasses(classes) {
  if (!Array.isArray(classes) || !classes.length) {
    return createDefaultTeacherClasses();
  }

  const normalized = classes
    .map(item => {
      const grade = Number(item?.grade || 0);
      const name = String(item?.name || '').trim();
      const fallbackId = grade ? `grade-${grade}` : '';
      const id = String(item?.id || slugifyTeacherClassName(name) || fallbackId).trim();
      if (!grade || !id || !name) return null;
      return { id, grade, name };
    })
    .filter(Boolean);

  return normalized.length ? normalized : createDefaultTeacherClasses();
}

function getTeacherClasses() {
  return normalizeTeacherClasses(currentUserData?.classes);
}

function buildTeacherClassRecord(grade, rawName) {
  const trimmedName = String(rawName || '').trim();
  const normalizedName = trimmedName || `${grade} клас`;
  const idBase = slugifyTeacherClassName(normalizedName) || `grade-${grade}`;
  const id = idBase.startsWith(`grade-${grade}`) ? idBase : `grade-${grade}-${idBase}`;
  return {
    id,
    grade: Number(grade),
    name: normalizedName
  };
}

function getTeacherClassById(classId) {
  return getTeacherClasses().find(item => item.id === classId) || null;
}

function getTeacherClassLabel(classId, grade = null) {
  const classItem = getTeacherClassById(classId);
  if (classItem) return classItem.name;
  return grade ? `${grade} клас` : 'Без класу';
}

async function ensureTeacherClass(grade, rawName) {
  if (!currentUser) {
    throw new Error('Потрібен акаунт учителя для створення класу.');
  }

  const nextClass = buildTeacherClassRecord(grade, rawName);
  const existingClasses = getTeacherClasses();
  const matchedClass = existingClasses.find(item => item.id === nextClass.id)
    || existingClasses.find(item => item.grade === nextClass.grade && item.name.toLowerCase() === nextClass.name.toLowerCase());

  if (matchedClass) {
    return matchedClass;
  }

  const updatedClasses = [...existingClasses, nextClass].sort((a, b) => {
    const gradeDelta = Number(a.grade || 0) - Number(b.grade || 0);
    if (gradeDelta !== 0) return gradeDelta;
    return String(a.name || '').localeCompare(String(b.name || ''), 'uk');
  });

  await updateDoc(doc(db, 'users', currentUser.uid), {
    classes: updatedClasses
  });

  currentUserData = {
    ...currentUserData,
    classes: updatedClasses
  };

  return nextClass;
}

function getStudentSessionCode() {
  return sessionStorage.getItem(STUDENT_SESSION_KEY);
}

function getOlympiadParticipantKey(grade) {
  const studentCode = currentStudentProfile?.code || getStudentSessionCode();
  if (studentCode) return `${OLYMPIAD_EVENT.eventId}_${studentCode}_grade${grade}`;
  if (currentUser?.uid) return `${OLYMPIAD_EVENT.eventId}_${currentUser.uid}_grade${grade}`;
  return null;
}

function getOlympiadParticipantMeta(grade) {
  return {
    participantKey: getOlympiadParticipantKey(grade),
    uid: auth.currentUser?.uid || currentUser?.uid || null,
    studentCode: currentStudentProfile?.code || null,
    teacherUid: currentStudentProfile?.teacherUid || null,
    classId: currentStudentProfile?.classId || null,
    className: currentStudentProfile?.className || null,
    grade
  };
}

async function getStudentProfileByCode(code) {
  if (!isFirebaseActive) {
    throw new Error('Firebase is not available.');
  }

  const normalizedCode = normalizeStudentCode(code);
  const studentRef = doc(db, 'students', normalizedCode);
  const studentSnap = await getDoc(studentRef);

  if (!studentSnap.exists()) {
    throw new Error('Код не знайдено. Перевірте правильність введення.');
  }

  const studentData = studentSnap.data();
  if (studentData.isActive === false) {
    throw new Error('Цей код тимчасово неактивний. Зверніться до вчителя.');
  }

  return {
    code: normalizedCode,
    ...studentData
  };
}

async function hasOlympiadAttempt(grade) {
  const participantKey = getOlympiadParticipantKey(grade);
  if (!participantKey || !isFirebaseActive) return false;
  const resultRef = doc(db, 'olympiad_results', participantKey);
  const resultSnap = await getDoc(resultRef);
  if (!resultSnap.exists()) return false;
  return resultSnap.data()?.invalidated !== true;
}

async function getOlympiadSession(grade) {
  const participantKey = getOlympiadParticipantKey(grade);
  if (!participantKey || !isFirebaseActive) return null;

  const sessionRef = doc(db, 'olympiad_sessions', participantKey);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    return null;
  }

  return {
    id: participantKey,
    ref: sessionRef,
    data: sessionSnap.data()
  };
}

async function createOlympiadSession(grade) {
  const session = await getOlympiadSession(grade);
  if (session) {
    if (session.data?.status === 'reset') {
      await updateDoc(session.ref, {
        status: 'started',
        startedAt: new Date().toISOString(),
        completedAt: null,
        score: null,
        totalQuestions: null,
        timeSpentSeconds: null,
        penalizedCount: null
      });
      return {
        ...session,
        data: {
          ...session.data,
          status: 'started',
          startedAt: new Date().toISOString(),
          completedAt: null
        }
      };
    }
    return session;
  }

  const meta = getOlympiadParticipantMeta(grade);
  if (!meta.participantKey) {
    throw new Error('Olympiad session requires a participant key.');
  }

  const sessionRef = doc(db, 'olympiad_sessions', meta.participantKey);
  const payload = {
    eventId: OLYMPIAD_EVENT.eventId,
    eventTitle: OLYMPIAD_EVENT.title,
    participantKey: meta.participantKey,
    uid: meta.uid,
    studentCode: meta.studentCode,
    teacherUid: meta.teacherUid,
    classId: meta.classId,
    className: meta.className,
    grade,
    status: 'started',
    startedAt: new Date().toISOString(),
    completedAt: null
  };

  await setDoc(sessionRef, payload);
  return { id: meta.participantKey, ref: sessionRef, data: payload };
}

async function completeOlympiadSession() {
  const session = await getOlympiadSession(currentTest.grade);
  if (!session?.ref) return;

  await updateDoc(session.ref, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    score: currentTest.score,
    totalQuestions: currentTest.questions.length,
    timeSpentSeconds: currentTest.timeSpentSeconds ?? 0,
    penalizedCount: penalizedQuestions.size
  });
}

async function saveOlympiadResult() {
  const meta = getOlympiadParticipantMeta(currentTest.grade);
  if (!meta.participantKey || !isFirebaseActive) {
    throw new Error('Olympiad save requires authenticated Firebase user.');
  }

  const resultRef = doc(db, 'olympiad_results', meta.participantKey);
  const answeredQuestions = currentTest.reviewData.length;
  const timeSpentSeconds = currentTest.timeSpentSeconds ?? 0;

  await setDoc(resultRef, {
    eventId: OLYMPIAD_EVENT.eventId,
    eventTitle: OLYMPIAD_EVENT.title,
    participantKey: meta.participantKey,
    uid: meta.uid,
    studentCode: meta.studentCode,
    teacherUid: meta.teacherUid,
    classId: meta.classId,
    className: meta.className,
    subject: currentTest.subject,
    grade: currentTest.grade,
    difficulty: currentTest.difficulty,
    mode: currentTest.mode,
    score: currentTest.score,
    totalQuestions: currentTest.questions.length,
    answeredQuestions,
    timeSpentSeconds,
    penalizedCount: penalizedQuestions.size,
    invalidated: false,
    invalidatedAt: null,
    completedAt: new Date().toISOString()
  });
}

async function updateStudentCodeState(code, isActive) {
  const studentRef = doc(db, 'students', code);
  await updateDoc(studentRef, {
    isActive,
    updatedAt: new Date().toISOString()
  });
}

async function resetOlympiadAttempt(participantKey) {
  const sessionRef = doc(db, 'olympiad_sessions', participantKey);
  const resultRef = doc(db, 'olympiad_results', participantKey);
  const resetAt = new Date().toISOString();

  const sessionSnap = await getDoc(sessionRef);
  if (sessionSnap.exists()) {
    await updateDoc(sessionRef, {
      status: 'reset',
      completedAt: null,
      resetAt
    });
  }

  const resultSnap = await getDoc(resultRef);
  if (resultSnap.exists()) {
    await updateDoc(resultRef, {
      invalidated: true,
      invalidatedAt: resetAt
    });
  }
}

function syncStudentGradeSelection() {
  const studentGrade = currentStudentProfile?.grade;

  ['welcome', 'dashboard'].forEach(prefix => {
    const gradeContainer = document.getElementById(`${prefix}-grade-buttons-container`);
    if (!gradeContainer) return;

    gradeContainer.querySelectorAll('.mode-btn').forEach(btn => {
      const buttonGrade = Number(btn.dataset.grade);
      const isStudentGrade = studentGrade === buttonGrade;
      btn.disabled = Boolean(studentGrade) && !isStudentGrade;
      btn.setAttribute('aria-disabled', btn.disabled ? 'true' : 'false');

      if (studentGrade) {
        btn.classList.toggle('is-active', isStudentGrade);
        btn.classList.toggle('bg-blue-500', isStudentGrade);
        btn.classList.toggle('text-white', isStudentGrade);
        btn.classList.toggle('text-blue-700', !isStudentGrade);
        btn.setAttribute('aria-pressed', isStudentGrade ? 'true' : 'false');
      } else {
        btn.classList.remove('is-active', 'bg-blue-500', 'text-white');
        btn.classList.add('text-blue-700');
        btn.setAttribute('aria-pressed', 'false');
      }
    });

    if (studentGrade) {
      selectedSetup[prefix].grade = studentGrade;
    }
  });
}

function renderStudentAccessState() {
  const statusEls = ['student-code-status', 'student-code-status-hero']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const summaryEls = ['student-code-summary', 'student-code-summary-hero']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const clearButtons = ['student-code-clear-btn', 'student-code-clear-btn-hero']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const inputs = ['student-code-input', 'student-code-input-hero']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (!statusEls.length && !summaryEls.length && !clearButtons.length && !inputs.length) return;

  if (currentStudentProfile) {
    statusEls.forEach(el => { el.textContent = ''; });
    summaryEls.forEach(el => {
      el.textContent = `Код ${currentStudentProfile.code} активовано. Клас: ${currentStudentProfile.grade}.`;
      el.classList.remove('hidden');
    });
    clearButtons.forEach(btn => btn.classList.remove('hidden'));
    inputs.forEach(input => {
      input.value = currentStudentProfile.code;
      input.setAttribute('aria-invalid', 'false');
    });
  } else {
    summaryEls.forEach(el => {
      el.textContent = '';
      el.classList.add('hidden');
    });
    clearButtons.forEach(btn => btn.classList.add('hidden'));
    inputs.forEach(input => { input.value = ''; });
  }

  syncStudentGradeSelection();
  updateModeDependentUI();
}

async function activateStudentSession(code) {
  const studentProfile = await getStudentProfileByCode(code);

  if (!auth.currentUser || !auth.currentUser.isAnonymous) {
    await signInAnonymously(auth);
  }

  sessionStorage.setItem(STUDENT_SESSION_KEY, studentProfile.code);
  currentStudentProfile = studentProfile;
  setMode('olympiad');
  renderStudentAccessState();
  showToast(`Код ${studentProfile.code} підтверджено. Можна починати олімпіаду.`, 'success');
}

async function restoreStudentSession() {
  const savedCode = getStudentSessionCode();
  if (!savedCode || !isFirebaseActive) return;

  try {
    currentStudentProfile = await getStudentProfileByCode(savedCode);
    setMode('olympiad');
  } catch (error) {
    console.warn('Failed to restore student session:', error);
    sessionStorage.removeItem(STUDENT_SESSION_KEY);
    currentStudentProfile = null;
  }
}

function clearStudentSession() {
  sessionStorage.removeItem(STUDENT_SESSION_KEY);
  currentStudentProfile = null;
  ['welcome', 'dashboard'].forEach(prefix => {
    selectedSetup[prefix].grade = null;
  });
  renderStudentAccessState();
  showToast('Вхід за кодом скасовано.', 'info');
}

function generateStudentCode() {
  const word = STUDENT_CODE_WORDS[Math.floor(Math.random() * STUDENT_CODE_WORDS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${word}-${num}`;
}

function generateOpaqueToken(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  }

  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function sanitizeStudentLabel(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40);
}

function createStudentEntriesFromInput(rawText, quickCount = 0) {
  const labels = String(rawText || '')
    .split(/\r?\n/)
    .map(item => sanitizeStudentLabel(item))
    .filter(Boolean);

  if (labels.length) {
    return labels.map(label => ({ label }));
  }

  const safeCount = Math.max(0, Math.min(40, Number(quickCount || 0)));
  return Array.from({ length: safeCount }, (_, index) => ({
    label: `Учасник ${index + 1}`
  }));
}

function buildStudentPaymentLink(student) {
  if (!student?.paymentToken) return '';

  const origin = window.location.origin || '';
  const url = new URL(PAYMENT_LINK_PATH, origin);
  url.searchParams.set('token', student.paymentToken);
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error('Nothing to copy.');
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function ensureStudentPaymentToken(student) {
  if (student?.paymentToken) return student.paymentToken;
  if (!student?.code) throw new Error('Student code is required.');

  const paymentToken = generateOpaqueToken();
  await updateDoc(doc(db, 'students', student.code), {
    paymentToken,
    paymentStatus: student.paymentStatus || 'pending',
    updatedAt: new Date().toISOString()
  });
  student.paymentToken = paymentToken;
  return paymentToken;
}

async function createUniqueStudentCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateStudentCode();
    const candidateRef = doc(db, 'students', candidate);
    const candidateSnap = await getDoc(candidateRef);
    if (!candidateSnap.exists()) {
      return candidate;
    }
  }

  throw new Error('Не вдалося згенерувати унікальний код. Спробуйте ще раз.');
}

async function createStudentRecords(grade, entries = [], classRecord = null) {
  if (!currentUser || currentUserData?.role !== 'teacher') {
    throw new Error('Генерація кодів доступна лише вчителю.');
  }

  const resolvedClass = classRecord || buildTeacherClassRecord(grade, '');
  const normalizedEntries = Array.isArray(entries) && entries.length
    ? entries
    : [{ label: 'Учасник 1' }];
  const createdCodes = [];
  for (let i = 0; i < normalizedEntries.length; i += 1) {
    const studentLabel = sanitizeStudentLabel(normalizedEntries[i]?.label) || `Учасник ${i + 1}`;
    const code = await createUniqueStudentCode();
    await setDoc(doc(db, 'students', code), {
      code,
      grade,
      classId: resolvedClass.id,
      className: resolvedClass.name,
      studentLabel,
      teacherUid: currentUser.uid,
      isActive: true,
      retryAllowed: false,
      paymentToken: generateOpaqueToken(),
      paymentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    createdCodes.push(code);
  }

  return createdCodes;
}

function populateTeacherClassControls(selectedGrade = null) {
  const classSelect = document.getElementById('teacher-code-class-select');
  const classFilter = document.getElementById('teacher-dashboard-class-filter');
  const classes = getTeacherClasses();
  const resolvedGrade = Number(selectedGrade || document.getElementById('teacher-code-grade')?.value || currentUserData?.currentGrade || SUPPORTED_GRADES[0]);
  const classesForGrade = classes.filter(item => Number(item.grade) === resolvedGrade);

  if (classSelect) {
    const previousValue = classSelect.value;
    const classNameInput = document.getElementById('teacher-code-class-name');
    classSelect.innerHTML = '';

    const newOption = document.createElement('option');
    newOption.value = NEW_CLASS_OPTION_VALUE;
    newOption.textContent = 'Створити новий клас';
    classSelect.appendChild(newOption);

    classesForGrade.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      classSelect.appendChild(option);
    });

    classSelect.value = classesForGrade.some(item => item.id === previousValue)
      ? previousValue
      : NEW_CLASS_OPTION_VALUE;

    const selectedClass = getTeacherClassById(classSelect.value);
    if (classNameInput) {
      classNameInput.value = selectedClass ? selectedClass.name : '';
      classNameInput.disabled = classSelect.value !== NEW_CLASS_OPTION_VALUE;
    }
  }

  if (classFilter) {
    const previousFilter = teacherDashboardFilters.classId;
    classFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = ALL_CLASSES_FILTER_VALUE;
    allOption.textContent = 'Усі класи';
    classFilter.appendChild(allOption);

    classes.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      classFilter.appendChild(option);
    });

    classFilter.value = classes.some(item => item.id === previousFilter)
      ? previousFilter
      : ALL_CLASSES_FILTER_VALUE;
    teacherDashboardFilters.classId = classFilter.value;
  }
}

function getTeacherDashboardViewModel() {
  const classId = teacherDashboardFilters.classId;
  const students = teacherDashboardCache.students.filter(student => {
    if (classId === ALL_CLASSES_FILTER_VALUE) return true;
    return student.classId === classId;
  });
  const results = teacherDashboardCache.results.filter(result => {
    if (classId === ALL_CLASSES_FILTER_VALUE) return true;
    return result.classId === classId;
  });

  const activeResults = results.filter(result => result.invalidated !== true);
  const completedCodes = new Set(activeResults.map(result => result.studentCode).filter(Boolean));
  const pendingStudents = students.filter(student => student.isActive !== false && !completedCodes.has(student.code));
  const unpaidStudents = students.filter(student => (student.paymentStatus || 'pending') === 'pending');

  return {
    classId,
    students,
    results,
    pendingStudents,
    unpaidStudents
  };
}

function renderTeacherDashboardLists() {
  const summaryEl = document.getElementById('teacher-dashboard-summary');
  const viewModel = getTeacherDashboardViewModel();
  const classLabel = viewModel.classId === ALL_CLASSES_FILTER_VALUE
    ? 'усіх класів'
    : getTeacherClassLabel(viewModel.classId);

  if (summaryEl) {
    summaryEl.textContent = `Показано для ${classLabel}: записів ${viewModel.students.length}, результатів ${viewModel.results.length}, ще не проходили ${viewModel.pendingStudents.length}, оплата очікується ${viewModel.unpaidStudents.length}.`;
  }

  renderTeacherStudents(viewModel.students, viewModel.pendingStudents.length);
  renderTeacherResults(viewModel.results);
}

async function loadTeacherStudents() {
  if (!currentUser) return [];
  const studentsQuery = query(collection(db, 'students'), where('teacherUid', '==', currentUser.uid));
  const snapshot = await getDocs(studentsQuery);

  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => {
      const gradeDelta = Number(a.grade || 0) - Number(b.grade || 0);
      if (gradeDelta !== 0) return gradeDelta;
      const classDelta = String(a.className || '').localeCompare(String(b.className || ''), 'uk');
      if (classDelta !== 0) return classDelta;
      const labelDelta = String(a.studentLabel || '').localeCompare(String(b.studentLabel || ''), 'uk');
      if (labelDelta !== 0) return labelDelta;
      return String(a.code || '').localeCompare(String(b.code || ''));
    });
}

async function loadTeacherOlympiadResults() {
  if (!currentUser) return [];
  const resultsQuery = query(collection(db, 'olympiad_results'), where('teacherUid', '==', currentUser.uid));
  const snapshot = await getDocs(resultsQuery);

  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
}

function renderTeacherStudents(students, pendingCount = 0) {
  const listEl = document.getElementById('teacher-student-codes-list');
  const metaEl = document.getElementById('teacher-student-codes-meta');
  if (!listEl || !metaEl) return;

  const paymentPendingCount = students.filter(student => (student.paymentStatus || 'pending') === 'pending').length;
  metaEl.textContent = students.length
    ? `Записів: ${students.length}. Ще не проходили: ${pendingCount}. Очікують оплату: ${paymentPendingCount}`
    : 'Поки що кодів немає.';

  if (!students.length) {
    listEl.innerHTML = '<p class="text-sm text-gray-500">Створіть перші коди для учнів вашого класу.</p>';
    return;
  }

  listEl.innerHTML = students.map(student => `
    <article class="border border-slate-200 rounded-lg px-4 py-3 bg-slate-50">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-700">${student.studentLabel || 'Без позначки'}</p>
          <p class="font-semibold text-slate-900">${student.code}</p>
          <p class="text-xs text-slate-500 mt-1">${student.isActive === false ? 'Неактивний код' : 'Активний код'} · ${student.className || getTeacherClassLabel(student.classId, student.grade)} · Оплата: ${student.paymentStatus === 'paid' ? 'підтверджено' : 'очікується'}</p>
        </div>
        <span class="text-sm text-slate-500">${student.grade} клас</span>
      </div>
      <div class="flex flex-wrap justify-end gap-2 mt-3">
        <button
          type="button"
          class="btn text-sm font-semibold py-2 px-3 rounded-lg bg-white text-slate-700 border border-slate-200"
          data-teacher-action="copy-code"
          data-student-code="${student.code}"
        >
          Копіювати код
        </button>
        <button
          type="button"
          class="btn text-sm font-semibold py-2 px-3 rounded-lg bg-sky-100 text-sky-800"
          data-teacher-action="copy-payment-link"
          data-student-code="${student.code}"
        >
          Посилання на оплату
        </button>
        <button
          type="button"
          class="btn text-sm font-semibold py-2 px-3 rounded-lg ${student.isActive === false ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}"
          data-teacher-action="toggle-student"
          data-student-code="${student.code}"
          data-student-active="${student.isActive === false ? 'false' : 'true'}"
        >
          ${student.isActive === false ? 'Активувати код' : 'Деактивувати код'}
        </button>
      </div>
    </article>
  `).join('');
}

function renderTeacherResults(results) {
  const listEl = document.getElementById('teacher-olympiad-results-list');
  const metaEl = document.getElementById('teacher-olympiad-results-meta');
  if (!listEl || !metaEl) return;

  if (!results.length) {
    metaEl.textContent = 'Результатів поки немає.';
    listEl.innerHTML = '<p class="text-sm text-gray-500">Коли учні завершать олімпіаду, тут з’являться їхні бали.</p>';
    return;
  }

  const activeResults = results.filter(item => item.invalidated !== true);
  const averageScore = activeResults.length
    ? (activeResults.reduce((sum, item) => sum + Number(item.score || 0), 0) / activeResults.length).toFixed(1)
    : '0.0';
  metaEl.textContent = `Активних спроб: ${activeResults.length}. Скинутих: ${results.length - activeResults.length}. Середній бал: ${averageScore}.`;

  listEl.innerHTML = results.map(result => `
    <article class="border border-slate-200 rounded-lg px-4 py-3 bg-white">
      <div class="flex items-center justify-between gap-3">
        <p class="font-semibold text-slate-900">${result.studentCode || 'Без коду'}</p>
        <span class="text-sm text-slate-500">${result.grade} клас</span>
      </div>
      <p class="text-xs text-slate-500 mt-1">${result.className || getTeacherClassLabel(result.classId, result.grade)}</p>
      <p class="text-sm text-slate-700 mt-2">Бали: ${result.score}/${result.totalQuestions}</p>
      <p class="text-xs text-slate-500 mt-1">Час: ${result.timeSpentSeconds ?? 0} с · ${result.completedAt || 'без дати'}</p>
      <p class="text-xs mt-1 ${result.invalidated ? 'text-orange-600' : 'text-slate-500'}">${result.invalidated ? 'Спробу скинуто вчителем' : 'Спроба активна'}</p>
      <div class="flex justify-end mt-3">
        <button
          type="button"
          class="btn text-sm font-semibold py-2 px-3 rounded-lg bg-amber-100 text-amber-800"
          data-teacher-action="reset-attempt"
          data-participant-key="${result.participantKey}"
          ${result.invalidated ? 'disabled aria-disabled="true"' : ''}
        >
          Скинути спробу
        </button>
      </div>
    </article>
  `).join('');
}

async function refreshTeacherDashboardData() {
  if (!currentUser || currentUserData?.role !== 'teacher' || !isFirebaseActive) return;

  const [students, results] = await Promise.all([
    loadTeacherStudents(),
    loadTeacherOlympiadResults()
  ]);

  teacherDashboardCache = { students, results };
  renderTeacherDashboardLists();
}

function findTeacherStudentByCode(code) {
  return teacherDashboardCache.students.find(student => student.code === code) || null;
}

function updateModeDependentUI() {
  hydrateModeButtons();
  ['welcome', 'dashboard'].forEach(prefix => {
    const modeConfig = getModeConfig();
    const difficultyContainer = document.getElementById(`${prefix}-difficulty-buttons-container`);
    const difficultySection = difficultyContainer?.parentElement;
    const startBtn = document.getElementById(`${prefix}-start-test-btn`);
    const subtitle = document.getElementById(`${prefix}-mode-description`);
    const modeButtons = document.querySelectorAll(`#${prefix}-container .mode-btn[data-mode]`);

    modeButtons.forEach(btn => {
      const shouldDisable = Boolean(currentStudentProfile) && btn.dataset.mode === 'practice';
      btn.disabled = shouldDisable;
      btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    });

    if (difficultySection) {
      difficultySection.classList.toggle('opacity-60', Boolean(modeConfig.difficulty));
      difficultySection.setAttribute('aria-disabled', modeConfig.difficulty ? 'true' : 'false');
    }

    if (difficultyContainer) {
      difficultyContainer.querySelectorAll('.mode-btn').forEach(btn => {
        const isForced = modeConfig.difficulty && btn.textContent.trim() === 'Складний';
        btn.disabled = Boolean(modeConfig.difficulty) && !isForced;
        btn.setAttribute('aria-disabled', btn.disabled ? 'true' : 'false');
        if (modeConfig.difficulty) {
          const isActive = btn.textContent.trim() === 'Складний';
          btn.classList.toggle('is-active', isActive);
          btn.classList.toggle('bg-blue-500', isActive);
          btn.classList.toggle('text-white', isActive);
          btn.classList.toggle('text-blue-700', !isActive);
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        }
      });
    }

    if (modeConfig.difficulty) {
      selectedSetup[prefix].difficulty = modeConfig.difficulty;
    }

    if (startBtn) {
      startBtn.textContent = modeConfig.startButtonLabel;
      const selectedDifficulty = selectedSetup[prefix].difficulty || modeConfig.difficulty;
      const isDisabled = !(selectedSetup[prefix].grade && selectedDifficulty);
      startBtn.disabled = isDisabled;
      startBtn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    }

    if (subtitle) {
      if (currentTest.mode === 'practice') {
        subtitle.textContent = 'Обери клас та рівень складності, щоб почати тренування.';
      } else if (currentTest.mode === 'exam') {
        subtitle.textContent = 'Демо-версія використовує складний рівень і допомагає спокійно спробувати формат олімпіади.';
      } else {
        subtitle.textContent = 'Основна олімпіада використовує складний рівень і зберігає офіційний результат. Повторна спроба для активної події блокується.';
      }
    }
  });
}

function showInfoModal(title, text) {
  const titleEl = document.getElementById('info-title');
  const textEl = document.getElementById('info-text');
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.innerHTML = text;
  showModal(infoModal);
}

window.addEventListener('beforeunload',(event)=>{
  if(activeTestSessionId){
    event.preventDefault();
    event.returnValue = '';
  }
});

// --- AUTH & DATA SYNC ---

function setupAuthListener(){
  onAuthStateChanged(auth, async (user)=>{
    if(unsubscribeUserDataListener) unsubscribeUserDataListener();
    const hasStudentSession = Boolean(getStudentSessionCode());

    if (user?.isAnonymous && hasStudentSession) {
      currentUser = user;
      await restoreStudentSession();
      showScreen('welcome');
      renderStudentAccessState();
      return;
    }

    if(user && !user.isAnonymous){
      if (getStudentSessionCode()) {
        sessionStorage.removeItem(STUDENT_SESSION_KEY);
        currentStudentProfile = null;
      }
      if (!user.emailVerified) {
        showScreen('welcome');
        showInfoModal( 'Акаунт не активовано', 'Будь ласка, перевірте свою пошту та перейдіть за посиланням для підтвердження.' );
        signOut(auth);
        currentUser = null;
        currentUserData = null;
      } else {
        currentUser = user;
        listenToUserData(user.uid);
        await trySyncOfflineScores();
        showScreen('dashboard');
      }
    }else{
      currentUser = null;
      currentUserData = null;
      if (!hasStudentSession) {
        setMode('practice');
      }
      showScreen('welcome');
      renderStudentAccessState();
    }
  });
}

function listenToUserData(userId){
  const userDocRef = doc(db, 'users', userId);
  unsubscribeUserDataListener = onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      currentUserData = docSnap.data();
      if (!currentUserData.role) {
        currentUserData.role = 'teacher';
        updateDoc(userDocRef, { role: 'teacher' }).catch(e => console.error('Error backfilling teacher role:', e));
      }
      if (!Array.isArray(currentUserData.classes) || currentUserData.classes.length === 0) {
        currentUserData.classes = createDefaultTeacherClasses();
        updateDoc(userDocRef, { classes: currentUserData.classes }).catch(e => console.error('Error backfilling teacher classes:', e));
      } else {
        currentUserData.classes = normalizeTeacherClasses(currentUserData.classes);
      }
      updateDashboard();
    } else {
      // Цей блок спрацює тільки один раз для нового користувача Google Sign-In
      const newUserData = {
        role: 'teacher',
        email: currentUser.email,
        currentGrade: 4, // Клас за замовчуванням
        totalScore: 0,
        badges: [],
        progress: {},
        classes: createDefaultTeacherClasses()
      };
      setDoc(userDocRef, newUserData).catch(e => console.error('Error creating user doc:', e));
      currentUserData = newUserData;
      updateDashboard();
    }
  }, (error) => {
    console.error('Error listening to user data:', error);
    showToast('Помилка синхронізації профілю.');
  });
}

// ✅ ОНОВЛЕНА ФУНКЦІЯ ЗБЕРЕЖЕННЯ РАХУНКУ
async function saveScore(score, subject, grade) {
    if (!currentUser || !isFirebaseActive) return;
    const userDocRef = doc(db, 'users', currentUser.uid);

    const updates = {
        totalScore: increment(score),
        [`progress.${subject}.grade${grade}`]: increment(score)
    };

    try {
        await updateDoc(userDocRef, updates);
    } catch (error) {
        console.error('Failed to save score:', error);
        showToast('Помилка збереження. Результат збережено локально.');
        saveScoreOffline(score, subject, grade);
    }
}

function saveScoreOffline(score, subject, grade){
  const offlineScores = JSON.parse(localStorage.getItem('offlineScores')||'[]');
  offlineScores.push({ score, subject, grade, timestamp: Date.now() });
  if (offlineScores.length > MAX_OFFLINE_SCORES) {
    offlineScores.splice(0, offlineScores.length - MAX_OFFLINE_SCORES);
  }
  localStorage.setItem('offlineScores',JSON.stringify(offlineScores));
}

async function trySyncOfflineScores(){
  const q = JSON.parse(localStorage.getItem('offlineScores')||'[]');
  if(q.length===0 || !isFirebaseActive || !currentUser) return;
  showToast(`Синхронізація ${q.length} незбережених результатів...`,'info');
  const pending = [];
  for(const item of q){
    try{ await saveScore(item.score, item.subject, item.grade); }
    catch{ pending.push(item); }
  }
  localStorage.setItem('offlineScores',JSON.stringify(pending));
  if(q.length>0 && pending.length===0) showToast('Синхронізацію завершено!','success');
  else if(pending.length>0) showToast(`Не вдалося синхронізувати ${pending.length} результат(и).`,'error');
}

// ✅ ПОВНІСТЮ ОНОВЛЕНА ФУНКЦІЯ ДЛЯ ВІДОБРАЖЕННЯ ДАНИХ У КАБІНЕТІ
function updateDashboard() {
    if (!currentUserData || !currentUser) return;
    const isTeacherUser = currentUserData.role === 'teacher';

    const emailDisplay = document.getElementById('user-email-display');
    if (emailDisplay) {
        emailDisplay.textContent = currentUser.email;
    }

    const totalScoreEl = document.getElementById('total-score');
    if (totalScoreEl) {
        totalScoreEl.textContent = currentUserData.totalScore || 0;
    }

    const gradeSelector = document.getElementById('user-grade-selector');
    const userGrade = SUPPORTED_GRADES.includes(currentUserData.currentGrade)
        ? currentUserData.currentGrade
        : SUPPORTED_GRADES[0];

    if (gradeSelector) {
        gradeSelector.innerHTML = '';
        SUPPORTED_GRADES.forEach(gradeValue => {
            const option = document.createElement('option');
            option.value = gradeValue;
            option.textContent = `${gradeValue} клас`;
            if (gradeValue === userGrade) {
                option.selected = true;
            }
            gradeSelector.appendChild(option);
        });
    }

    const progressContainer = document.getElementById('progress-details-container');
    if (progressContainer) {
        progressContainer.innerHTML = '';
        const heading = document.createElement('p');
        heading.className = 'text-xs font-semibold uppercase text-gray-500 tracking-wider';
        heading.textContent = `Прогрес за ${userGrade} клас`;
        progressContainer.appendChild(heading);

        const subjects = { informatics: 'Інформатика' };

        Object.entries(subjects).forEach(([subjectId, subjectName]) => {
            const gradeScore = currentUserData.progress?.[subjectId]?.[`grade${userGrade}`] || 0;
            const progressItem = document.createElement('div');
            const progressValue = Math.min(100, (gradeScore / 200) * 100);
            progressItem.className = 'progress-card';
            progressItem.innerHTML = `
                <div class="progress-meta">
                    <span>${subjectName}</span>
                    <span>${gradeScore} балів</span>
                </div>
                <div class="w-full bg-slate-100 rounded-full h-2.5" aria-hidden="true">
                    <div class="bg-blue-500 h-2.5 rounded-full" style="width: ${progressValue}%"></div>
                </div>
            `;
            progressContainer.appendChild(progressItem);
        });
    }

    const badgesContainer = document.getElementById('badges-container');
    if (badgesContainer) {
        badgesContainer.innerHTML = '';
        badgesContainer.setAttribute('role', 'list');
        const badgeSubjectLabels = {
            informatics: 'Інформатика',
            total: 'Усі предмети'
        };

        if (currentUserData.badges && currentUserData.badges.length > 0) {
            currentUserData.badges.forEach(badgeId => {
                const badge = badges[badgeId];
                if (badge) {
                    const el = document.createElement('article');
                    el.className = 'badge-card';
                    el.dataset.subject = badge.subject;
                    el.setAttribute('role', 'listitem');
                    el.innerHTML = `
                        <div class="badge-icon" aria-hidden="true"><i class="${badge.icon}"></i></div>
                        <div class="badge-meta">
                            <p class="badge-title">${badge.name}</p>
                            <p class="badge-label">${badgeSubjectLabels[badge.subject] || 'Нагорода'}</p>
                        </div>
                        <span class="badge-score">${badge.score} балів</span>
                    `;
                    badgesContainer.appendChild(el);
                }
            });
        } else {
            const emptyState = document.createElement('p');
            emptyState.className = 'badge-empty';
            emptyState.textContent = 'Поки що немає нагород. Продовжуй тренуватися, щоб отримати перші значки.';
            badgesContainer.appendChild(emptyState);
        }
    }

    const teacherPanel = document.getElementById('teacher-tools-panel');
    if (teacherPanel) {
        teacherPanel.classList.toggle('hidden', !isTeacherUser);
    }

    const teacherCodeGrade = document.getElementById('teacher-code-grade');
    if (teacherCodeGrade && teacherCodeGrade.options.length === 0) {
        SUPPORTED_GRADES.forEach(gradeValue => {
            const option = document.createElement('option');
            option.value = gradeValue;
            option.textContent = `${gradeValue} клас`;
            if (gradeValue === userGrade) {
                option.selected = true;
            }
            teacherCodeGrade.appendChild(option);
        });
    }

    if (teacherCodeGrade) {
        teacherCodeGrade.value = String(userGrade);
    }

    populateTeacherClassControls(userGrade);

    if (isTeacherUser) {
        refreshTeacherDashboardData().catch(error => {
            console.error('Failed to refresh teacher dashboard:', error);
            showToast('Не вдалося оновити дані кабінету вчителя.', 'error');
        });
    }
}


function shuffleArray(array){
  let currentIndex = array.length, randomIndex;
  while(currentIndex>0){
    randomIndex = Math.floor(Math.random()*currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

// --- TEST LOGIC ---

async function loadQuestions(subject, grade) {
  const path = `./data/questions/${subject}/grade${grade}.js`;
  try {
    const module = await import(path);
    return module.questions;
  } catch (error) {
    console.error(`Не вдалося завантажити питання: ${path}`, error);
    showToast('На жаль, для обраних налаштувань ще немає питань.', 'error');
    return null;
  }
}

async function startTest(subject, grade, difficulty, triggerButton) {
    const newTestSessionId = Date.now();
    penalizedQuestions.clear();
    const modeConfig = getModeConfig();
    const resolvedDifficulty = modeConfig.difficulty || difficulty;
    const resolvedGrade = currentStudentProfile?.grade || grade;
    const questionsCount = modeConfig.questionsCount;

    const loadingButton = triggerButton ?? document.querySelector(`.start-test-btn[data-subject="${subject}"]`);
    setLoadingState(loadingButton, true);

    try {
        const isOlympiadFlow = ['exam', 'olympiad'].includes(currentTest.mode);

        if (isOlympiadFlow) {
            if (!currentStudentProfile) {
                showInfoModal('Потрібен код учня', 'Для участі в олімпіаді введіть код доступу, який видав учитель.');
                return false;
            }
        }

        if (currentTest.mode === 'olympiad') {
            const olympiadSession = await getOlympiadSession(resolvedGrade);
            const hasResult = await hasOlympiadAttempt(resolvedGrade);
            const sessionLocked = Boolean(olympiadSession && ['started', 'completed'].includes(olympiadSession.data?.status));

            if (!modeConfig.allowRetry && (sessionLocked || hasResult)) {
                const lockedReason = olympiadSession?.data?.status === 'started'
                  ? 'Сесію вже було розпочато, тому повторний вхід заблоковано.'
                  : 'Спробу вже завершено.';
                showInfoModal('Спробу вже використано', `${lockedReason} Для події "${OLYMPIAD_EVENT.title}" повторний запуск для ${resolvedGrade} класу вже недоступний.`);
                return false;
            }
        }

        const questionsForTest = await loadQuestions(subject, resolvedGrade);

        if (!questionsForTest) {
            return false;
        }

        const filteredQuestions = questionsForTest.filter(q => q.difficulty === resolvedDifficulty);

        if (filteredQuestions.length < questionsCount) {
            showToast(`На жаль, для рівня "${resolvedDifficulty}" недостатньо питань.`, 'info');
            return false;
        }

        currentTest.subject = subject;
        currentTest.grade = resolvedGrade;
        currentTest.difficulty = resolvedDifficulty;
        currentTest.questions = shuffleArray([...filteredQuestions]).slice(0, questionsCount);
        currentTest.currentIndex = 0;
        currentTest.score = 0;
        currentTest.reviewData = [];
        currentTest.startedAt = Date.now();

        document.getElementById('test-title').textContent = { informatics: 'Інформатика' }[subject] || 'Інформатика';
        document.getElementById('total-questions-num').textContent = currentTest.questions.length;
        document.getElementById('current-question-num').textContent = 0;
        document.getElementById('progress-bar').style.width = '0%';

        const modeIndicator = document.getElementById('test-mode-indicator');
        modeIndicator.textContent = modeConfig.label;
        modeIndicator.className = `text-xs sm:text-sm font-semibold px-3 py-1 rounded-full ml-3 ${modeConfig.requiresFullscreen ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`;

        showScreen('test');
        displayQuestion();

        activeTestSessionId = newTestSessionId;

        if (currentTest.mode === 'olympiad') {
            await createOlympiadSession(resolvedGrade);
        }

        if (modeConfig.timeMinutes) {
            if (timerApi) {
              timerApi.setDuration(modeConfig.timeMinutes);
              timerApi.start();
            }
        } else {
            const timerDisplay = document.getElementById('timer-display');
            if (timerDisplay) {
              timerDisplay.classList.add('hidden');
              timerDisplay.classList.remove('flex');
            }
        }

        if (modeConfig.requiresFullscreen) {
            enterExamLockdown();
        } else {
            exitExamLockdown();
        }

        return true;
    } finally {
        setLoadingState(loadingButton, false);
    }
}

let selectedSetup = {
  welcome: { grade: null, difficulty: null },
  dashboard: { grade: null, difficulty: null }
};

function initSelectors(prefix) {
  const gradeContainer = document.getElementById(`${prefix}-grade-buttons-container`);
  const difficultyContainer = document.getElementById(`${prefix}-difficulty-buttons-container`);
  const startBtn = document.getElementById(`${prefix}-start-test-btn`);
  
  if (!gradeContainer || !difficultyContainer || !startBtn) return;
  
  function checkSelections() {
    const modeConfig = getModeConfig();
    const selectedDifficulty = selectedSetup[prefix].difficulty || modeConfig.difficulty;
    const isDisabled = !(selectedSetup[prefix].grade && selectedDifficulty);
    startBtn.disabled = isDisabled;
    startBtn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  }
  
  gradeContainer.innerHTML = '';
  SUPPORTED_GRADES.forEach(grade => {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-3 px-4 border border-blue-200 rounded-lg transition w-full';
    button.textContent = `${grade} клас`;
    button.dataset.grade = grade;
    button.type = 'button';
    button.setAttribute('aria-pressed','false');
    
    button.onclick = () => {
      selectedSetup[prefix].grade = grade;
      gradeContainer.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('is-active', 'bg-blue-500', 'text-white');
        btn.classList.add('text-blue-700');
        btn.setAttribute('aria-pressed','false');
      });
      button.classList.add('is-active', 'bg-blue-500', 'text-white');
      button.classList.remove('text-blue-700');
      button.setAttribute('aria-pressed','true');
      checkSelections();
    };
    gradeContainer.appendChild(button);
  });
  
  const difficulties = [
      { id: 'easy', name: 'Легкий' },
      { id: 'medium', name: 'Середній' },
      { id: 'hard', name: 'Складний' }
  ];
  
  difficultyContainer.innerHTML = '';
  
  difficulties.forEach((diff) => {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-3 px-4 border border-blue-200 rounded-lg transition w-full';
    button.type = 'button';
    button.setAttribute('aria-pressed','false');
    button.textContent = diff.name;
    
    button.onclick = () => {
      selectedSetup[prefix].difficulty = diff.id;
      difficultyContainer.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('is-active', 'bg-blue-500', 'text-white');
        btn.classList.add('text-blue-700');
        btn.setAttribute('aria-pressed','false');
      });
      button.classList.add('is-active', 'bg-blue-500', 'text-white');
      button.classList.remove('text-blue-700');
      button.setAttribute('aria-pressed','true');
      checkSelections();
    };
    difficultyContainer.appendChild(button);
  });
  
  startBtn.onclick = async () => {
    const modeConfig = getModeConfig();
    const selectedDifficulty = selectedSetup[prefix].difficulty || modeConfig.difficulty;

    if (!(selectedSetup[prefix].grade && selectedDifficulty)) return;
    setLoadingState(startBtn, true);
    try {
      await startTest('informatics', Number(selectedSetup[prefix].grade), selectedDifficulty, startBtn);
    } finally {
      setLoadingState(startBtn, false);
    }
  };
}

function displayQuestion(){ renderQuestion(currentTest, optionsContainer, radioKeyHandler); }

function updateProgressUI(){ renderProgress(currentTest); }

function nextQuestion(){
  currentTest.currentIndex++;
  if(currentTest.currentIndex < currentTest.questions.length){
    displayQuestion();
  }else{
    endTest();
  }
}

async function endTest(timedOut=false){
  exitExamLockdown(true);
  activeTestSessionId = null;
  if(timerApi) timerApi.stop();
  const modeConfig = getModeConfig();
  const elapsedSeconds = currentTest.startedAt ? Math.max(0, Math.round((Date.now() - currentTest.startedAt) / 1000)) : null;

  const timerMinutes = document.getElementById('timer-minutes');
  const timerSeconds = document.getElementById('timer-seconds');
  if(timerMinutes) timerMinutes.textContent = String(modeConfig.timeMinutes || 5);
  if(timerSeconds) timerSeconds.textContent = '00';

  const resultsTitle = document.getElementById('results-title');
  if (resultsTitle) {
    resultsTitle.textContent = currentTest.mode === 'olympiad' ? 'Результат олімпіади' : 'Чудовий результат!';
  }

  showModal(resultsModal);
  document.getElementById('results-score').textContent = currentTest.score;
  document.getElementById('results-total').textContent = currentTest.questions.length;
  document.getElementById('time-up-message').classList.toggle('hidden', !timedOut);

  currentTest.timeSpentSeconds = elapsedSeconds;

  const canPersistOlympiad = currentTest.mode === 'olympiad' && isFirebaseActive && Boolean(currentStudentProfile || auth.currentUser);

  if (canPersistOlympiad) {
    document.getElementById('guest-prompt').classList.add('hidden');
    try {
      await saveOlympiadResult();
      await completeOlympiadSession();
    } catch (error) {
      console.error('Failed to persist olympiad result:', error);
      showToast('Не вдалося зберегти результат олімпіади у хмарі.', 'error');
    }
  } else if(currentUser && isFirebaseActive && !currentUser.isAnonymous){
    document.getElementById('guest-prompt').classList.add('hidden');
    try {
      await saveScore(currentTest.score, currentTest.subject, currentTest.grade);
    } catch (error) {
      console.error('Failed to persist result:', error);
      showToast('Не вдалося зберегти результат у хмарі.', 'error');
    }
  }else{
    document.getElementById('guest-prompt').classList.remove('hidden');
    saveScoreOffline(currentTest.score, currentTest.subject, currentTest.grade);
  }
}

function showReview(){ renderReview(currentTest, { resultsModal, reviewModal, showModal, hideModal }); }

function radioKeyHandler(e){
  const radios = [...optionsContainer.querySelectorAll('.option-btn[role="radio"]')];
  if(radios.length===0) return;
  let i = radios.indexOf(document.activeElement);
  if(e.key==='ArrowDown' || e.key==='ArrowRight'){
    i = (i+1+radios.length)%radios.length; radios[i].focus(); e.preventDefault();
  }else if(e.key==='ArrowUp' || e.key==='ArrowLeft'){
    i = (i-1+radios.length)%radios.length; radios[i].focus(); e.preventDefault();
  }else if(e.key===' ' || e.key==='Enter'){
    if(document.activeElement && document.activeElement.classList.contains('option-btn')){
      document.activeElement.click(); e.preventDefault();
    }
  }
}

function enterExamLockdown() {
  const element = document.documentElement;
  if (element.requestFullscreen) {
    element.requestFullscreen().catch(err => {
      console.warn(`Помилка входу в повноекранний режим: ${err.message}`);
    });
  }
  window.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('fullscreenchange', handleVisibilityChange);
}

function exitExamLockdown(forceExitFullscreen = false) {
  window.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('fullscreenchange', handleVisibilityChange);
  isLockdownWarningActive = false;
  if (forceExitFullscreen && document.fullscreenElement) {
    document.exitFullscreen();
  }
}

function handleVisibilityChange() {
  if (!activeTestSessionId || !getModeConfig().requiresFullscreen || isLockdownWarningActive) {
    return;
  }
  if (!document.fullscreenElement || document.hidden) {
    const questionAnswered = currentTest.reviewData.length > currentTest.currentIndex;

    if (!questionAnswered) {
      if (!penalizedQuestions.has(currentTest.currentIndex)) {
          penalizedQuestions.add(currentTest.currentIndex);
          showToast('Питання не буде зараховано через вихід з режиму іспиту.', 'error');
      }
    }

    isLockdownWarningActive = true;
    if (timerApi) timerApi.pause();
    showLockdownWarning();
  }
}

function showLockdownWarning() {
  const title = document.getElementById('confirmation-title');
  const text = document.getElementById('confirmation-text');
  const confirmBtn = document.getElementById('confirm-action-btn');
  const cancelBtn = document.getElementById('cancel-action-btn');

  title.textContent = "Тест призупинено!";
  text.innerHTML = "Ви вийшли з режиму тестування. Щоб продовжити, поверніться до повноекранного режиму.<br><br><b>Якщо ви не повернетесь, тест буде завершено.</b>";
  confirmBtn.textContent = "Завершити тест";
  cancelBtn.textContent = "Повернутись до тесту";

  showModal(confirmationModal);

  confirmBtn.onclick = () => {
    hideModal(confirmationModal);
    exitExamLockdown();
    endTest(false);
  };

  cancelBtn.onclick = () => {
    hideModal(confirmationModal);
    isLockdownWarningActive = false;
    document.documentElement.requestFullscreen().then(() => {
        if (timerApi) timerApi.resume();
    }).catch(() => {
        showLockdownWarning();
    });
  };
}

const getAuthErrorMessage = (code)=>{
  switch(code){
    case 'auth/wrong-password': return 'Неправильний пароль.';
    case 'auth/user-not-found': return 'Користувача не знайдено.';
    case 'auth/email-already-in-use': return 'Ця пошта вже зареєстрована.';
    case 'auth/weak-password': return 'Пароль має містити > 5 символів.';
    case 'auth/popup-closed-by-user': return 'Вікно входу було закрито.';
    default: return 'Виникла помилка. Спробуйте пізніше.';
  }
};

function setupEventListeners(){
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const studentCodeForm = document.getElementById('student-code-form');
  const studentCodeInput = document.getElementById('student-code-input');
  const studentCodeClearBtn = document.getElementById('student-code-clear-btn');
  const studentCodeStatus = document.getElementById('student-code-status');
  const studentCodeHeroForm = document.getElementById('student-code-form-hero');
  const studentCodeHeroInput = document.getElementById('student-code-input-hero');
  const studentCodeHeroClearBtn = document.getElementById('student-code-clear-btn-hero');
  const studentCodeHeroStatus = document.getElementById('student-code-status-hero');
  const teacherCodeGeneratorForm = document.getElementById('teacher-code-generator-form');
  const teacherCodeGeneratorStatus = document.getElementById('teacher-code-generator-status');
  const teacherStudentBulkInput = document.getElementById('teacher-student-bulk-input');
  const teacherQuickCountInput = document.getElementById('teacher-quick-count');
  const teacherCodeGradeSelect = document.getElementById('teacher-code-grade');
  const teacherCodeClassSelect = document.getElementById('teacher-code-class-select');
  const teacherCodeClassNameInput = document.getElementById('teacher-code-class-name');
  const teacherDashboardClassFilter = document.getElementById('teacher-dashboard-class-filter');
  const teacherStudentsList = document.getElementById('teacher-student-codes-list');
  const teacherResultsList = document.getElementById('teacher-olympiad-results-list');
  const googleSigninBtn = document.getElementById('google-signin-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const backToMainBtn = document.getElementById('back-to-main-btn');
  const saveProgressBtn = document.getElementById('save-progress-btn');
  const toggleAuthLink = document.getElementById('toggle-auth');
  const showLoginBtn = document.getElementById('show-login-btn');
  const showLoginHeroBtn = document.getElementById('show-login-hero-btn');
  const backToWelcomeBtn = document.getElementById('back-to-welcome-btn');
  const nextQuestionBtn = document.getElementById('next-question-btn');
  const quitTestBtn = document.getElementById('quit-test-btn');
  const reviewAnswersBtn = document.getElementById('review-answers-btn');
  const closeReviewBtn = document.getElementById('close-review-btn');
  const infoOkBtn = document.getElementById('info-ok-btn');
  const registerGradeSelect = document.getElementById('register-grade');

  if (registerGradeSelect) {
    SUPPORTED_GRADES.forEach(gradeValue => {
      const option = document.createElement('option');
      option.value = gradeValue;
      option.textContent = `${gradeValue} клас`;
      registerGradeSelect.appendChild(option);
    });
  }

  const registerPasswordInput = document.getElementById('register-password');
  if (registerPasswordInput) {
    registerPasswordInput.addEventListener('input', (e) => {
      showPasswordStrength(e.target.value, 'register-password-strength');
    });
  }

  const attachStudentCodeSubmit = (form, input, statusEl, submitButtonId) => {
    if (!form || !input || !statusEl) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl.textContent = '';
      input.setAttribute('aria-invalid', 'false');

      const rawCode = input.value;
      if (!rawCode.trim()) {
        statusEl.textContent = 'Введіть код учня.';
        input.setAttribute('aria-invalid', 'true');
        return;
      }

      const submitButton = document.getElementById(submitButtonId);
      setLoadingState(submitButton, true);
      try {
        await activateStudentSession(rawCode);
      } catch (error) {
        console.error('Student code sign-in failed:', error);
        statusEl.textContent = error.message || 'Не вдалося активувати код.';
        input.setAttribute('aria-invalid', 'true');
      } finally {
        setLoadingState(submitButton, false);
      }
    });
  };

  const attachStudentCodeClear = (button, input, statusEl) => {
    if (!button) return;

    button.addEventListener('click', () => {
      clearStudentSession();
      if (statusEl) statusEl.textContent = '';
      if (input) {
        input.focus();
        input.setAttribute('aria-invalid', 'false');
      }
      setMode('practice');
    });
  };

  attachStudentCodeSubmit(studentCodeForm, studentCodeInput, studentCodeStatus, 'student-code-submit-btn');
  attachStudentCodeSubmit(studentCodeHeroForm, studentCodeHeroInput, studentCodeHeroStatus, 'student-code-submit-btn-hero');
  attachStudentCodeClear(studentCodeClearBtn, studentCodeInput, studentCodeStatus);
  attachStudentCodeClear(studentCodeHeroClearBtn, studentCodeHeroInput, studentCodeHeroStatus);

  if (teacherCodeGeneratorForm && teacherCodeGeneratorStatus) {
    teacherCodeGeneratorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      teacherCodeGeneratorStatus.textContent = '';

      const grade = Number(teacherCodeGradeSelect?.value || 0);
      const fallbackCount = Number(document.getElementById('teacher-code-count')?.value || 1);
      const quickCount = Number(teacherQuickCountInput?.value || 0) || fallbackCount;
      const selectedClassId = teacherCodeClassSelect?.value || NEW_CLASS_OPTION_VALUE;
      const rawClassName = teacherCodeClassNameInput?.value || '';
      const entries = createStudentEntriesFromInput(teacherStudentBulkInput?.value || '', quickCount);
      const submitButton = document.getElementById('teacher-code-generate-btn');

      if (!grade) {
        teacherCodeGeneratorStatus.textContent = 'Оберіть клас для генерації кодів.';
        return;
      }

      if (!entries.length) {
        teacherCodeGeneratorStatus.textContent = 'Додайте хоча б один запис учня або вкажіть кількість порожніх записів.';
        return;
      }

      setLoadingState(submitButton, true);
      try {
        const selectedClass = selectedClassId !== NEW_CLASS_OPTION_VALUE ? getTeacherClassById(selectedClassId) : null;
        const classRecord = selectedClass || await ensureTeacherClass(grade, rawClassName);
        const codes = await createStudentRecords(grade, entries, classRecord);
        teacherCodeGeneratorStatus.textContent = `Створено ${codes.length} запис(ів) для ${classRecord.name}: ${codes.join(', ')}`;
        teacherCodeGeneratorStatus.className = 'text-sm mt-3 text-emerald-700';
        if (teacherCodeClassNameInput) {
          teacherCodeClassNameInput.value = '';
        }
        if (teacherStudentBulkInput) {
          teacherStudentBulkInput.value = '';
        }
        if (teacherQuickCountInput) {
          teacherQuickCountInput.value = '0';
        }
        populateTeacherClassControls(grade);
        await refreshTeacherDashboardData();
      } catch (error) {
        console.error('Failed to generate student codes:', error);
        teacherCodeGeneratorStatus.textContent = error.message || 'Не вдалося згенерувати коди.';
        teacherCodeGeneratorStatus.className = 'text-sm mt-3 text-red-600';
      } finally {
        setLoadingState(submitButton, false);
      }
    });
  }

  if (teacherCodeGradeSelect) {
    teacherCodeGradeSelect.addEventListener('change', () => {
      populateTeacherClassControls(Number(teacherCodeGradeSelect.value));
    });
  }

  if (teacherCodeClassSelect && teacherCodeClassNameInput) {
    teacherCodeClassSelect.addEventListener('change', () => {
      const selectedClass = getTeacherClassById(teacherCodeClassSelect.value);
      teacherCodeClassNameInput.value = selectedClass ? selectedClass.name : '';
      teacherCodeClassNameInput.disabled = teacherCodeClassSelect.value !== NEW_CLASS_OPTION_VALUE;
    });
  }

  if (teacherDashboardClassFilter) {
    teacherDashboardClassFilter.addEventListener('change', () => {
      teacherDashboardFilters.classId = teacherDashboardClassFilter.value || ALL_CLASSES_FILTER_VALUE;
      renderTeacherDashboardLists();
    });
  }

  if (teacherStudentsList) {
    teacherStudentsList.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('[data-teacher-action]');
      if (!actionBtn) return;

      const action = actionBtn.dataset.teacherAction;
      const code = actionBtn.dataset.studentCode;

      if (action === 'copy-code') {
        try {
          await copyTextToClipboard(code);
          showToast(`Код ${code} скопійовано.`, 'success');
        } catch (error) {
          console.error('Failed to copy student code:', error);
          showToast('Не вдалося скопіювати код.', 'error');
        }
        return;
      }

      if (action === 'copy-payment-link') {
        setLoadingState(actionBtn, true);
        try {
          const student = findTeacherStudentByCode(code);
          const paymentToken = await ensureStudentPaymentToken(student || { code });
          const paymentLink = buildStudentPaymentLink({ ...(student || {}), code, paymentToken });
          await copyTextToClipboard(paymentLink);
          showToast('Платіжне посилання скопійовано.', 'success');
          await refreshTeacherDashboardData();
        } catch (error) {
          console.error('Failed to copy payment link:', error);
          showToast('Не вдалося підготувати платіжне посилання.', 'error');
        } finally {
          setLoadingState(actionBtn, false);
        }
        return;
      }

      if (action === 'toggle-student') {
        const isCurrentlyActive = actionBtn.dataset.studentActive === 'true';
        setLoadingState(actionBtn, true);
        try {
          await updateStudentCodeState(code, !isCurrentlyActive);
          showToast(isCurrentlyActive ? 'Код деактивовано.' : 'Код знову активний.', 'success');
          await refreshTeacherDashboardData();
        } catch (error) {
          console.error('Failed to toggle student code state:', error);
          showToast('Не вдалося оновити стан коду.', 'error');
        } finally {
          setLoadingState(actionBtn, false);
        }
      }
    });
  }

  if (teacherResultsList) {
    teacherResultsList.addEventListener('click', async (e) => {
      const actionBtn = e.target.closest('[data-teacher-action="reset-attempt"]');
      if (!actionBtn || actionBtn.disabled) return;

      const participantKey = actionBtn.dataset.participantKey;
      setLoadingState(actionBtn, true);
      try {
        await resetOlympiadAttempt(participantKey);
        showToast('Спробу скинуто. Учень може пройти олімпіаду повторно.', 'success');
        await refreshTeacherDashboardData();
      } catch (error) {
        console.error('Failed to reset olympiad attempt:', error);
        showToast('Не вдалося скинути спробу.', 'error');
      } finally {
        setLoadingState(actionBtn, false);
      }
    });
  }

  if (isFirebaseActive && registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitButton = registerForm.querySelector('button[type="submit"]');
      const email = registerForm.querySelector('#register-email').value;
      const password = registerForm.querySelector('#register-password').value;
      const grade = registerForm.querySelector('#register-grade').value;
      
      showValidationErrors([], 'register-validation-errors');
      document.getElementById('auth-error').textContent = '';

      if (!grade) {
        showValidationErrors(['Будь ласка, оберіть ваш клас'], 'register-validation-errors');
        return;
      }
      
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        showValidationErrors(emailValidation.errors, 'register-validation-errors');
        return;
      }
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        showValidationErrors(passwordValidation.errors, 'register-validation-errors');
        return;
      }

      setLoadingState(submitButton, true);
      try {
        if (recaptchaService) {
          await recaptchaService.getToken('register');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const newUserData = {
            role: 'teacher',
            email: email,
            currentGrade: parseInt(grade),
            totalScore: 0,
            badges: [],
            progress: {},
            classes: createDefaultTeacherClasses()
        };
        await setDoc(userDocRef, newUserData);
        
        await sendEmailVerification(userCredential.user);
        showInfoModal('Підтвердження реєстрації', 'Ми відправили вам лист для підтвердження. Будь ласка, перейдіть за посиланням у ньому, щоб активувати акаунт.');
      } catch (error) {
        console.error('Помилка реєстрації:', error);
        document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
        if (recaptchaService) {
          recaptchaService.reset();
        }
      } finally {
        setLoadingState(submitButton, false);
      }
    });
  }

  if (isFirebaseActive && loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('#login-email').value;
        const password = form.querySelector('#login-password').value;
        const submitButton = form.querySelector('button[type="submit"]');
        showValidationErrors([], 'login-validation-errors');
        document.getElementById('auth-error').textContent = '';
        const emailValidation = validateEmail(email);
        if (!emailValidation.isValid) {
            showValidationErrors(emailValidation.errors, 'login-validation-errors');
            return;
        }
        if (!password || password.length < 6) {
            showValidationErrors(['Пароль має містити щонайменше 6 символів'], 'login-validation-errors');
            return;
        }
        setLoadingState(submitButton, true);
        try {
            if (recaptchaService) {
              await recaptchaService.getToken('login');
            }
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Ви успішно увійшли!', 'success');
        } catch (error) {
            console.error('Помилка входу:', error);
            document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
            if (recaptchaService) {
              recaptchaService.reset();
            }
        } finally {
            setLoadingState(submitButton, false);
        }
    });
  }

  if (isFirebaseActive && googleSigninBtn) {
    googleSigninBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        document.getElementById('auth-error').textContent = '';
        setLoadingState(googleSigninBtn, true);
        try {
            if (recaptchaService) {
              await recaptchaService.getToken('google_signin');
            }
            await signInWithPopup(auth, provider);
            showToast('Ви успішно увійшли через Google!', 'success');
        } catch (error) {
            console.error('Помилка входу через Google:', error);
            document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
            if (recaptchaService) {
              recaptchaService.reset();
            }
        } finally {
            setLoadingState(googleSigninBtn, false);
        }
    });
  }

  if (isFirebaseActive && logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (unsubscribeUserDataListener) unsubscribeUserDataListener();
      signOut(auth);
      showToast('Ви вийшли з акаунта', 'info');
    });
  }

  optionsContainer.addEventListener('click',(e)=>{
    const button = e.target.closest('.option-btn');
    if(!button || button.disabled) return;

    const selectedIndex = parseInt(button.dataset.index,10);
    const q = currentTest.questions[currentTest.currentIndex];
    const isCorrect = selectedIndex===q.correct;

    const isPenalized = penalizedQuestions.has(currentTest.currentIndex);

    if (isCorrect && !isPenalized) {
        currentTest.score++;
    }

    currentTest.reviewData.push({ question:q, selectedIndex, isPenalized });

    const all = optionsContainer.querySelectorAll('.option-btn');
    all.forEach((btn, idx)=>{
      btn.disabled = true;
      btn.setAttribute('aria-checked', btn===button);
    });

    const feedbackIcon = document.createElement('span');
    feedbackIcon.className = 'feedback-icon ml-auto text-2xl';
    feedbackIcon.innerHTML = isCorrect
      ? '✓ <span class="sr-only">Правильна відповідь</span>'
      : '✗ <span class="sr-only">Неправильна відповідь</span>';
    button.classList.add(isCorrect ? 'correct' : 'incorrect');
    button.appendChild(feedbackIcon);

    if (currentTest.mode === 'practice' && !isCorrect) {
        const rightButton = optionsContainer.querySelector(`.option-btn[data-index="${q.correct}"]`);
        if (rightButton) {
            const correctIcon = document.createElement('span');
            correctIcon.className = 'feedback-icon ml-auto text-2xl';
            correctIcon.innerHTML = '✓ <span class="sr-only">Це правильна відповідь</span>';
            rightButton.classList.add('correct');
            rightButton.appendChild(correctIcon);
        }
    }
    if(currentTest.mode==='practice'){
      document.getElementById('explanation-text').textContent = q.explanation;
      document.getElementById('explanation-container').classList.remove('hidden');
    }
    updateProgressUI();
    const nextBtn = document.getElementById('next-question-btn');
    nextBtn.textContent = (currentTest.currentIndex===currentTest.questions.length-1) ? 'Завершити тест' : 'Наступне питання';
    nextBtn.classList.remove('hidden');
    nextBtn.focus();
    optionsContainer.removeEventListener('keydown', radioKeyHandler);
  });



  document.querySelectorAll('.mode-btn[data-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setMode(btn.dataset.mode));
  });

  backToMainBtn.addEventListener('click',()=>{
    hideModal(resultsModal);
    if(currentUser && isFirebaseActive && !currentUser.isAnonymous) showScreen('dashboard');
    else showScreen('welcome');
  });

  saveProgressBtn.addEventListener('click',()=>{
    hideModal(resultsModal);
    showScreen('auth');
  });

  toggleAuthLink.addEventListener('click',(e)=>{
    e.preventDefault();
    document.getElementById('login-form').classList.toggle('hidden');
    document.getElementById('register-form').classList.toggle('hidden');
    toggleAuthLink.textContent = document.getElementById('login-form').classList.contains('hidden') ? 'Вже є акаунт? Увійти' : 'Немає акаунта? Зареєструватися';
    document.getElementById('auth-error').textContent = '';
  });

  if (showLoginBtn) {
    showLoginBtn.addEventListener('click',(e)=>{ e.preventDefault(); showScreen('auth'); });
  }
  if (showLoginHeroBtn) {
    showLoginHeroBtn.addEventListener('click',(e)=>{ e.preventDefault(); showScreen('auth'); });
  }
  document.getElementById('back-to-welcome-btn').addEventListener('click',()=>showScreen('welcome'));
  document.getElementById('next-question-btn').addEventListener('click',nextQuestion);

  quitTestBtn.addEventListener('click',()=>{
    if(timerApi) timerApi.pause();
    const title = document.getElementById('confirmation-title');
    const text = document.getElementById('confirmation-text');
    const confirmBtn = document.getElementById('confirm-action-btn');
    const cancelBtn = document.getElementById('cancel-action-btn');
    title.textContent = "Ви впевнені?";
    text.innerHTML = "Весь прогрес у поточному тесті буде втрачено.";
    confirmBtn.textContent = "Так, вийти";
    cancelBtn.textContent = "Скасувати";
    confirmBtn.onclick = () => {
        hideModal(confirmationModal);
        exitExamLockdown();
        activeTestSessionId = null;
        if(timerApi) timerApi.stop();
        if(currentUser && isFirebaseActive && !currentUser.isAnonymous) showScreen('dashboard');
        else showScreen('welcome');
    };
    cancelBtn.onclick = () => {
        hideModal(confirmationModal);
        if(timerApi && !isLockdownWarningActive) timerApi.resume();
    };
    showModal(confirmationModal);
  });

  reviewAnswersBtn.addEventListener('click',showReview);
  closeReviewBtn.addEventListener('click',()=>{
    hideModal(reviewModal);
    if(currentUser && isFirebaseActive && !currentUser.isAnonymous) showScreen('dashboard');
    else showScreen('welcome');
  });

  if (infoOkBtn) {
    infoOkBtn.addEventListener('click', () => hideModal(infoModal));
  }
  
  initSelectors('welcome');
  initSelectors('dashboard');
  const legacyWelcomeTitle = document.getElementById('welcome-title');
  if (legacyWelcomeTitle) {
    legacyWelcomeTitle.classList.add('sr-only');
  }
  const legacyWelcomeSubtitle = document.getElementById('welcome-mode-description');
  if (legacyWelcomeSubtitle) {
    legacyWelcomeSubtitle.classList.add('sr-only');
  }
  updateModeDependentUI();
  renderStudentAccessState();

  // ✅ НОВИЙ СЛУХАЧ ДЛЯ ЗМІНИ КЛАСУ В КАБІНЕТІ
  const userGradeSelector = document.getElementById('user-grade-selector');
  if (userGradeSelector) {
    userGradeSelector.addEventListener('change', async (e) => {
        if (!currentUser) return;
        const newGrade = parseInt(e.target.value, 10);
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
            await updateDoc(userDocRef, { currentGrade: newGrade });
            showToast('Клас успішно оновлено!', 'success');
        } catch (error) {
            showToast('Не вдалося оновити клас.', 'error');
            console.error('Error updating grade: ', error);
        }
    });
  }
}

// Initial setup
(async()=>{
  setMode('practice');
  try{
    if(typeof __firebase_config!=='undefined' && __firebase_config){
      const cfg = JSON.parse(__firebase_config);
      if(cfg.apiKey && cfg.projectId){
        await initFirebase(cfg);
      }else{ throw new Error('Firebase config is missing essential keys.'); }
    }else{ throw new Error('__firebase_config is not defined.'); }
  }catch(error){
    console.warn('Firebase initialization failed:', error.message, 'App will run in offline mode.');
  }
  if(isFirebaseActive){
    setupAuthListener();
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){ trySyncOfflineScores(); }
    });
    if(typeof __initial_auth_token!=='undefined' && __initial_auth_token){
      try{ await signInWithCustomToken(auth,__initial_auth_token); }
      catch(error){
        console.error('Custom token sign-in failed:',error);
        try{ await signInAnonymously(auth); }catch(e){ console.error('Anonymous sign-in fallback failed:',e); }
      }
    }else{
      try{ await signInAnonymously(auth); }catch(e){ console.error('Anonymous sign-in failed:',e); }
    }
    await trySyncOfflineScores();
  }else{
    document.querySelectorAll('#show-login-btn, #show-login-hero-btn, #google-signin-btn, #login-form, #register-form, #toggle-auth, #save-progress-btn, #logout-btn, #student-code-input, #student-code-submit-btn, #student-code-clear-btn, #student-code-input-hero, #student-code-submit-btn-hero, #student-code-clear-btn-hero').forEach(el=>{
      el.style.opacity='.5'; el.style.pointerEvents='none'; if(el.tagName==='BUTTON') el.setAttribute('disabled',true);
    });
    const authText = document.querySelector('#show-login-btn')?.parentElement;
    if(authText) authText.innerHTML = 'Збереження прогресу недоступне.';
    showScreen('welcome');
  }
  setupEventListeners();
  
  timerApi = createTimer({
    onTimeout: ()=>{
      if (!isLockdownWarningActive) {
        endTest(true)
      }
    },
    getActiveTestSessionId: ()=>activeTestSessionId,
    getMode: ()=>currentTest.mode
  });

})();
