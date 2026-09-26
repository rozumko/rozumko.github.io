// Authored HTML never enters the application DOM. Inline CSS/JS runs in an
// opaque-origin frame; network, nested frames, forms and parent access are denied.
export function htmlCardDocument(html: string): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font-family:system-ui,sans-serif}img{max-width:100%}</style></head><body>${html}</body></html>`
}

export function renderHtmlCard(html: string): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.className = 'le-canvas__html'
  frame.title = 'HTML-картка уроку'
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.referrerPolicy = 'no-referrer'
  // A separate sandbox document avoids inheriting the application's strict
  // script-src policy. The fragment stays local and is never sent to a server.
  frame.src = new URL(`/lesson-html.html#${encodeURIComponent(htmlCardDocument(html.slice(0, 65_536)))}`, location.href).href
  return frame
}
