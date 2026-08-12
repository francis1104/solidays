import type { Metadata } from 'next'

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
          <h2 className="pt-4 pb-2 text-2xl leading-8 font-bold tracking-tight">Francis</h2>
          <p className="text-gray-500 dark:text-gray-400">Backend Developer</p>
          <div className="flex gap-4 pt-6">
            <a href="mailto:1104179197@qq.com" className="text-primary-500 hover:text-primary-600">
              Email
            </a>
            <a
              href="https://github.com/francis1104/tailwind-nextjs-starter-blog"
              target="_blank"
              rel="noreferrer"
              className="text-primary-500 hover:text-primary-600"
            >
              GitHub
            </a>
          </div>
        </aside>

        <article className="prose dark:prose-invert mb-20 max-w-none pt-8 pb-8 md:mb-8 xl:col-span-2">
          <p>
            一位后端开发者，熟悉 Java、SQL、Docker、MyBatis、Spring、Spring Boot 等常用后端技术，
            使用过 MySQL、Oracle 和 GoldenDB 数据库，也了解 Vue、JavaScript、CSS 等前端基础。
          </p>
          <p>这个站点使用 Next.js、Magic UI 和 Aceternity UI 构建。</p>
          <h2>“Fear And Dreams”世界巡回演唱会</h2>
          <p>
            以“Fear”（恐惧）和“Dreams”（梦想）为主题，分为两个艺术层面进行表演。“Fear”部分配合末世、
            废墟、污染、扭曲、压迫感等视觉效果，而“Dreams”部分则转向温暖、治愈、力量与希望。
          </p>
          <p>
            “Fear”和“Dreams”是两个尚未发生的概念，看似对立，实则共存；这个概念从宏观到微观，从个人意志到
            命运，从反思过去到直视当下。
          </p>
        </article>
      </div>
    </div>
  )
}
