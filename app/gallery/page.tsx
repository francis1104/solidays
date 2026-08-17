import type { Metadata } from 'next'
import { galleryItems } from '@/data/gallery'
import Gallery from '@/components/gallery/Gallery'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Fragments from worlds I have been to.',
}

export default function GalleryPage() {
  return <Gallery items={galleryItems} />
}
