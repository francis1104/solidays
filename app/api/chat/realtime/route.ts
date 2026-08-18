import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse } from '@/lib/chat/http'
import { handleVisitorRealtimeRequest } from '@/lib/chat/realtime-http'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')
  return handleVisitorRealtimeRequest(request, env)
}
