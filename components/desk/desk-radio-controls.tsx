'use client'

import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from 'lucide-react'

export type DeskRadioControlsProps = {
  song: string
  time: string
  playing: boolean
  muted: boolean
  error: boolean
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onMute: () => void
}

// Positioned over the real radio's tuning window, knobs and piano keys by Html
// transform. These are native buttons, so touch and keyboard use the same commands.
export function DeskRadioControls(props: DeskRadioControlsProps) {
  return (
    <div className="desk-radio-face" role="group" aria-label="Radio controls">
      <div className="desk-radio-display" aria-live="polite">
        <p>{props.song}</p>
        <span>{props.error ? '暂时无法播放，请重试' : props.time}</span>
      </div>
      <button
        className="desk-radio-power"
        type="button"
        aria-label={props.playing ? 'Pause radio' : 'Play radio'}
        title="播放 / 暂停"
        onClick={props.onToggle}
      >
        {props.playing ? <Pause /> : <Play />}
      </button>
      <button
        className="desk-radio-mute"
        type="button"
        aria-label={props.muted ? 'Unmute radio' : 'Mute radio'}
        title="静音"
        aria-pressed={props.muted}
        onClick={props.onMute}
      >
        {props.muted ? <VolumeX /> : <Volume2 />}
      </button>
      <button
        className="desk-radio-previous"
        type="button"
        aria-label="Previous song"
        title="上一首"
        onClick={props.onPrevious}
      >
        <ChevronLeft />
      </button>
      <button
        className="desk-radio-next"
        type="button"
        aria-label="Next song"
        title="下一首"
        onClick={props.onNext}
      >
        <ChevronRight />
      </button>
    </div>
  )
}
