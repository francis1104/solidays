// 站点域名常量：middleware.ts、lib/chat/security.ts、lib/chat/turnstile.ts 共用，
// 修改域名时只改这一处。
export const canonicalHostname = 'solidays.win'
export const alternateHostname = 'www.solidays.win'
export const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])
