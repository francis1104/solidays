import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// 路径别名与 tsconfig.json 的 paths 保持一致
export default defineConfig({
  resolve: {
    alias: {
      '@/components': path.resolve(rootDir, 'components'),
      '@/contexts': path.resolve(rootDir, 'contexts'),
      '@/data': path.resolve(rootDir, 'data'),
      '@/css': path.resolve(rootDir, 'css'),
      '@/lib': path.resolve(rootDir, 'lib'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
