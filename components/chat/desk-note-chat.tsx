'use client'

import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ChatMessages } from './chat-messages'
import { ChatComposer } from './chat-composer'
import type { ChatPanelProps } from './chat-panel'

// Presentation only: the same FloatingChat controller supplies both sheets.
// The hosts are attached to the actual paper meshes, not to a viewport overlay.
export function DeskNoteChat({
  historyHost,
  composeHost,
  ...props
}: ChatPanelProps & {
  historyHost: HTMLDivElement
  composeHost: HTMLDivElement
}) {
  return (
    <>
      {createPortal(
        <section className="desk-note-chat desk-note-history" aria-label="便签留言记录">
          <header>
            <div>
              <h2>From Francis</h2>
              <p>留言與回覆</p>
            </div>
            <button type="button" aria-label="Close chat" onClick={props.onClose}>
              <X size={20} />
            </button>
          </header>
          <ChatMessages
            messages={props.messages}
            hasMore={props.hasMoreHistory}
            isLoadingMore={props.isLoadingMoreHistory}
            onLoadMore={props.onLoadMoreHistory}
            scrollToLatestRequest={props.scrollToLatestRequest}
            smoothScrollPending={props.smoothScrollPending}
            reducedMotion={props.reducedMotion}
            onSmoothScrollComplete={props.onSmoothScrollComplete}
          />
        </section>,
        historyHost,
        'desk-note-history'
      )}
      {createPortal(
        <section
          id={props.panelId}
          className="desk-note-chat desk-note-compose"
          aria-label="写一张便签"
        >
          <header>
            <div>
              <h2>Leave a note</h2>
              <p>給 Francis · 匿名留言</p>
            </div>
          </header>
          <ChatComposer
            value={props.input}
            onChange={props.onChange}
            onSubmit={props.onSubmit}
            textareaRef={props.textareaRef}
            disabled={props.isSending}
            error={props.error}
          />
        </section>,
        composeHost,
        'desk-note-compose'
      )}
    </>
  )
}
