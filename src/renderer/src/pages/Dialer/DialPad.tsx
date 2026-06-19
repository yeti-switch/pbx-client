import { forwardRef, useImperativeHandle, useState } from 'react'
import { Delete } from 'lucide-react'

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
  const [number, setNumber] = useState('')

  useImperativeHandle(ref, () => ({ setNumber }), [])

  const dial = (): void => {
    if (!number.trim()) return
    onDial(number.trim())
    setNumber('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Number input + backspace */}
      <div className="flex items-center gap-2">
        <input
          value={number}
          type="text"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-primary"
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && dial()}
        />
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted transition-colors hover:bg-accent"
          onClick={() => setNumber((n) => n.slice(0, -1))}
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
            onClick={() => setNumber((n) => n + key.digit)}
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
