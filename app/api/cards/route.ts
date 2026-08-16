import { defaultCards } from '@/data/cards'

export const dynamic = 'force-static'

// 首页当前直接使用 data/cards.ts，不请求本接口；该路由是未来接入 D1 结构化
// 数据的边界，保留给外部调用方，删除前先确认没有调用依赖。
export function GET() {
  return Response.json(defaultCards)
}
