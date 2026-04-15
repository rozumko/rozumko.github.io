$content = Get-Content -Path "script.js" -Raw -Encoding UTF8

$content = $content -replace '(?s)const badges = \{.*?\};', 'const badges = {
  informatics_rookie:{ icon:''fas fa-laptop'', name:''Юний програміст'', subject:''informatics'', score:10 },
  informatics_adept:{ icon:''fas fa-code'', name:''Хакер'', subject:''informatics'', score:50 },
  genius:{ icon:''fas fa-brain'', name:''Юний геній'', subject:''total'', score:100 },
  mastermind:{ icon:''fas fa-trophy'', name:''Володар знань'', subject:''total'', score:200 }
};'

$content = $content -replace "(?s)function showGradeSelector\(subject, triggerButton\).*?showModal\(modal\);\r?\n}", 'let selectedSetup = {
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
    startBtn.setAttribute(''aria-disabled'', isDisabled ? ''true'' : ''false'');
  }

  gradeContainer.innerHTML = '''';
  SUPPORTED_GRADES.forEach(grade => {
    const button = document.createElement(''button'');
    button.className = ''mode-btn btn text-blue-700 font-semibold py-3 px-4 border border-blue-200 rounded-lg transition w-full'';
    button.textContent = `${grade} клас`;
    button.dataset.grade = grade;
    button.type = ''button'';
    button.setAttribute(''aria-pressed'',''false'');

    button.onclick = () => {
      selectedSetup[prefix].grade = grade;
      gradeContainer.querySelectorAll(''.mode-btn'').forEach(btn => {
        btn.classList.remove(''is-active'', ''bg-blue-500'', ''text-white'');
        btn.classList.add(''text-blue-700'');
        btn.setAttribute(''aria-pressed'',''false'');
      });
      button.classList.add(''is-active'', ''bg-blue-500'', ''text-white'');
      button.classList.remove(''text-blue-700'');
      button.setAttribute(''aria-pressed'',''true'');
      checkSelections();
    };
    gradeContainer.appendChild(button);
  });

  const difficulties = [
      { id: ''easy'', name: ''Легкий'' },
      { id: ''medium'', name: ''Середній'' },
      { id: ''hard'', name: ''Складний'' }
  ];

  difficultyContainer.innerHTML = '''';
  
  difficulties.forEach((diff) => {
    const button = document.createElement(''button'');
    button.className = ''mode-btn btn text-blue-700 font-semibold py-3 px-4 border border-blue-200 rounded-lg transition w-full'';
    button.type = ''button'';
    button.setAttribute(''aria-pressed'',''false'');
    button.textContent = diff.name;

    button.onclick = () => {
      selectedSetup[prefix].difficulty = diff.id;
      difficultyContainer.querySelectorAll(''.mode-btn'').forEach(btn => {
        btn.classList.remove(''is-active'', ''bg-blue-500'', ''text-white'');
        btn.classList.add(''text-blue-700'');
        btn.setAttribute(''aria-pressed'',''false'');
      });
      button.classList.add(''is-active'', ''bg-blue-500'', ''text-white'');
      button.classList.remove(''text-blue-700'');
      button.setAttribute(''aria-pressed'',''true'');
      checkSelections();
    };
    difficultyContainer.appendChild(button);
  });

  startBtn.onclick = async () => {
    if (!(selectedSetup[prefix].grade && selectedSetup[prefix].difficulty)) return;
    setLoadingState(startBtn, true);
    try {
      await startTest(''informatics'', Number(selectedSetup[prefix].grade), selectedSetup[prefix].difficulty, startBtn);
    } finally {
      setLoadingState(startBtn, false);
    }
  };
}'


$content = $content -replace "(?s)document\.getElementById\('cancel-grade-selection-btn'\)\.addEventListener\('click', \(\) => \{\r?\n\s+hideModal\(document\.getElementById\('grade-selection-modal'\)\);\r?\n\s+\}\);", "initSelectors('welcome');
  initSelectors('dashboard');"

$content = $content -replace "document\.querySelectorAll\('\.start-test-btn'\)\.forEach\(btn=>\{\r?\n.*?\}\);", ""

Set-Content -Path "script.js" -Value $content -Encoding UTF8
