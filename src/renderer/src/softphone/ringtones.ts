import { useAudioDevicesStore } from './audioDevicesStore'

export interface RingtoneDef {
  id: string
  name: string
}

/** Available ringtones (synthesized via Web Audio — no bundled assets yet). */
export const RINGTONES: RingtoneDef[] = [{ id: 'classic', name: 'Classic' }]
export const DEFAULT_RINGTONE = 'classic'

export interface RingtoneHandle {
  stop(): void
}

/**
 * Classic warbled double-ring (440 Hz with a 20 Hz frequency warble for the
 * electronic-ring timbre; cadence: ring–gap–ring, then ~2s silence, looping).
 * Routed through the user's selected output device (same as call audio).
 */
function classicRingtone(): RingtoneHandle {
  const ctx = new AudioContext()
  const gain = ctx.createGain()
  gain.gain.value = 0.0001
  const dest = ctx.createMediaStreamDestination()
  gain.connect(dest)

  const el = document.createElement('audio')
  el.autoplay = true
  el.srcObject = dest.stream
  void useAudioDevicesStore.getState().applySinkId(el)
  el.play().catch(() => {})

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 440
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 20
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 60
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  osc.connect(gain)
  osc.start()
  lfo.start()

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const burst = (at: number): void => {
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
    gain.gain.setValueAtTime(0.25, at + 0.4)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)
  }
  const ring = (): void => {
    if (stopped) return
    const t = ctx.currentTime
    burst(t)
    burst(t + 0.6)
    timer = setTimeout(ring, 3000)
  }
  ring()

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      try {
        osc.stop()
        lfo.stop()
      } catch {
        /* already stopped */
      }
      el.pause()
      el.srcObject = null
      el.remove()
      ctx.close().catch(() => {})
    }
  }
}

const GENERATORS: Record<string, () => RingtoneHandle> = {
  classic: classicRingtone
}

/** Start playing a ringtone by id (loops until `.stop()`). Falls back to default. */
export function playRingtone(id: string): RingtoneHandle {
  const gen = GENERATORS[id] ?? GENERATORS[DEFAULT_RINGTONE]
  return gen()
}
