import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/components/lib/utils'

export const chatSurfaceClassName =
  'border border-gray-200/70 bg-white/80 text-gray-900 shadow-2xl shadow-black/10 supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:backdrop-blur-2xl dark:border-white/10 dark:bg-gray-950/80 dark:text-gray-100 dark:shadow-black/40 supports-[backdrop-filter]:dark:bg-gray-950/60'

export function ChatSurface({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn(chatSurfaceClassName, className)} {...props}>
      {children}
    </div>
  )
}
