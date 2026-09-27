// Legacy browser material inbox (canvas content only, never scored activities).
// Boards replaced it; the builder imports what is left here once, then clears it.
import type { CanvasItem } from '../lesson-engine/types.js'
export interface BuilderMaterial {
  id: string; title: string; subjectPackId: string; grade: number; topic: string; items: CanvasItem[]
}

export async function materialInbox(owner: string, write?: BuilderMaterial[]): Promise<BuilderMaterial[]> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('rozumko-builder-materials', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('inbox')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<BuilderMaterial[]>((resolve, reject) => {
      const tx = database.transaction('inbox', write ? 'readwrite' : 'readonly')
      const store = tx.objectStore('inbox')
      const request = write ? store.put(write, owner) : store.get(owner)
      let value: BuilderMaterial[] = []
      request.onsuccess = () => { value = write ?? request.result ?? [] }
      tx.oncomplete = () => resolve(value)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { database.close() }
}

const MAX_FILE_BYTES = 524_288

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * Phone photos are routinely several megabytes. Rather than refusing them, a
 * large image is redrawn smaller as WebP (JPEG where the browser cannot encode
 * WebP) until it fits the per-file limit.
 */
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= MAX_FILE_BYTES) return file
  const bitmap = await createImageBitmap(file)
  try {
    for (const side of [1920, 1600, 1280, 1024, 800]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const quality of [0.85, 0.7]) {
        let blob = await toBlob(canvas, 'image/webp', quality)
        if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)
        if (blob && blob.size <= MAX_FILE_BYTES) return new File([blob], file.name, { type: blob.type })
      }
    }
  } finally { bitmap.close() }
  throw new Error('Зображення не вдалося стиснути до 512 КіБ. Оберіть менше фото.')
}

export async function fileItem(source: File): Promise<CanvasItem> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(source.type)) throw new Error('Підтримуються PNG, JPEG, WebP і PDF. HTML вставте в картку «HTML-код».')
  const file = source.type === 'application/pdf' ? source : await shrinkImage(source)
  if (file.size > MAX_FILE_BYTES) throw new Error('Файл завеликий: до 512 КіБ. Для більших PDF вставте посилання.')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { type: 'file', mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf', data, name: { uk: file.name.slice(0, 200) } }
}
