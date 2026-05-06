import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // GitHub Pages user site — base is /
  base: '/',

  // Static assets copied verbatim to dist/
  publicDir: 'public',

  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index:          resolve(__dirname, 'index.html'),
        student:        resolve(__dirname, 'student.html'),
        teacher:        resolve(__dirname, 'teacher.html'),
        admin:          resolve(__dirname, 'admin.html'),
        offline:        resolve(__dirname, 'offline.html'),
        'for-teachers': resolve(__dirname, 'for-teachers.html'),
        'for-students': resolve(__dirname, 'for-students.html'),
        'for-parents':  resolve(__dirname, 'for-parents.html'),
        privacy:        resolve(__dirname, 'privacy.html'),
        terms:          resolve(__dirname, 'terms.html'),
      },
    },
  },
})
