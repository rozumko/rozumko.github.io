export function enforceTopLevelWindow(): void {
  if (window.top === window.self) return

  try {
    window.top!.location.href = window.location.href
    return
  } catch {
    document.documentElement.innerHTML = ''
    const body = document.createElement('body')
    body.style.cssText = [
      'margin:0',
      'min-height:100vh',
      'display:grid',
      'place-items:center',
      'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'background:#f8fafc',
      'color:#0f172a',
      'text-align:center',
      'padding:24px',
    ].join(';')

    const message = document.createElement('main')
    message.style.cssText = 'max-width:520px'

    const title = document.createElement('h1')
    title.textContent = 'Сторінку заблоковано'
    title.style.cssText = 'font-size:24px;margin:0 0 12px'

    const text = document.createElement('p')
    text.textContent = 'Відкрийте Rozumko напряму у браузері.'
    text.style.cssText = 'font-size:16px;margin:0'

    message.append(title, text)
    body.append(message)
    document.documentElement.append(body)
  }
}

enforceTopLevelWindow()
