const FRAMING_BLOCKED_PATH = '/framing-blocked.html'

export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win.self
  } catch {
    return true
  }
}

function clearCurrentDocument(doc: Document): void {
  doc.documentElement.replaceChildren()
  const body = doc.createElement('body')
  body.style.cssText = 'margin:0;min-height:100vh;background:#f8fafc'
  doc.documentElement.append(body)
}

export function enforceTopLevelWindow(win: Window = window): boolean {
  if (!isFramed(win)) return true

  try {
    win.location.replace(new URL(FRAMING_BLOCKED_PATH, win.location.href).href)
  } catch {
    clearCurrentDocument(win.document)
  }

  return false
}

if (typeof window !== 'undefined' && !enforceTopLevelWindow(window)) {
  throw new Error('Rozumko page blocked inside a frame')
}
