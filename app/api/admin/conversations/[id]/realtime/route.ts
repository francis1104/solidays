import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse } from '@/lib/chat/http'
import { handleAdminRealtimeRequest } from '@/lib/chat/realtime-http'

export const dynamic = 'force-dynamic'

type RealtimeRouteContext = {
  params: Promise<{ id: string }>
}

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function GET(request: Request, { params }: RealtimeRouteContext) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  const { id } = await params
  return handleAdminRealtimeRequest(request, env, id)
}
