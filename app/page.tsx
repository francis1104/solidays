import { HomeLyricStack } from '@/components/site/HomeLyricStack'
import { HomeEntryPreviews } from '@/components/site/HomeEntryPreviews'
import { galleryItems } from '@/data/gallery'
import { formatClipDate } from '@/lib/gallery-format'
import { galleryUrl } from '@/lib/gallery'
import { mediaUrl } from '@/lib/media'

const HOME_GALLERY_ITEM_ID = 'superliminal-20221222-085858'

export default function HomePage() {
  const galleryItem = galleryItems.find((item) => item.id === HOME_GALLERY_ITEM_ID)
  const poster480 = galleryItem?.posterSrcSet?.find((source) => source.width === 480)
  const gallerySrc = galleryItem ? galleryUrl(galleryItem.poster) : ''
  const gallerySrcSet = poster480 ? `${galleryUrl(poster480.src)} 480w` : undefined

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-10 pt-4 pb-28 md:gap-12">
      <HomeLyricStack />
      {galleryItem ? (
        <HomeEntryPreviews
          gallery={{
            href: `/gallery?clip=${galleryItem.id}`,
            kicker: 'Gallery',
            title: galleryItem.game ?? galleryItem.title,
            meta: `${formatClipDate(galleryItem.recordedAt)} · ${galleryItems.length} clips`,
            imageSrc: gallerySrc,
            imageAlt: galleryItem.game ?? galleryItem.title,
            imageWidth: poster480?.width ?? galleryItem.width,
            imageHeight: Math.round(
              ((poster480?.width ?? galleryItem.width) * galleryItem.height) / galleryItem.width
            ),
            sizes: '480px',
            srcSet: gallerySrcSet,
            imageKind: 'gallery-poster',
          }}
          fnds={{
            href: '/fnds',
            kicker: 'Fear and Dreams',
            title: 'Fear and Dreams',
            meta: '致明日的舞',
            imageSrc: mediaUrl('fnds/01-zhi-ming-ri-de-wu.jpg'),
            imageAlt: 'Fear and Dreams · 致明日的舞',
            imageWidth: 1600,
            imageHeight: 900,
            sizes: '480px',
            imageKind: 'fnds-still',
          }}
        />
      ) : null}
    </div>
  )
}
