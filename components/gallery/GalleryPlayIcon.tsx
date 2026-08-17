import { Play } from 'lucide-react'
import { cn } from '@/components/lib/utils'

export default function GalleryPlayIcon({ className }: { className?: string }) {
  return <Play className={cn('fill-current', className)} aria-hidden />
}
