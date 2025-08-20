
import PageTitle from '@/components/PageTitle'
import Meteors from '@/components/magicui/meteors'

export default function VideosPage() {
  return (
    <div className="relative mt-8 overflow-hidden h-[300px] w-full flex flex-col items-center justify-center">
      <Meteors number={24} className="" />
      <div className="relative z-10">
        <PageTitle>Videos</PageTitle>
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">这里是视频页面，您可以在此添加视频内容。</p>
      </div>
    </div>
  )
}
