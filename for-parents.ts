const SIGNUP_KEY = 'rozumko_parent_signup_v1';

function showSuccess(): void {
  document.getElementById('parent-signup-form')?.classList.add('hidden');
  document.getElementById('signup-success')?.classList.remove('hidden');
}

function init(): void {
  const form = document.getElementById('parent-signup-form') as HTMLFormElement | null;
  if (!form) return;

  if (localStorage.getItem(SIGNUP_KEY)) {
    showSuccess();
    return;
  }

  form.addEventListener('submit', (e: Event) => {
    e.preventDefault();
    const email = (document.getElementById('signup-email') as HTMLInputElement).value.trim();
    const grade = (document.getElementById('signup-grade') as HTMLSelectElement).value;
    const consent = (document.getElementById('signup-consent') as HTMLInputElement).checked;
    const errorEl = document.getElementById('signup-error') as HTMLElement;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errorEl.textContent = 'Введіть коректний email.';
      return;
    }
    if (!consent) {
      errorEl.textContent = 'Потрібна ваша згода на обробку даних.';
      return;
    }

    errorEl.textContent = '';
    localStorage.setItem(SIGNUP_KEY, JSON.stringify({ email, grade, ts: Date.now() }));
    showSuccess();
  });
}

init();
