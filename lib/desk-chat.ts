// Only presentation hosts cross this boundary. Chat state and commands continue
// to belong to the single global FloatingChat instance.
export const DESK_NOTE_HOST_EVENT = 'solidays:desk-note-host'
export type DeskNoteKind = 'history' | 'compose'
export type DeskNoteHost = { kind: DeskNoteKind; element: HTMLDivElement | null }

export function registerDeskNoteHost(kind: DeskNoteKind, element: HTMLDivElement | null) {
  window.dispatchEvent(
    new CustomEvent<DeskNoteHost>(DESK_NOTE_HOST_EVENT, {
      detail: { kind, element },
    })
  )
}
