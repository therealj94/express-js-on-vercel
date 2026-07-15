import { useState, type ReactNode } from 'react'
import { Check, FileText, Plus, Upload, X } from 'lucide-react'
import { fileToDataUrl } from '../lib/file'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-2">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

export function TagInput({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Ej. Café de especialidad"
          className="input-field text-sm"
        />
        <button type="button" onClick={add} className="btn-ghost shrink-0 !px-3">
          <Plus size={16} />
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((tag) => (
            <span key={tag} className="chip">
              {tag}
              <button type="button" onClick={() => onChange(values.filter((v) => v !== tag))}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </Field>
  )
}

export function ImageField({
  label,
  value,
  onChange,
  round,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  round?: boolean
}) {
  return (
    <Field label={label}>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border p-3 hover:border-muted-2">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden bg-surface-hi ${round ? 'rounded-full' : 'rounded-lg'}`}
        >
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <Upload size={16} className="text-muted-2" />}
        </div>
        <span className="text-xs text-muted">{value ? 'Cambiar imagen' : 'Subir imagen'}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) onChange(await fileToDataUrl(file))
          }}
        />
      </label>
    </Field>
  )
}

export function DocField({
  label,
  hint,
  doc,
  onChange,
}: {
  label: string
  hint: string
  doc: { label: string; dataUrl: string } | null
  onChange: (v: { label: string; dataUrl: string } | null) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-border p-4 hover:border-muted-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-hi">
        {doc ? <Check size={16} className="text-ok" /> : <FileText size={16} className="text-muted-2" />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{doc ? doc.label : hint}</p>
      </div>
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) onChange({ label: file.name, dataUrl: await fileToDataUrl(file) })
        }}
      />
    </label>
  )
}
