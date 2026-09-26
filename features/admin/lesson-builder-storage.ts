// Browser material inbox contains only canvas content, never scored activities.
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

export async function fileItem(file: File): Promise<CanvasItem> {
  if (file.size > 524_288) throw new Error('Файл завеликий: до 512 КіБ. Для більших PDF вставте посилання.')
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Підтримуються PNG, JPEG, WebP і PDF. HTML вставте в картку «HTML-код».')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { type: 'file', mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf', data, name: { uk: file.name.slice(0, 200) } }
}
