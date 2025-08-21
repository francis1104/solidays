import PageTitle from '@/components/PageTitle'
import Meteors from '@/components/magicui/meteors'

export default function PicturesPage() {
  return (
    <div className="relative mt-8 flex h-[300px] w-full flex-col items-center justify-center overflow-hidden">
      <Meteors number={24} className="" />
      <div className="relative z-10">
        <PageTitle>Pictures</PageTitle>
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">
          这里是图片页面，您可以在此添加图片内容。
        </p>
      </div>
    </div>
  )
}
