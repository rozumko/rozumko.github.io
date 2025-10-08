// services/nmt/utils/validation.js

/**
 * Валідація email адреси
 */
export function validateEmail(email) {
  const errors = [];
  
  // Перевірка на порожнє значення
  if (!email || email.trim() === '') {
    errors.push('Email не може бути порожнім');
    return { isValid: false, errors };
  }
  
  // Базова перевірка формату
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errors.push('Невірний формат email адреси');
    return { isValid: false, errors };
  }
  
  // Перевірка на заборонені символи
  const forbiddenChars = /[<>()[\]\\,;:\s@"]/g;
  const localPart = email.split('@')[0];
  if (forbiddenChars.test(localPart.replace(/[^\s@]/g, ''))) {
    errors.push('Email містить заборонені символи');
  }
  
  // Перевірка довжини
  if (email.length > 254) {
    errors.push('Email занадто довгий (максимум 254 символи)');
  }
  
  // Перевірка домену
  const domain = email.split('@')[1];
  if (domain && domain.length > 253) {
    errors.push('Домен email занадто довгий');
  }
  
  // Перевірка на подвійні крапки
  if (email.includes('..')) {
    errors.push('Email не може містити подвійні крапки');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Перевірка надійності пароля
 */
export function validatePassword(password) {
  const errors = [];
  const warnings = [];
  let strength = 0;
  
  // Мінімальна довжина
  if (!password || password.length < 6) {
    errors.push('Пароль має містити щонайменше 6 символів');
    return { isValid: false, errors, warnings, strength: 0 };
  }
  
  // Перевірка довжини (бонусні бали за довжину)
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (password.length >= 16) strength += 1;
  
  // Перевірка на великі літери
  if (/[A-ZА-ЯІЇЄҐ]/.test(password)) {
    strength += 1;
  } else {
    warnings.push('Додайте великі літери для надійності');
  }
  
  // Перевірка на малі літери
  if (/[a-zа-яіїєґ]/.test(password)) {
    strength += 1;
  } else {
    warnings.push('Додайте малі літери для надійності');
  }
  
  // Перевірка на цифри
  if (/\d/.test(password)) {
    strength += 1;
  } else {
    warnings.push('Додайте цифри для надійності');
  }
  
  // Перевірка на спеціальні символи
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    strength += 1;
  } else {
    warnings.push('Додайте спеціальні символи (!@#$%^&*) для надійності');
  }
  
  // Перевірка на поширені паролі
  const commonPasswords = [
    'password', '123456', '12345678', 'qwerty', 'abc123',
    'monkey', '1234567', 'letmein', 'trustno1', 'dragon',
    'baseball', 'iloveyou', 'master', 'sunshine', 'ashley',
    'password1', '123123', 'Password', 'qwerty123'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Цей пароль занадто поширений. Оберіть інший');
  }
  
  // Перевірка на послідовності
  if (/(.)\1{2,}/.test(password)) {
    warnings.push('Уникайте повторюваних символів (ааа, 111)');
    strength -= 1;
  }
  
  if (/(?:abc|bcd|cde|def|123|234|345|456|567|678|789)/i.test(password)) {
    warnings.push('Уникайте послідовностей (abc, 123)');
    strength -= 1;
  }
  
  // Перевірка на пробіли
  if (/\s/.test(password)) {
    errors.push('Пароль не може містити пробіли');
  }
  
  // Нормалізація strength (0-5)
  strength = Math.max(0, Math.min(5, strength));
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    strength,
    strengthText: getStrengthText(strength)
  };
}

function getStrengthText(strength) {
  switch(strength) {
    case 0:
    case 1: return 'Дуже слабкий';
    case 2: return 'Слабкий';
    case 3: return 'Середній';
    case 4: return 'Надійний';
    case 5: return 'Дуже надійний';
    default: return 'Невідомий';
  }
}

/**
 * Google reCAPTCHA v3 інтеграція
 */
export class RecaptchaService {
  constructor(siteKey) {
    this.siteKey = siteKey;
    this.isLoaded = false;
    this.loadPromise = null;
  }
  
  /**
   * Завантаження скрипта reCAPTCHA
   */
  load() {
    if (this.loadPromise) return this.loadPromise;
    
    this.loadPromise = new Promise((resolve, reject) => {
      if (window.grecaptcha && window.grecaptcha.ready) {
        this.isLoaded = true;
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${this.siteKey}`;
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        window.grecaptcha.ready(() => {
          this.isLoaded = true;
          resolve();
        });
      };
      
      script.onerror = () => {
        reject(new Error('Не вдалося завантажити reCAPTCHA'));
      };
      
      document.head.appendChild(script);
    });
    
    return this.loadPromise;
  }
  
  /**
   * Отримання токена reCAPTCHA
   */
  async getToken(action = 'submit') {
    try {
      await this.load();
      
      if (!window.grecaptcha || !window.grecaptcha.execute) {
        throw new Error('reCAPTCHA не готова');
      }
      
      const token = await window.grecaptcha.execute(this.siteKey, { action });
      return token;
    } catch (error) {
      console.error('Помилка отримання reCAPTCHA токена:', error);
      throw error;
    }
  }
  
  /**
   * Скидання reCAPTCHA
   */
  reset() {
    if (window.grecaptcha && window.grecaptcha.reset) {
      window.grecaptcha.reset();
    }
  }
}

/**
 * Показати індикатор надійності пароля в UI
 */
export function showPasswordStrength(password, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const validation = validatePassword(password);
  
  if (!password) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  const colors = {
    0: 'bg-red-500',
    1: 'bg-red-400',
    2: 'bg-orange-400',
    3: 'bg-yellow-400',
    4: 'bg-green-400',
    5: 'bg-green-500'
  };
  
  const textColors = {
    0: 'text-red-600',
    1: 'text-red-500',
    2: 'text-orange-500',
    3: 'text-yellow-600',
    4: 'text-green-600',
    5: 'text-green-700'
  };
  
  const width = (validation.strength / 5) * 100;
  
  container.innerHTML = `
    <div class="mt-2">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-semibold ${textColors[validation.strength]}">
          ${validation.strengthText}
        </span>
        <span class="text-xs text-gray-500">${validation.strength}/5</span>
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="${colors[validation.strength]} h-2 rounded-full transition-all duration-300" 
             style="width: ${width}%"></div>
      </div>
      ${validation.warnings.length > 0 ? `
        <div class="mt-2 text-xs text-gray-600">
          ${validation.warnings.map(w => `<div>• ${w}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Показати помилки валідації
 */
export function showValidationErrors(errors, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (errors.length === 0) {
    container.textContent = '';
    return;
  }
  
  container.innerHTML = errors.map(error => 
    `<div class="text-red-500 text-sm mb-1">• ${error}</div>`
  ).join('');
}
