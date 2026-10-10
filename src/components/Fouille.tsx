import { useState } from 'react'
import { fouiller, scenario, type Moi } from '../lib/game'
import type { JoueurPublic } from '../lib/types'
import { loadTrouvailles, saveTrouvailles, type Trouvailles } from '../lib/storage'
import CodeForm from './CodeForm'

type Props = { moi: Moi }

export default function Fouille({ moi }: Props) {
  const [trouvailles, setTrouvailles] = useState<Trouvailles>(loadTrouvailles)
  const [ouvert, setOuvert] = useState<string | null>(null)

  const suspects = scenario.joueurs.filter((j) => j.id !== moi.joueur.id)

  async function tenter(joueur: JoueurPublic, code: string) {
    const objets = await fouiller(joueur, code)
    if (!objets) return false
    const maj = { ...trouvailles, [joueur.id]: objets }
    saveTrouvailles(maj)
    setTrouvailles(maj)
    setOuvert(null)
    return true
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-stone-400">
        Pour fouiller quelqu'un, il vous faut son code de fouille. À vous de l'obtenir.
      </p>

      <ul className="space-y-3">
        {suspects.map((j) => {
          const objets = trouvailles[j.id]
          const estOuvert = ouvert === j.id
          return (
            <li key={j.id} className="rounded-xl border border-stone-800 bg-stone-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-stone-500">{j.role}</p>
                  <h3 className="font-serif text-xl text-stone-100">{j.nom}</h3>
                </div>
                {objets ? (
                  <span className="text-xs font-semibold text-amber-500">Fouillé</span>
                ) : (
                  <button
                    onClick={() => setOuvert(estOuvert ? null : j.id)}
                    className="rounded-lg border border-stone-700 px-3 py-1.5 text-sm text-stone-200 hover:border-amber-500"
                  >
                    {estOuvert ? 'Annuler' : 'Fouiller'}
                  </button>
                )}
              </div>

              {objets && (
                <ul className="mt-4 space-y-2 border-t border-stone-800 pt-4 text-stone-300">
                  {objets.map((o, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden className="text-amber-600">🔍</span>
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              )}

              {estOuvert && !objets && (
                <div className="mt-4 border-t border-stone-800 pt-4">
                  <CodeForm
                    placeholder={`CODE DE ${j.nom.split(' ')[0].toUpperCase()}`}
                    bouton="Fouiller"
                    erreur="Ce n'est pas son code."
                    onSubmit={(code) => tenter(j, code)}
                    autoFocus
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
