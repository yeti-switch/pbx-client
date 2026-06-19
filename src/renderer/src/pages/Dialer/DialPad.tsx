import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { useSoftphoneStore } from '@/softphone/store'

export interface DialPadHandle {
  setNumber: (val: string) => void
}

interface DialPadProps {
  onDial: (number: string) => void
}

const KEYS = [
  { digit: '1', sub: '' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '' }
]

const DialPad = forwardRef<DialPadHandle, DialPadProps>(function DialPad({ onDial }, ref) {
  const dialHistory = useSoftphoneStore((s) => s.dialHistory)
  const [number, setNumber] = useState('')
  // History navigation: -1 = editing the draft; 0..n = position in dialHistory.
  const [histIndex, setHistIndex] = useState(-1)
  const draftRef = useRef('')

  // Set the number from user input / external prefill (resets history nav).
  const setNumberManual = (val: string): void => {
    setNumber(val)
    draftRef.current = val
    setHistIndex(-1)
  }

  useImperativeHandle(ref, () => ({ setNumber: setNumberManual }), [])

  const dial = (): void => {
    if (!number.trim()) return
    onDial(number.trim())
    setNumber('')
    draftRef.current = ''
    setHistIndex(-1)
  }

  // ↑ = older dialed numbers, ↓ = back toward the current draft (shell-style).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      dial()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (dialHistory.length === 0) return
      if (histIndex === -1) draftRef.current = number
      const next = Math.min(histIndex + 1, dialHistory.length - 1)
      setHistIndex(next)
      setNumber(dialHistory[next])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIndex === -1) return
      const next = histIndex - 1
      setHistIndex(next)
      setNumber(next === -1 ? draftRef.current : dialHistory[next])
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Number input + backspace */}
      <div className="flex items-center gap-2">
        <input
          value={number}
          type="text"
          title="Type a number, or use ↑/↓ to recall previously dialed numbers"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-primary"
          onChange={(e) => setNumberManual(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted transition-colors hover:bg-accent"
          onClick={() => setNumberManual(number.slice(0, -1))}
        >
          <Delete className="size-4" />
        </button>
      </div>

      {/* Digit grid */}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key.digit}
            type="button"
            className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted py-3 text-sm font-semibold transition-colors hover:bg-accent active:scale-95"
            onClick={() => setNumberManual(number + key.digit)}
          >
            <span className="text-base leading-tight">{key.digit}</span>
            <span className="text-[9px] leading-tight text-muted-foreground">{key.sub}</span>
          </button>
        ))}
      </div>

      {/* Dial button */}
      <button
        type="button"
        className="w-full rounded-full bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
        disabled={!number.trim()}
        onClick={dial}
      >
        Dial
      </button>
    </div>
  )
})

export default DialPad
