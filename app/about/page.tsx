import type { Metadata } from 'next'
import Image from 'next/image'
import { mediaUrl } from '@/lib/media'
import siteMetadata from '@/data/siteMetadata'

export const metadata: Metadata = { title: 'About' }

export default function AboutPage() {
  return (
    <div className="divide-y divide-gray-200 pb-20 dark:divide-gray-700">
      <div className="space-y-2 pt-6 pb-8">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
          About
        </h1>
      </div>

      <div className="items-start space-y-2 pt-8 xl:grid xl:grid-cols-3 xl:space-y-0 xl:gap-x-8">
        <aside className="flex flex-col items-center space-x-2">
          <Image
            src={mediaUrl('profile/avatar.jpg')}
            alt="Francis 的头像"
            width={160}
            height={160}
            className="h-40 w-40 rounded-full object-cover"
            unoptimized
          />
          <h2 className="pt-4 pb-2 text-2xl leading-8 font-bold tracking-tight">Francis</h2>
          <div className="flex gap-4 pt-6">
            <a
              href={`mailto:${siteMetadata.email}`}
              className="text-primary-500 hover:text-primary-600"
            >
              Email
            </a>
            <a
              href={siteMetadata.github}
              target="_blank"
              rel="noreferrer"
              className="text-primary-500 hover:text-primary-600"
            >
              GitHub
            </a>
          </div>
        </aside>
      </div>
    </div>
  )
}
