import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isScannerPath } from './scanner-path.ts'

const blocked = [
  '/.env',
  '/.env.local',
  '/.git/config',
  '/.github',
  '/.github/workflows/ci.yml',
  '/wp-admin/install.php',
  '/api/.env',
  '/admin/wp-config.php',
  '/media/.git/config',
  '/_next/composer.json',
  '/static/.env',
  '/%2eenv',
  '/.git%2Fconfig',
  '/.%67it/config',
  '/api/%2eenv',
  '/wp-login.php',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/adminer.php',
  '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
  '/backup.sql',
]

const allowed = [
  '/',
  '/admin',
  '/admin/conversations',
  '/api/chat/messages',
  '/api/cards',
  '/media/fnds/01-zhi-ming-ri-de-wu.jpg',
  '/_next/static/chunks/app/layout.js',
  '/fnds',
  '/about',
  '/static/favicons/favicon.ico',
  '/favicon.ico',
  '/wp-administer',
  '/robots.txt',
  '/sitemap.xml',
]

describe('isScannerPath', () => {
  for (const path of blocked) {
    it(`blocks ${path}`, () => {
      assert.equal(isScannerPath(path), true)
    })
  }

  for (const path of allowed) {
    it(`allows ${path}`, () => {
      assert.equal(isScannerPath(path), false)
    })
  }
})
