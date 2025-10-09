// Centralized DOM accessors to avoid stale references
export function getRefs(){
  return {
    welcomeContainer: document.getElementById('welcome-container'),
    authContainer: document.getElementById('auth-container'),
    dashboardContainer: document.getElementById('dashboard-container'),
    testContainer: document.getElementById('test-container'),
    resultsModal: document.getElementById('results-modal'),
    reviewModal: document.getElementById('review-modal'),
    confirmationModal: document.getElementById('confirmation-modal'),
    infoModal: document.getElementById('info-modal'), // <-- ЗМІНА: Додано
    optionsContainer: document.getElementById('options-container')
  };
}

let hasManagedInitialFocus = false;

export function showScreen(screen, options = {}){
  const { welcomeContainer, authContainer, dashboardContainer, testContainer } = getRefs();
  [welcomeContainer, authContainer, dashboardContainer, testContainer].forEach(container=>{
    if(!container) return;
    container.classList.add('hidden');
    container.setAttribute('aria-hidden','true');
  });
  const activeContainer = document.getElementById(`${screen}-container`);
  if(activeContainer){
    activeContainer.classList.remove('hidden');
    activeContainer.setAttribute('aria-hidden','false');
    const shouldFocus = typeof options.shouldFocus === 'boolean'
      ? options.shouldFocus
      : hasManagedInitialFocus;
    if(shouldFocus){
      const focusTarget = activeContainer.querySelector('h1, h2, [data-focus-target]');
      if(focusTarget){
        const hadTabIndex = focusTarget.hasAttribute('tabindex');
        if(!hadTabIndex) focusTarget.setAttribute('tabindex','-1');
        focusTarget.focus();
        if(!hadTabIndex){
          focusTarget.addEventListener('blur',()=>focusTarget.removeAttribute('tabindex'),{ once:true });
        }
      }else{
        const main = document.getElementById('main-content');
        if(main) main.focus();
      }
    }
  }
  if(!hasManagedInitialFocus) hasManagedInitialFocus = true;
}

export function setLoadingState(button,isLoading){
  if(!button) return;
  if(isLoading){
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
  }else{
    button.disabled = false;
    if(button.dataset.originalText) button.innerHTML = button.dataset.originalText;
  }
}

export function showToast(message,type='error'){
  const toast = document.getElementById('toast-notification');
  toast.textContent = message;
  toast.classList.remove('error','success','info','show');
  toast.classList.add(type,'show');
  setTimeout(()=>toast.classList.remove('show'),3000);
}

export const focusableElementsSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let previouslyFocusedElement = null;

function handleFocusTrap(e, modal){
  if(e.key==='Escape'){
    e.preventDefault();
    const closeButton = modal.querySelector('#close-review-btn');
    const cancelBtn = modal.querySelector('#cancel-action-btn');
    if(closeButton) closeButton.click();
    else if(cancelBtn) cancelBtn.click();
    else hideModal(modal);
    return;
  }
  if(e.key!=='Tab') return;
  const focusable = modal.querySelectorAll(focusableElementsSelector);
  if(focusable.length===0) return;
  const first = focusable[0];
  const last = focusable[focusable.length-1];
  if(e.shiftKey){
    if(document.activeElement===first){ last.focus(); e.preventDefault(); }
  }else{
    if(document.activeElement===last){ first.focus(); e.preventDefault(); }
  }
}

export function showModal(modal){
  previouslyFocusedElement = document.activeElement;
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden','false');
  const handler = (e)=>handleFocusTrap(e,modal);
  modal._trapHandler = handler;
  document.addEventListener('keydown', handler);
  const firstFocusable = modal.querySelector(focusableElementsSelector);
  if(firstFocusable) firstFocusable.focus();
}

export function hideModal(modal, shouldRefocus=true){
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden','true');
  if(modal._trapHandler){
    document.removeEventListener('keydown', modal._trapHandler);
    modal._trapHandler = null;
  }
  if(shouldRefocus && previouslyFocusedElement){ previouslyFocusedElement.focus(); }
}
