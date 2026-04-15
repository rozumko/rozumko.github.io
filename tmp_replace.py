import sys

with open('script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace badges
old_badges = """const badges = {
  math_rookie:{ icon:'fas fa-calculator', name:'Математик-початківець', subject:'math', score:10 },
  math_adept:{ icon:'fas fa-ruler-combined', name:'Знавець формул', subject:'math', score:50 },
  ukrainian_rookie:{ icon:'fas fa-pen-nib', name:'Мовознавець-початківець', subject:'ukrainian', score:10 },
  ukrainian_adept:{ icon:'fas fa-book-reader', name:'Хранитель мови', subject:'ukrainian', score:50 },
  english_rookie:{ icon:'fas fa-language', name:'English Starter', subject:'english', score:10 },
  english_adept:{ icon:'fas fa-graduation-cap', name:'English Speaker', subject:'english', score:50 },
  genius:{ icon:'fas fa-brain', name:'Юний геній', subject:'total', score:100 },
  mastermind:{ icon:'fas fa-trophy', name:'Володар знань', subject:'total', score:200 }
};"""
new_badges = """const badges = {
  informatics_rookie:{ icon:'fas fa-laptop', name:'Юний програміст', subject:'informatics', score:10 },
  informatics_adept:{ icon:'fas fa-code', name:'Хакер', subject:'informatics', score:50 },
  genius:{ icon:'fas fa-brain', name:'Юний геній', subject:'total', score:100 },
  mastermind:{ icon:'fas fa-trophy', name:'Володар знань', subject:'total', score:200 }
};"""
content = content.replace(old_badges, new_badges)

# Replace showGradeSelector
old_selector = """function showGradeSelector(subject, triggerButton) {
  const modal = document.getElementById('grade-selection-modal');
  const gradeContainer = document.getElementById('grade-buttons-container');
  const difficultyContainer = document.getElementById('difficulty-buttons-container');
  const startBtn = document.getElementById('start-test-from-modal-btn');

  let selectedGrade = null;
  let selectedDifficulty = null;

  function checkSelections() {
    const isDisabled = !(selectedGrade && selectedDifficulty);
    startBtn.disabled = isDisabled;
    startBtn.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
  }

  gradeContainer.innerHTML = '';
  const availableGrades = SUBJECT_GRADE_MAP[subject] || SUPPORTED_GRADES;

  availableGrades.forEach(grade => {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-3 px-4 rounded-lg transition w-full';
    button.textContent = `${grade} клас`;
    button.dataset.grade = grade;
    button.type = 'button';
    button.setAttribute('aria-pressed','false');

    button.onclick = () => {
      selectedGrade = grade;
      gradeContainer.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed','false');
      });
      button.classList.add('is-active');
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

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'flex rounded-lg border border-gray-300 p-1';

  difficulties.forEach((diff, index) => {
    const button = document.createElement('button');
    button.className = 'mode-btn btn text-blue-700 font-semibold py-2 px-4 transition w-full';
    button.type = 'button';
    button.setAttribute('aria-pressed','false');

    if (index === 0) button.classList.add('rounded-l-md');
    if (index === difficulties.length - 1) button.classList.add('rounded-r-md');

    button.textContent = diff.name;

    button.onclick = () => {
      selectedDifficulty = diff.id;
      buttonGroup.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-pressed','false');
      });
      button.classList.add('is-active');
      button.setAttribute('aria-pressed','true');
      checkSelections();
    };
    buttonGroup.appendChild(button);
  });
  
  difficultyContainer.innerHTML = '';
  difficultyContainer.appendChild(buttonGroup);

  startBtn.onclick = async () => {
    if (!(selectedGrade && selectedDifficulty)) return;

    setLoadingState(startBtn, true);
    try {
      const started = await startTest(subject, Number(selectedGrade), selectedDifficulty, triggerButton);
      if (started) {
        hideModal(modal);
      }
    } finally {
      setLoadingState(startBtn, false);
    }
  };
  
  checkSelections();
  gradeContainer.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed','false');
  });
  buttonGroup.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed','false');
  });
  
  showModal(modal);
}"""

new_selector = """let selectedSetup = {
  welcome: { grade: null, difficulty: null },
  dashboard: { grade: null, difficulty: null }
};

function initSelectors(prefix) {
  const gradeContainer = document.getElementById(`${prefix}-grade-buttons-container`);
  const difficultyContainer = document.getElementById(`${prefix}-difficulty-buttons-container`);
  const startBtn = document.getElementById(`${prefix}-start-test-btn`);
  
  if (!gradeContainer || !difficultyContainer || !startBtn) return;

  function checkSelections() {
    const isDisabled = !(selectedSetup[prefix].grade && selectedSetup[prefix].difficulty);
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
    if (!(selectedSetup[prefix].grade && selectedSetup[prefix].difficulty)) return;
    setLoadingState(startBtn, true);
    try {
      await startTest('informatics', Number(selectedSetup[prefix].grade), selectedSetup[prefix].difficulty, startBtn);
    } finally {
      setLoadingState(startBtn, false);
    }
  };
}"""

content = content.replace(old_selector, new_selector)

content = content.replace("document.querySelectorAll('.start-test-btn')", "document.querySelectorAll('.removed-test-btn')")

old_cancel = """  document.getElementById('cancel-grade-selection-btn').addEventListener('click', () => {
    hideModal(document.getElementById('grade-selection-modal'));
  });"""
new_init = "  initSelectors('welcome');\n  initSelectors('dashboard');"
content = content.replace(old_cancel, new_init)

with open('script.js', 'w', encoding='utf-8') as f:
    f.write(content)
