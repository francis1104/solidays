/**
 * High-confidence scanner paths. Early 404 before OpenNext to save CPU.
 * Not a security boundary: Static Assets are asset-first, so this does not
 * replace .gitignore / .assetsignore / build-output secret checks.
 */

const SCANNER_EXACT_FILES = new Set([
  'wp-login.php',
  'xmlrpc.php',
  'adminer.php',
  'server-status',
  'server-info',
  'phpinfo.php',
  'info.php',
  'composer.json',
  'composer.lock',
  '.htaccess',
  '.htpasswd',
])

const SCANNER_DIRECTORY_SEGMENTS = new Set([
  'wp-admin',
  'wp-content',
  'wp-includes',
  'wordpress',
  'phpmyadmin',
  'pma',
  'cgi-bin',
  'actuator',
])

const SCANNER_DOT_SEGMENT_PREFIXES = [
  '.git',
  '.env',
  '.svn',
  '.hg',
  '.bzr',
  '.aws',
  '.ssh',
  '.docker',
] as const

const DUMP_SUFFIXES = ['.sql', '.sql.gz', '.sql.bz2', '.sql.xz', '.sql.zip'] as const
const ARCHIVE_DUMP_BASENAME =
  /^(backup|dump|database|db)(\.[a-z0-9.-]+)?\.(zip|tar|tar\.gz|rar|7z)$/

function normalizePathname(pathname: string) {
  const withoutQuery = pathname.split('?')[0] ?? pathname
  let decoded = withoutQuery

  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    // malformed encoding: keep raw path
  }

  const collapsed = decoded.replace(/\/{2,}/g, '/')
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.slice(0, -1).toLowerCase()
  }
  return collapsed.toLowerCase() || '/'
}

function pathSegments(pathname: string) {
  return pathname.split('/').filter(Boolean)
}

function basename(pathname: string) {
  const segments = pathSegments(pathname)
  return segments[segments.length - 1] ?? ''
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

function isStrongScannerPath(pathname: string) {
  const fileName = basename(pathname)
  const segments = pathSegments(pathname)

  if (SCANNER_EXACT_FILES.has(fileName)) {
    return true
  }

  if (fileName === 'wp-config.php' || fileName.startsWith('wp-config.php.')) {
    return true
  }

  if (segments.some((segment) => SCANNER_DIRECTORY_SEGMENTS.has(segment))) {
    return true
  }

  if (
    SCANNER_DOT_SEGMENT_PREFIXES.some((prefix) =>
      segments.some((segment) => segment.startsWith(prefix))
    )
  ) {
    return true
  }

  return pathname.includes('/phpunit/') && pathname.endsWith('/eval-stdin.php')
}

export function isScannerPath(pathname: string) {
  const normalized = normalizePathname(pathname)

  if (isStrongScannerPath(normalized)) {
    return true
  }

  if (isPreservedPath(normalized)) {
    return false
  }

  return isDumpOrBackup(normalized)
}
