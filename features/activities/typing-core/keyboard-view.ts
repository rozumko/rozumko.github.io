// ── Virtual keyboard ─────────────────────────────────────────────────────────
// Draws the Ukrainian layout into a container and exposes the four states the
// typing activities need: hint, availability, correct flash, error flash.

import {
  UKRAINIAN_ROWS,
  codesForTarget,
  comboHintForCharacter,
  fingerForCode,
  modifierCodesForCharacter,
  renderKeycap,
  type KeyTarget,
} from './keyboard-layout.js'

export interface KeyboardView {
  element: HTMLElement
  /** Lights the target key (and its modifier). Returns the combo hint, if any. */
  setHint(target: KeyTarget | null, visible: boolean): string
  /** Dims every key the current set never asks for. */
  setAllowedTargets(targets: readonly KeyTarget[]): void
  flash(code: string, className: string, duration?: number): void
  clearHint(): void
  clearPressed(): void
  destroy(): void
}

export function createKeyboard(container: HTMLElement): KeyboardView {
  const keys = new Map<string, HTMLElement>()
  const timers = new Set<number>()
  container.textContent = ''

  for (const rowDefinition of UKRAINIAN_ROWS) {
    const row = document.createElement('div')
    row.className = 'keyboard-row'

    for (const definition of rowDefinition) {
      const key = document.createElement('span')
      key.className = 'keyboard-key'
      key.dataset['code'] = definition.code

      const finger = fingerForCode(definition.code)
      if (finger) key.dataset['finger'] = finger.finger
      if (definition.width) key.classList.add(`keyboard-key--${definition.width}`)
      if (definition.muted) key.classList.add('keyboard-key--muted')

      renderKeycap(key, definition)
      row.appendChild(key)
      keys.set(definition.code, key)
    }

    container.appendChild(row)
  }

  function clearClass(className: string) {
    keys.forEach(key => key.classList.remove(className))
  }

  return {
    element: container,

    setHint(target, visible) {
      clearClass('is-target')
      clearClass('is-modifier-target')
      if (!visible || !target) return ''

      for (const code of codesForTarget(target)) keys.get(code)?.classList.add('is-target')
      for (const code of modifierCodesForCharacter(target.value)) {
        keys.get(code)?.classList.add('is-modifier-target')
      }
      return comboHintForCharacter(target.value)
    },

    setAllowedTargets(targets) {
      const allowed = new Set<string>()
      for (const target of targets) {
        for (const code of codesForTarget(target)) allowed.add(code)
      }
      keys.forEach((key, code) => {
        key.classList.toggle('is-unavailable', allowed.size > 0 && !allowed.has(code))
      })
    },

    flash(code, className, duration = 180) {
      const key = keys.get(code)
      if (!key) return
      key.classList.remove('is-pressed-correct', 'is-pressed-error')
      void key.offsetWidth
      key.classList.add(className)
      const timer = window.setTimeout(() => {
        key.classList.remove(className)
        timers.delete(timer)
      }, duration)
      timers.add(timer)
    },

    clearHint() {
      clearClass('is-target')
      clearClass('is-modifier-target')
    },

    clearPressed() {
      clearClass('is-pressed-correct')
      clearClass('is-pressed-error')
    },

    destroy() {
      timers.forEach(timer => window.clearTimeout(timer))
      timers.clear()
      keys.clear()
      container.textContent = ''
    },
  }
}
