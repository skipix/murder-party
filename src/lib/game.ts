import { deriveKey, open } from './crypto'
import type { Fouille, JoueurPublic, Perso, ScenarioEncrypted } from './types'
import scenarioJson from '../data/scenario.enc.json'

export const scenario = scenarioJson as ScenarioEncrypted

export type Moi = { joueur: JoueurPublic; perso: Perso; code: string }

/**
 * Un code d'accès ouvre exactement un personnage : on dérive la clé une fois
 * et on essaie chaque bloc. Le premier qui s'ouvre, c'est nous.
 */
export async function seConnecter(code: string): Promise<Moi | null> {
  const key = await deriveKey(code, scenario.salt)
  for (const joueur of scenario.joueurs) {
    const perso = await open<Perso>(key, joueur.perso)
    if (perso) return { joueur, perso, code }
  }
  return null
}

/** Ouvre ce qu'on trouve sur `joueur` avec son code de fouille. */
export async function fouiller(joueur: JoueurPublic, code: string): Promise<string[] | null> {
  const key = await deriveKey(code, scenario.salt)
  const fouille = await open<Fouille>(key, joueur.fouille)
  return fouille?.objets ?? null
}
