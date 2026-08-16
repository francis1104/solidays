import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import {
  decodeConversationCursor,
  listConversations,
  type AdminConversationFilter,
} from '@/lib/admin/repository'
import { toAdminConversationListItemDto } from '@/lib/admin/types'
import { hasValidAdminSession } from '@/lib/admin/auth'

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
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  if (!(await hasValidAdminSession(env, request))) {
    return errorResponse(401, 'ADMIN_UNAUTHORIZED', '未登录或会话已过期。')
  }

  const url = new URL(request.url)

  const statusParam = url.searchParams.get('status')
  if (statusParam !== null && !['open', 'closed', 'all'].includes(statusParam)) {
    return errorResponse(400, 'INVALID_STATUS', '会话状态参数无效。')
  }
  const filter = (statusParam ?? 'all') as AdminConversationFilter

  const cursorValue = url.searchParams.get('cursor')
  const cursor = cursorValue ? decodeConversationCursor(cursorValue) : null
  if (cursorValue && !cursor) {
    return errorResponse(400, 'INVALID_CURSOR', '会话列表游标无效。')
  }

  const limitParam = url.searchParams.get('limit')
  const limit = limitParam === null ? 10 : Number(limitParam)
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return errorResponse(400, 'INVALID_LIMIT', '会话列表分页参数无效。')
  }

  try {
    const page = await listConversations(env.CHAT_DB, filter, cursor, limit)
    return jsonResponse({
      conversations: page.conversations.map(toAdminConversationListItemDto),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    })
  } catch {
    console.error('Admin conversation list failed')
    return errorResponse(500, 'ADMIN_READ_FAILED', '会话列表读取失败，请稍后再试。')
  }
}
