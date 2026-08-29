import { mediaUrl } from '@/lib/media'

export type FndsItem = {
  id: string
  title: string
  image: string
  className: string
}

export const fndsItems: FndsItem[] = [
  {
    id: 'zhi-ming-ri-de-wu',
    title: '致明日的舞',
    image: mediaUrl('fnds/01-zhi-ming-ri-de-wu.jpg'),
    className:
      'fnds-card-0 absolute top-[18%] left-[8%] z-10 rotate-[-4deg] sm:top-10 sm:left-[20%] sm:rotate-[-5deg]',
  },
  {
    id: 'melody',
    title: 'Melody',
    image: mediaUrl('fnds/02-melody.jpg'),
    className:
      'fnds-card-1 absolute top-[27%] left-[13%] z-10 rotate-[-6deg] sm:top-40 sm:left-[25%] sm:rotate-[-7deg]',
  },
  {
    id: 'wo-men',
    title: '我們',
    image: mediaUrl('fnds/03-wo-men.jpg'),
    className:
      'fnds-card-2 absolute top-[20%] left-[16%] z-10 rotate-[5deg] sm:top-5 sm:left-[40%] sm:rotate-[8deg]',
  },
  {
    id: 'hang-zhou',
    title: '杭州站',
    image: mediaUrl('fnds/04-hang-zhou.jpg'),
    className:
      'fnds-card-3 absolute top-[30%] left-[10%] z-10 rotate-[6deg] sm:top-32 sm:left-[55%] sm:rotate-[10deg]',
  },
  {
    id: 'ren-wo-xing',
    title: '任我行',
    image: mediaUrl('fnds/05-ren-wo-xing.jpg'),
    className:
      'fnds-card-4 absolute top-[24%] left-[6%] z-10 rotate-[2deg] sm:top-20 sm:right-[35%] sm:left-auto',
  },
  {
    id: 'ao-men',
    title: '澳門8.3',
    image: mediaUrl('fnds/06-ao-men.jpg'),
    className:
      'fnds-card-5 absolute top-[32%] left-[15%] z-10 rotate-[-5deg] sm:top-24 sm:left-[45%] sm:rotate-[-7deg]',
  },
  {
    id: 'hu-ran-007',
    title: '忽然007',
    image: mediaUrl('fnds/07-hu-ran-007.jpg'),
    className:
      'fnds-card-6 absolute top-[22%] left-[12%] z-10 rotate-[3deg] sm:top-8 sm:left-[30%] sm:rotate-[4deg]',
  },
]
