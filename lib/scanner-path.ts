/**
 * High-confidence scanner paths. Early 404 before OpenNext to save CPU.
 * Not a security boundary: Static Assets are asset-first, so this does not
 * replace .gitignore / .assetsignore / build-output secret checks.
 */

const SCANNER_EXACT_PATHS = new Set([
  '/wp-login.php',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/pma',
  '/adminer.php',
  '/server-status',
  '/server-info',
  '/phpinfo.php',
  '/info.php',
])

const SCANNER_DIRECTORY_PREFIXES = [
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wordpress',
  '/phpmyadmin',
  '/pma',
  '/cgi-bin',
  '/actuator',
] as const

const SCANNER_DOT_PREFIXES = [
  '/.git',
  '/.env',
  '/.svn',
  '/.hg',
  '/.bzr',
  '/.aws',
  '/.ssh',
  '/.docker',
] as const

const DUMP_SUFFIXES = ['.sql', '.sql.gz', '.sql.bz2', '.sql.xz', '.sql.zip'] as const
const ARCHIVE_DUMP_BASENAME =
  /^(backup|dump|database|db)(\.[a-z0-9.-]+)?\.(zip|tar|tar\.gz|rar|7z)$/

function normalizePathname(pathname: string) {
  const withoutQuery = pathname.split('?')[0] ?? pathname
  const collapsed = withoutQuery.replace(/\/{2,}/g, '/')
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1).toLowerCase()
  }
  return collapsed.toLowerCase() || '/'
}

function basename(pathname: string) {
  const index = pathname.lastIndexOf('/')
  return index === -1 ? pathname : pathname.slice(index + 1)
}

function hasDirectoryPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isPreservedPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/media/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/fnds' ||
    pathname.startsWith('/fnds/') ||
    pathname === '/about' ||
    pathname.startsWith('/about/') ||
    pathname.startsWith('/static/') ||
    pathname === '/favicon.ico'
  )
}

function isDumpOrBackup(pathname: string) {
  if (DUMP_SUFFIXES.some((suffix) => pathname.endsWith(suffix))) {
    return true
  }

  return ARCHIVE_DUMP_BASENAME.test(basename(pathname))
}

export function isScannerPath(pathname: string) {
  const normalized = normalizePathname(pathname)

  if (isPreservedPath(normalized)) {
    return false
  }

  if (SCANNER_EXACT_PATHS.has(normalized)) {
    return true
  }

  if (SCANNER_DOT_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }

  if (SCANNER_DIRECTORY_PREFIXES.some((prefix) => hasDirectoryPrefix(normalized, prefix))) {
    return true
  }

  const fileName = basename(normalized)

  if (fileName === '.htaccess' || fileName === '.htpasswd') {
    return true
  }

  if (fileName === 'composer.json' || fileName === 'composer.lock') {
    return true
  }

  if (fileName === 'wp-config.php' || fileName.startsWith('wp-config.php.')) {
    return true
  }

  if (normalized.includes('/phpunit/') && normalized.endsWith('/eval-stdin.php')) {
    return true
  }

  return isDumpOrBackup(normalized)
}
