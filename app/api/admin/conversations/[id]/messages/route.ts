import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { decodeMessageCursor, listMessages } from '@/lib/chat/repository'
import { CHAT_LIMITS } from '@/lib/chat/limits'
import { isAllowedOrigin } from '@/lib/chat/security'
import { hasValidAdminSession } from '@/lib/admin/auth'
import { getConversationById, persistOwnerMessage } from '@/lib/admin/repository'
import { toAdminConversationDto, toAdminMessageDto } from '@/lib/admin/types'
import { publishConversationEvent } from '@/lib/chat/realtime'
import { buildMessageCreatedEvent } from '@/lib/chat/realtime-events'

export const dynamic = 'force-dynamic'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type MessageRouteContext = {
  params: Promise<{ id: string }>
}

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function GET(request: Request, { params }: MessageRouteContext) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  if (!(await hasValidAdminSession(env, request))) {
    return errorResponse(401, 'ADMIN_UNAUTHORIZED', '未登录或会话已过期。')
  }

  const { id } = await params
  if (!uuidPattern.test(id)) return errorResponse(400, 'INVALID_ID', '会话 ID 无效。')

  const url = new URL(request.url)
  const cursorValue = url.searchParams.get('cursor')
  const cursor = cursorValue ? decodeMessageCursor(cursorValue) : null
  if (cursorValue && !cursor) {
    return errorResponse(400, 'INVALID_CURSOR', '留言历史游标无效。')
  }

  try {
    const conversation = await getConversationById(env.CHAT_DB, id)
    if (!conversation) return errorResponse(404, 'CONVERSATION_NOT_FOUND', '会话不存在。')

    const page = await listMessages(env.CHAT_DB, id, cursor, CHAT_LIMITS.historyPageSize)
    return jsonResponse({
      conversation: toAdminConversationDto(conversation),
      messages: page.messages.map(toAdminMessageDto),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    })
  } catch {
    console.error('Admin conversation detail failed')
    return errorResponse(500, 'ADMIN_READ_FAILED', '会话详情读取失败，请稍后再试。')
  }
}

export async function POST(request: Request, { params }: MessageRouteContext) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  if (!(await hasValidAdminSession(env, request))) {
    return errorResponse(401, 'ADMIN_UNAUTHORIZED', '未登录或会话已过期。')
  }

  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  const { id } = await params
  if (!uuidPattern.test(id)) return errorResponse(400, 'INVALID_ID', '会话 ID 无效。')

  let body: { content?: unknown }
  try {
    body = (await request.json()) as { content?: unknown }
  } catch {
    return errorResponse(400, 'INVALID_BODY', '请求体无效。')
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (content.length < 1 || content.length > 2000) {
    return errorResponse(400, 'INVALID_MESSAGE', '回复内容无效。')
  }

  try {
    const result = await persistOwnerMessage(env.CHAT_DB, id, content)
    if (result.ok === false) {
      if (result.reason === 'not_found') {
        return errorResponse(404, 'CONVERSATION_NOT_FOUND', '会话不存在。')
      }
      return errorResponse(409, 'CONVERSATION_CLOSED', '会话已关闭，无法回复。')
    }

    await publishConversationEvent(env, id, buildMessageCreatedEvent(result.message))

    return jsonResponse(
      {
        conversation: toAdminConversationDto(result.conversation),
        message: toAdminMessageDto(result.message),
      },
      201
    )
  } catch {
    console.error('Admin reply failed')
    return errorResponse(500, 'ADMIN_WRITE_FAILED', '回复保存失败，请稍后再试。')
  }
}
