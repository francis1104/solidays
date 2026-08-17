export const GALLERY_BASE_URL = 'https://media.solidays.win'

export function galleryUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${GALLERY_BASE_URL}${normalized}`
}
