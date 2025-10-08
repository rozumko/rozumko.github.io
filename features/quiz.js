export function displayQuestion(currentTest, optionsContainer, radioKeyHandler){
  const q = currentTest.questions[currentTest.currentIndex];
  document.getElementById('question-text').textContent = q.q;
  optionsContainer.innerHTML = '';
  document.getElementById('feedback-text').textContent = '';
  document.getElementById('explanation-container').classList.add('hidden');
  const nextBtn = document.getElementById('next-question-btn');
  nextBtn.classList.add('hidden');

  q.a.forEach((answer,index)=>{
    const button = document.createElement('button');
    button.setAttribute('type','button');
    button.setAttribute('role','radio');
    button.setAttribute('aria-checked','false');
    button.className = 'option-btn btn bg-white border-2 border-gray-300 text-gray-700 font-semibold p-4 rounded-lg text-left hover:border-blue-400 hover:bg-blue-50';
    button.textContent = answer;
    button.dataset.index = index;
    button.tabIndex = 0;
    optionsContainer.appendChild(button);
  });

  optionsContainer.addEventListener('keydown', radioKeyHandler);
  const first = optionsContainer.querySelector('.option-btn');
  if(first) first.focus();
}

export function updateProgressUI(currentTest){
  const total = currentTest.questions.length;
  const done = currentTest.currentIndex + 1;
  const width = Math.max(0, Math.min(100, (done/total)*100));
  document.getElementById('progress-bar').style.width = `${width}%`;
  document.getElementById('current-question-num').textContent = done;
}

export function showReview(currentTest, { resultsModal, reviewModal, showModal, hideModal }){
  hideModal(resultsModal,false);
  showModal(reviewModal);
  const reviewContent = document.getElementById('review-content');
  reviewContent.innerHTML = '';

  currentTest.reviewData.forEach((item,index)=>{
    const q = item.question;
    const userChoice = item.selectedIndex;
    const correctChoice = q.correct;

    const questionBlock = document.createElement('div');
    questionBlock.className = `p-4 mb-4 border rounded-lg ${userChoice===correctChoice ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`;

    // ===> ДОДАНО БЛОК ДЛЯ ВІДОБРАЖЕННЯ ШТРАФУ
    if (item.isPenalized) {
        const penaltyNotice = document.createElement('div');
        penaltyNotice.className = 'mb-3 p-2 bg-red-100 border border-red-200 rounded-md text-sm text-red-700 font-bold';
        penaltyNotice.textContent = '❗ Це питання не було зараховано через вихід з режиму іспиту.';
        questionBlock.appendChild(penaltyNotice);
    }
    // <=== КІНЕЦЬ БЛОКУ

    const title = document.createElement('p');
    title.className = 'font-bold mb-2';
    title.textContent = `${index+1}. ${q.q}`;
    questionBlock.appendChild(title);

    const ul = document.createElement('ul');
    q.a.forEach((option,i)=>{
      const li = document.createElement('li');
      li.className = 'p-2 border rounded mt-2 border-gray-300';
      if(i===correctChoice) li.className += ' border-green-500 font-bold text-green-800';
      if(i===userChoice && userChoice!==correctChoice) li.className += ' border-red-500 text-red-800 line-through';
      li.textContent = option;
      ul.appendChild(li);
    });
    questionBlock.appendChild(ul);

    const explWrap = document.createElement('div');
    explWrap.className = 'mt-3 pt-3 border-t border-gray-200';
    const explTitle = document.createElement('p');
    explTitle.className = 'font-semibold text-sm text-gray-700';
    explTitle.textContent = 'Пояснення:';
    const expl = document.createElement('p');
    expl.className = 'text-sm text-gray-600';
    expl.textContent = q.explanation;
    explWrap.appendChild(explTitle);
    explWrap.appendChild(expl);
    questionBlock.appendChild(explWrap);

    reviewContent.appendChild(questionBlock);
  });

  const firstError = reviewContent.querySelector('.border-red-200');
  if(firstError) firstError.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
