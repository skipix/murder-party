import type { Moi } from '../lib/game'

type Props = { moi: Moi }

export default function Personnage({ moi }: Props) {
  const { joueur, perso } = moi
  return (
    <article className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-wider text-stone-500">{joueur.role}</p>
        <h2 className="font-serif text-3xl text-stone-100">{joueur.nom}</h2>
      </header>

      <section className="space-y-4 leading-relaxed text-stone-300">
        {perso.script.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <section className="space-y-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
          Vos secrets — à ne pas révéler
        </h3>
        <ul className="space-y-3 text-stone-200">
          {perso.secrets.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden className="text-amber-600">◆</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
