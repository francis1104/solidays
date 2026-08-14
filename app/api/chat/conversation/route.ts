import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { loadOpenConversation } from '@/lib/chat/db'
import { getVisitorId } from '@/lib/chat/session'
import { toConversationDto, toMessageDto } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const visitorId = getVisitorId(request)
  if (!visitorId) {
    return jsonResponse({ conversation: null, messages: [] })
  }

  const env = getEnv()
  if (!env) return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')

  try {
    const result = await loadOpenConversation(env.CHAT_DB, visitorId)
    if (!result) return jsonResponse({ conversation: null, messages: [] })

    return jsonResponse({
      conversation: toConversationDto(result.conversation),
      messages: result.messages.map(toMessageDto),
    })
  } catch {
    console.error('Chat conversation read failed')
    return errorResponse(500, 'CHAT_READ_FAILED', '留言读取失败，请稍后再试。')
  }
}
