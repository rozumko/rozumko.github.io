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
  doc, getDoc, setDoc, updateDoc, increment, onSnapshot
} from './services/firebase.js';

// Імпорт функцій валідації
import {
  validateEmail,
  validatePassword,
  RecaptchaService,
  showPasswordStrength,
  showValidationErrors
} from './utils/validation.js';

// Ініціалізація reCAPTCHA
const RECAPTCHA_SITE_KEY = '6LfrF-MrAAAAAJhW8g0-BwvB_3k0gTGM0mI4zcCa'; // Реальний ключ
const recaptchaService = new RecaptchaService(RECAPTCHA_SITE_KEY);

// Завантажити reCAPTCHA при старті
recaptchaService.load().catch(error => {
  console.error('Не вдалося завантажити reCAPTCHA:', error);
});

// DOM and UI helpers
import { getRefs, showScreen, setLoadingState, showToast, showModal, hideModal } from './ui/dom.js';
const { welcomeContainer, authContainer, dashboardContainer, testContainer, resultsModal, reviewModal, confirmationModal, infoModal, optionsContainer } = getRefs();

// State
let currentUser = null;
let currentUserData = null;
let unsubscribeUserDataListener = null;
let currentTest = { questions: [], subject: '', currentIndex: 0, score: 0, mode: 'practice', reviewData: [] };
import { createTimer } from './features/timer.js';
import { displayQuestion as renderQuestion, updateProgressUI as renderProgress, showReview as renderReview } from './features/quiz.js';
let timerApi = null;
const TEST_LENGTH = 5;
let activeTestSessionId = null;
let isLockdownWarningActive = false;
let penalizedQuestions = new Set(); // Зберігає індекси питань, де був штраф

// ✅ Data: Видалено імпорт питань. Вони будуть завантажуватись динамічно.
// Рекомендація: винести badges в окремий файл, наприклад, data/badges.js
const badges = {
  math_rookie:{ icon:'fas fa-calculator', name:'Математик-початківець', subject:'math', score:10 },
  math_adept:{ icon:'fas fa-ruler-combined', name:'Знавець формул', subject:'math', score:50 },
  ukrainian_rookie:{ icon:'fas fa-pen-nib', name:'Мовознавець-початківець', subject:'ukrainian', score:10 },
  ukrainian_adept:{ icon:'fas fa-book-reader', name:'Хранитель мови', subject:'ukrainian', score:50 },
  english_rookie:{ icon:'fas fa-language', name:'English Starter', subject:'english', score:10 },
  english_adept:{ icon:'fas fa-graduation-cap', name:'English Speaker', subject:'english', score:50 },
  genius:{ icon:'fas fa-brain', name:'Юний геній', subject:'total', score:100 },
  mastermind:{ icon:'fas fa-trophy', name:'Володар знань', subject:'total', score:200 }
};


function setMode(mode){
  currentTest.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn=>{
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('border-2',isActive);
    btn.classList.toggle('border-blue-500',isActive);
    btn.classList.toggle('bg-blue-100',isActive);
    btn.classList.toggle('bg-white',!isActive);
    btn.classList.toggle('is-active',isActive);
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

// Auth + RT data
function setupAuthListener(){
  onAuthStateChanged(auth, async (user)=>{
    if(unsubscribeUserDataListener) unsubscribeUserDataListener();
    if(user && !user.isAnonymous){
      if (!user.emailVerified) {
        showScreen('welcome');
        showInfoModal(
          'Акаунт не активовано',
          'Будь ласка, перевірте свою пошту та перейдіть за посиланням для підтвердження.'
        );
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
      currentUser = null; currentUserData = null;
      setMode('practice'); showScreen('welcome');
    }
  });
}

function listenToUserData(userId){
  const userDocRef = doc(db, 'users', userId);
  unsubscribeUserDataListener = onSnapshot(userDocRef, async (docSnap) => {
    if (docSnap.exists()) {
      const newUserData = docSnap.data();
      currentUserData = newUserData;
      updateDashboard();
    } else {
      const newUserData = {
        email: currentUser.email, totalScore: 0, badges: [],
        scores: { math: 0, ukrainian: 0, english: 0 }
      };
      await setDoc(userDocRef, newUserData).catch(e => console.error('Error creating user doc:', e));
      currentUserData = newUserData;
      updateDashboard();
    }
  }, (error) => {
    console.error('Error listening to user data:', error);
    showToast('Помилка синхронізації профілю.');
  });
}


async function saveScore(score,subject,retries=3,delay=1000){
  if(!currentUser || !isFirebaseActive || score===0) return;
  const userDocRef = doc(db,'users',currentUser.uid);
  try{
    await updateDoc(userDocRef,{
      totalScore: increment(score),
      [`scores.${subject}`]: increment(score)
    });
  }catch(error){
    if(error.code==='unavailable' && retries>0){
      setTimeout(()=>saveScore(score,subject,retries-1,delay*2),delay);
    }else{
      console.error('Failed to save score:',error);
      showToast('Помилка збереження. Результат збережено локально.');
      saveScoreOffline(score,subject);
      throw error;
    }
  }
}

function saveScoreOffline(score,subject){
  const offlineScores = JSON.parse(localStorage.getItem('offlineScores')||'[]');
  offlineScores.push({ score, subject, timestamp: Date.now() });
  localStorage.setItem('offlineScores',JSON.stringify(offlineScores));
}

async function trySyncOfflineScores(){
  const q = JSON.parse(localStorage.getItem('offlineScores')||'[]');
  if(q.length===0 || !isFirebaseActive || !currentUser) return;
  showToast(`Синхронізація ${q.length} незбережених результатів...`,'info');
  const pending = [];
  for(const item of q){
    try{ await saveScore(item.score,item.subject); }
    catch{ pending.push(item); }
  }
  localStorage.setItem('offlineScores',JSON.stringify(pending));
  if(q.length>0 && pending.length===0) showToast('Синхронізацію завершено!','success');
  else if(pending.length>0) showToast(`Не вдалося синхронізувати ${pending.length} результат(и).`,'error');
}

function updateDashboard(){
  const userEmailDisplay = document.getElementById('user-email-display');
  const totalScoreDisplay = document.getElementById('total-score');
  const badgesContainer = document.getElementById('badges-container');
  if(!currentUserData || !currentUser) return;
  userEmailDisplay.textContent = currentUser.email;
  totalScoreDisplay.textContent = currentUserData.totalScore||0;
  badgesContainer.innerHTML = '';
  if(currentUserData.badges && currentUserData.badges.length>0){
    currentUserData.badges.forEach(badgeId=>{
      const badge = badges[badgeId];
      if(badge){
        const el = document.createElement('div');
        el.className = 'badge text-4xl cursor-pointer text-yellow-500';
        el.title = badge.name;
        el.innerHTML = `<i class="${badge.icon}" aria-hidden="true"></i>`;
        badgesContainer.appendChild(el);
      }
    });
  }else{
    badgesContainer.innerHTML = '<p class="text-gray-500">Поки що немає нагород.</p>';
  }
  setMode('practice');
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

// ✅ НОВА ФУНКЦІЯ ДЛЯ ДИНАМІЧНОГО ЗАВАНТАЖЕННЯ ПИТАНЬ
async function loadQuestions(subject, grade) {
  const path = `./data/questions/${subject}/grade${grade}.js`;
  try {
    const module = await import(path);
    return module.questions;
  } catch (error) {
    console.error(`Не вдалося завантажити питання: ${path}`, error);
    showToast('На жаль, для обраних налаштувань ще немає питань.', 'error');
    return null; // Повертаємо null у разі помилки
  }
}

// ✅ ОНОВЛЕНА ФУНКЦІЯ ЗАПУСКУ ТЕСТУ (приймає клас і складність)
async function startTest(subject, grade, difficulty) {
    const testSessionId = Date.now();
    activeTestSessionId = testSessionId;
    penalizedQuestions.clear();

    const mainStartBtn = document.querySelector(`.start-test-btn[data-subject="${subject}"]`);
    setLoadingState(mainStartBtn, true);

    const questionsForTest = await loadQuestions(subject, grade);

    if (!questionsForTest) {
        setLoadingState(mainStartBtn, false);
        return;
    }
    
    const filteredQuestions = questionsForTest.filter(q => q.difficulty === difficulty);
    
    if (filteredQuestions.length < TEST_LENGTH) {
        showToast(`На жаль, для рівня "${difficulty}" недостатньо питань.`, 'info');
        setLoadingState(mainStartBtn, false);
        return;
    }

    currentTest.subject = subject;
    currentTest.questions = shuffleArray([...filteredQuestions]).slice(0, TEST_LENGTH);
    currentTest.currentIndex = 0;
    currentTest.score = 0;
    currentTest.reviewData = [];

    document.getElementById('test-title').textContent = { math: 'Математика', ukrainian: 'Українська мова', english: 'Англійська' }[subject];
    document.getElementById('total-questions-num').textContent = currentTest.questions.length;
    document.getElementById('current-question-num').textContent = 0;
    document.getElementById('progress-bar').style.width = '0%';

    const modeIndicator = document.getElementById('test-mode-indicator');
    modeIndicator.textContent = currentTest.mode === 'exam' ? 'Іспит' : 'Навчання';
    modeIndicator.className = `text-xs sm:text-sm font-semibold px-3 py-1 rounded-full ml-3 ${currentTest.mode === 'exam' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`;

    setLoadingState(mainStartBtn, false);
    showScreen('test');
    displayQuestion();

    if (currentTest.mode === 'exam') {
        if (timerApi) timerApi.start();
        enterExamLockdown();
    } else {
        document.getElementById('timer-display').classList.add('hidden');
    }
}

// ✅ ПОВНІСТЮ ОНОВЛЕНА ФУНКЦІЯ ДЛЯ ПОКАЗУ МОДАЛЬНОГО ВІКНА
function showGradeSelector(subject) {
  const modal = document.getElementById('grade-selection-modal');
  const gradeContainer = document.getElementById('grade-buttons-container');
  const difficultyContainer = document.getElementById('difficulty-buttons-container');
  const startBtn = document.getElementById('start-test-from-modal-btn');

  let selectedGrade = null;
  let selectedDifficulty = null;

  // Функція для перевірки стану та активації кнопки "Старт"
  function checkSelections() {
    startBtn.disabled = !(selectedGrade && selectedDifficulty);
  }

  // --- Генерація кнопок для вибору класу ---
  gradeContainer.innerHTML = '';
  for (let grade = 2; grade <= 8; grade++) {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-3 px-4 rounded-lg transition';
    button.textContent = `${grade} клас`;
    button.dataset.grade = grade;
    
    button.onclick = () => {
      selectedGrade = grade;
      // Підсвічуємо активну кнопку
      gradeContainer.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      checkSelections();
    };
    gradeContainer.appendChild(button);
  }

  // --- Генерація кнопок для вибору складності ---
  difficultyContainer.innerHTML = '';
  const difficulties = [
    { id: 'easy', name: 'Легкий' }, 
    { id: 'medium', name: 'Середній' }, 
    { id: 'hard', name: 'Складний' }
  ];
  difficulties.forEach(diff => {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-3 px-4 rounded-lg transition';
    button.textContent = diff.name;
    button.dataset.difficulty = diff.id;

    button.onclick = () => {
      selectedDifficulty = diff.id;
      // Підсвічуємо активну кнопку
      difficultyContainer.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('is-active'));
      button.classList.add('is-active');
      checkSelections();
    };
    difficultyContainer.appendChild(button);
  });

  // Обробник для кнопки "Почати тест"
  startBtn.onclick = () => {
    if (selectedGrade && selectedDifficulty) {
      hideModal(modal);
      startTest(subject, selectedGrade, selectedDifficulty);
    }
  };
  
  // Початкове скидання стану кнопки та виділення
  checkSelections();
  gradeContainer.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('is-active'));
  difficultyContainer.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('is-active'));
  
  // Показуємо модальне вікно
  showModal(modal);
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

  const timerMinutes = document.getElementById('timer-minutes');
  const timerSeconds = document.getElementById('timer-seconds');
  if(timerMinutes) timerMinutes.textContent = '5';
  if(timerSeconds) timerSeconds.textContent = '00';

  showModal(resultsModal);
  document.getElementById('results-score').textContent = currentTest.score;
  document.getElementById('results-total').textContent = currentTest.questions.length;
  document.getElementById('time-up-message').classList.toggle('hidden', !timedOut);
  document.getElementById('new-badge-container').classList.add('hidden');

  document.getElementById('review-answers-btn').classList.remove('hidden');

  if(currentUser && isFirebaseActive && !currentUser.isAnonymous){
    document.getElementById('guest-prompt').classList.add('hidden');
    await saveScore(currentTest.score,currentTest.subject);
  }else{
    document.getElementById('guest-prompt').classList.remove('hidden');
    saveScoreOffline(currentTest.score,currentTest.subject);
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
  if (!activeTestSessionId || currentTest.mode !== 'exam' || isLockdownWarningActive) {
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
  const googleSigninBtn = document.getElementById('google-signin-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const backToMainBtn = document.getElementById('back-to-main-btn');
  const saveProgressBtn = document.getElementById('save-progress-btn');
  const toggleAuthLink = document.getElementById('toggle-auth');
  const showLoginBtn = document.getElementById('show-login-btn');
  const backToWelcomeBtn = document.getElementById('back-to-welcome-btn');
  const nextQuestionBtn = document.getElementById('next-question-btn');
  const quitTestBtn = document.getElementById('quit-test-btn');
  const cancelActionBtn = document.getElementById('cancel-action-btn');
  const confirmActionBtn = document.getElementById('confirm-action-btn');
  const reviewAnswersBtn = document.getElementById('review-answers-btn');
  const closeReviewBtn = document.getElementById('close-review-btn');
  const infoOkBtn = document.getElementById('info-ok-btn');

  const registerPasswordInput = document.getElementById('register-password');
  if (registerPasswordInput) {
    registerPasswordInput.addEventListener('input', (e) => {
      showPasswordStrength(e.target.value, 'register-password-strength');
    });
  }

  if (isFirebaseActive && registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const email = form.querySelector('#register-email').value;
      const password = form.querySelector('#register-password').value;
      const submitButton = form.querySelector('button[type="submit"]');
      showValidationErrors([], 'register-validation-errors');
      document.getElementById('auth-error').textContent = '';
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
      if (passwordValidation.strength < 3) {
        const confirmWeak = confirm('Ваш пароль має низьку надійність. Рекомендуємо використати надійніший пароль.\n\nПоради:\n' + passwordValidation.warnings.join('\n') + '\n\nПродовжити з поточним паролем?');
        if (!confirmWeak) return;
      }
      setLoadingState(submitButton, true);
      try {
        const recaptchaToken = await recaptchaService.getToken('register');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        showInfoModal('Підтвердження реєстрації', 'Ми відправили вам лист для підтвердження. Будь ласка, перейдіть за посиланням у ньому, щоб активувати акаунт.');
      } catch (error) {
        console.error('Помилка реєстрації:', error);
        document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
        recaptchaService.reset();
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
        const recaptchaToken = await recaptchaService.getToken('login');
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Ви успішно увійшли!', 'success');
      } catch (error) {
        console.error('Помилка входу:', error);
        document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
        recaptchaService.reset();
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
        const recaptchaToken = await recaptchaService.getToken('google_signin');
        await signInWithPopup(auth, provider);
        showToast('Ви успішно увійшли через Google!', 'success');
      } catch (error) {
        console.error('Помилка входу через Google:', error);
        document.getElementById('auth-error').textContent = getAuthErrorMessage(error.code);
        recaptchaService.reset();
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
    feedbackIcon.innerHTML = isCorrect ? '✓' : '✗';
    button.classList.add(isCorrect ? 'correct' : 'incorrect');
    button.appendChild(feedbackIcon);

    if (currentTest.mode === 'practice' && !isCorrect) {
        const rightButton = optionsContainer.querySelector(`.option-btn[data-index="${q.correct}"]`);
        if (rightButton) {
            const correctIcon = document.createElement('span');
            correctIcon.className = 'feedback-icon ml-auto text-2xl';
            correctIcon.innerHTML = '✓';
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

  // ✅ ОНОВЛЕНИЙ СЛУХАЧ ДЛЯ КНОПОК ПРЕДМЕТІВ
  document.querySelectorAll('.start-test-btn').forEach(btn=>{
    btn.addEventListener('click',()=>showGradeSelector(btn.dataset.subject));
  });

  document.querySelectorAll('.mode-btn').forEach(btn=>{
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

  document.getElementById('show-login-btn').addEventListener('click',(e)=>{ e.preventDefault(); showScreen('auth'); });
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
  
  // ✅ НОВИЙ СЛУХАЧ ДЛЯ КНОПКИ СКАСУВАННЯ У МОДАЛЬНОМУ ВІКНІ ВИБОРУ
  document.getElementById('cancel-grade-selection-btn').addEventListener('click', () => {
    hideModal(document.getElementById('grade-selection-modal'));
  });
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
    document.querySelectorAll('#show-login-btn, #google-signin-btn, #login-form, #register-form, #toggle-auth, #save-progress-btn, #logout-btn').forEach(el=>{
      el.style.opacity='.5'; el.style.pointerEvents='none'; if(el.tagName==='BUTTON') el.setAttribute('disabled',true);
    });
    const authText = document.querySelector('a#show-login-btn')?.parentElement;
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
