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

        <article className="prose dark:prose-invert mb-20 max-w-none pt-8 pb-8 md:mb-8 xl:col-span-2">
          <h2>Solidays</h2>
          <p>
            Solidays 是一个合成词，也是我最喜欢的粤语歌手陈奕迅（Eason）的一张专辑。字面是
            solid（坚实）和 day。我把它理解为很踏实、很充实的那些日子。专辑是 2008
            年的。里面有很多经典：《最佳损友》《富士山下》《浮夸》《葡萄成熟时》。
          </p>
          <p>
            有人调侃香港歌手「红不过罗湖」。粤语对普通话母语的听众触达更弱，但这些歌在内地同样脍炙人口。
          </p>

          <h2>歌</h2>
          <p>
            除了这些经典，我最喜欢的几首里包括《歌颂》——一首歌颂「歌」的歌。无论开心还是沮丧，处在什么样的人生状态，都可以找到一首歌来表达当时的心情；这世界上也有其他人和你分享开心或不开心。歌词：「感谢永远有歌把心境道破」。歌曲是很多人的情绪出口，在人生中占很大地位。
          </p>
          <p>
            这让我想到陈奕迅另一首「歌颂歌的歌」：《贝多芬与我》。歌曲贯穿人的一生：摇篮曲、字母歌、流行曲、挽歌，在不同维度伴随着人。
          </p>
          <p>
            我高中开始听陈奕迅，先是普通话（比如《你的背包》）和前面那些流行粤语，后来越听越对胃口。也明白这不只是歌手一个人的功劳，开始了解作词人、作曲人，例如林夕、黄伟文、陈永谦、小克，以及
            C.Y. Kong、陈辉阳、Eric Kwok、Jerald，还有音乐行业里各种幕后工作者。向他们致敬。
          </p>

          <h2>Fear and Dreams</h2>
          <p>
            我喜欢现场，也听过很多不同歌手的现场。FNDS 最大的区别还是那个词 solid。中间 talking
            很少，整场非常连贯。陈奕迅把演唱会当成戏剧或电影来做，完整、流畅、沉浸。选曲对大多数人比较冷门，但贴合主题。前半场
            Fear：死亡、离别、战争、未知，任何恐惧；后半场 Dreams：希望、爱。很厉害的一场演出。
          </p>
          <p>建这个站，是想让别人了解到这些歌曲，了解到这场演出。</p>

          <h2>游戏</h2>
          <p>
            最早可追溯到「玩不了游戏的时候」。人总会被年少不可得之物所困其身。以前很喜欢但玩不了，造就了现在比较沉浸于游戏中的世界。在这些世界里感受到很多不一样的东西。
          </p>
          <p>
            游戏像其他艺术作品一样——一首歌、一幅画、一场电影、一场演出。你可以通过操作游戏中的人物来和制作者交流，了解他们想告诉你的事情。
          </p>
          <p>
            典型例子是年度游戏《双人成行》（It Takes
            Two）。故事：两个快要离婚的人，阴差阳错变成玩偶，在合作中沟通、了解、配合，挽救破裂的关系。制作组
            Hazelight
            本身做过双人合作模式，在《双人成行》里关卡和玩法设计已经非常成熟，能获奖也是之前积累得很深。那些奇思妙想带给别人不一样的体验。
          </p>

          <h2>Behind Solidays</h2>
          <p>
            这个站点是一个持续生长的个人空间，记录我正在做的事情，也记录我如何把它们做出来。它使用
            Next.js、React、TypeScript、Tailwind CSS 和 Framer Motion 构建，运行在 Cloudflare
            Workers 上，并通过 OpenNext 部署。媒体内容存放在 R2，匿名留言使用 D1 持久化，再由
            Durable Objects 和 WebSocket
            提供实时同步。页面中的卡片、拖拽、主题切换和各种动效，则是在 Magic UI、shadcn/ui
            与自定义组件的基础上逐步调整完成的。它不只是一个页面集合，也是一个用来实践全栈开发、交互设计和产品想法的小型实验场。
          </p>
        </article>
      </div>
    </div>
  )
}
