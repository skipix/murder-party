import { useEffect, useState } from 'react'
import { scenario, seConnecter, type Moi } from './lib/game'
import { clearAll, loadSession, saveSession } from './lib/storage'
import Connexion from './components/Connexion'
import Personnage from './components/Personnage'
import Fouille from './components/Fouille'

type Onglet = 'personnage' | 'fouille'

const ONGLETS: { id: Onglet; label: string }[] = [
  { id: 'personnage', label: 'Mon personnage' },
  { id: 'fouille', label: 'Fouiller' },
]

export default function App() {
  const [moi, setMoi] = useState<Moi | null>(null)
  const [restauration, setRestauration] = useState(() => loadSession() !== null)
  const [onglet, setOnglet] = useState<Onglet>('personnage')

  // Au chargement, on rejoue la connexion depuis la session stockée. Si le
  // scénario a changé entre-temps, le code n'ouvre plus rien : on repart.
  useEffect(() => {
    const session = loadSession()
    if (!session) return
    seConnecter(session.code).then((m) => {
      if (m) setMoi(m)
      else clearAll()
      setRestauration(false)
    })
  }, [])

  function connecter(m: Moi) {
    saveSession({ joueurId: m.joueur.id, code: m.code })
    setMoi(m)
  }

  function quitter() {
    if (!confirm('Quitter la partie sur cet appareil ? Vos trouvailles seront effacées.')) return
    clearAll()
    setMoi(null)
    setOnglet('personnage')
  }

  if (restauration) {
    return <p className="p-6 text-center text-stone-500">Ouverture du dossier…</p>
  }
  if (!moi) return <Connexion onConnecte={connecter} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between gap-3 px-6 pt-6 pb-4">
        <h1 className="font-serif text-lg text-amber-500">{scenario.titre}</h1>
        <button onClick={quitter} className="text-xs text-stone-500 hover:text-stone-300">
          Quitter
        </button>
      </header>

      <nav className="flex gap-1 px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={
              'flex-1 rounded-t-lg border-b-2 px-3 py-2 text-sm transition ' +
              (onglet === o.id
                ? 'border-amber-500 text-stone-100'
                : 'border-stone-800 text-stone-500 hover:text-stone-300')
            }
          >
            {o.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-6 py-6">
        {onglet === 'personnage' ? <Personnage moi={moi} /> : <Fouille moi={moi} />}
      </main>
    </div>
  )
}
