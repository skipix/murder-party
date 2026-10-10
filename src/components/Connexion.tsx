import { scenario, seConnecter, type Moi } from '../lib/game'
import CodeForm from './CodeForm'

type Props = { onConnecte: (moi: Moi) => void }

export default function Connexion({ onConnecte }: Props) {
  async function tenter(code: string) {
    const moi = await seConnecter(code)
    if (moi) onConnecte(moi)
    return moi !== null
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-4">
        <h1 className="font-serif text-4xl text-amber-500">{scenario.titre}</h1>
        <p className="leading-relaxed text-stone-300">{scenario.intro}</p>
      </header>

      <section className="space-y-3">
        <p className="text-sm text-stone-400">Entrez le code d'accès reçu avec votre invitation.</p>
        <CodeForm
          placeholder="VOTRE CODE"
          bouton="Entrer dans le jeu"
          erreur="Ce code n'ouvre aucun personnage."
          onSubmit={tenter}
          autoFocus
        />
      </section>

      <footer className="text-xs text-stone-600">
        {scenario.joueurs.length} suspects&nbsp;: {scenario.joueurs.map((j) => j.nom).join(', ')}.
      </footer>
    </main>
  )
}
