// Lesson text is data, never HTML. The only markup is **bold** and `code`;
// everything else — including anything that looks like a tag — is plain text.
// Rendering builds DOM nodes from tokens, so no string ever reaches innerHTML.

export type RichTextToken = { kind: 'text' | 'strong' | 'code'; text: string }

const MARKUP = /\*\*([^*]+)\*\*|`([^`]+)`/g

export function parseRichText(source: string): RichTextToken[] {
  const tokens: RichTextToken[] = []
  let cursor = 0
  for (const match of source.matchAll(MARKUP)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ kind: 'text', text: source.slice(cursor, index) })
    if (match[1] !== undefined) tokens.push({ kind: 'strong', text: match[1] })
    else tokens.push({ kind: 'code', text: match[2]! })
    cursor = index + match[0].length
  }
  if (cursor < source.length) tokens.push({ kind: 'text', text: source.slice(cursor) })
  return tokens
}

/** Appends parsed rich text to `parent` as text nodes, <strong> and <code>. */
export function appendRichText(parent: HTMLElement, source: string): HTMLElement {
  for (const token of parseRichText(source)) {
    if (token.kind === 'text') {
      parent.append(document.createTextNode(token.text))
    } else {
      const el = document.createElement(token.kind === 'strong' ? 'strong' : 'code')
      el.textContent = token.text
      parent.append(el)
    }
  }
  return parent
}

/** Creates `<tag class>` filled with rich text. */
export function richElement<K extends keyof HTMLElementTagNameMap>(tag: K, source: string, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (className) el.className = className
  appendRichText(el, source)
  return el
}
