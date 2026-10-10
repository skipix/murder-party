import { useState, type FormEvent } from 'react'

type Props = {
  placeholder: string
  bouton: string
  erreur: string
  /** Renvoie `true` si le code a ouvert quelque chose. */
  onSubmit: (code: string) => Promise<boolean>
  autoFocus?: boolean
}

/** Un champ code + un bouton, avec l'attente et l'erreur gérées. */
export default function CodeForm({ placeholder, bouton, erreur, onSubmit, autoFocus }: Props) {
  const [code, setCode] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [echec, setEchec] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim() || enCours) return
    setEnCours(true)
    setEchec(false)
    const ok = await onSubmit(code)
    setEnCours(false)
    if (!ok) setEchec(true)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="rounded-lg border border-stone-700 bg-stone-900 px-4 py-3 font-mono text-lg tracking-widest text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={enCours || !code.trim()}
        className="rounded-lg bg-amber-600 px-4 py-3 font-semibold text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {enCours ? 'Vérification…' : bouton}
      </button>
      {echec && <p className="text-sm text-red-400">{erreur}</p>}
    </form>
  )
}
