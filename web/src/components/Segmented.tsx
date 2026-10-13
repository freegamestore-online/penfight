interface Option<T> {
  value: T
  label: string
  /** Longer name for screen readers when the visible label is abbreviated. */
  aria?: string
}

interface Props<T> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}

/** A small single-choice control. Touch targets are 44px tall and it uses the platform tokens. */
export function Segmented<T extends string | number>({ label, value, options, onChange }: Props<T>) {
  const id = `seg-${label.replace(/\s+/g, '-')}`
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--muted)' }} id={id}>
        {label}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex gap-1 rounded-xl p-1"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
      >
        {options.map((o) => {
          const selected = o.value === value
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.aria}
              onClick={() => onChange(o.value)}
              className="min-h-11 flex-1 rounded-lg px-2 text-sm font-bold"
              style={{
                background: selected ? 'var(--accent)' : 'transparent',
                color: selected ? '#ffffff' : 'var(--ink)',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
