import type { Sealed } from './crypto.ts'

// ---- Scénario source (en clair, jamais déployé) ----------------------------

export type JoueurSource = {
  /** Identifiant stable, sans espace (ex: "hercule"). */
  id: string
  nom: string
  /** Description publique, visible par tous (ex: "Le majordome"). */
  role: string
  /** Code que le joueur tape pour lire son propre personnage. */
  codeAcces: string
  /** Code que les autres doivent obtenir pour le fouiller. */
  codeFouille: string
  /** Paragraphes du script du personnage. */
  script: string[]
  /** Ce que le personnage sait et ne doit pas dire. */
  secrets: string[]
  /** Ce qu'on trouve sur lui en le fouillant. */
  fouille: string[]
}

export type ScenarioSource = {
  titre: string
  /** Pitch public, affiché avant la connexion. */
  intro: string
  joueurs: JoueurSource[]
}

// ---- Scénario chiffré (ce qui est déployé) ---------------------------------

export type Perso = { script: string[]; secrets: string[] }
export type Fouille = { objets: string[] }

export type JoueurPublic = {
  id: string
  nom: string
  role: string
  /** `Perso`, scellé avec le code d'accès du joueur. */
  perso: Sealed
  /** `Fouille`, scellé avec le code de fouille du joueur. */
  fouille: Sealed
}

export type ScenarioEncrypted = {
  titre: string
  intro: string
  /** Sel PBKDF2 commun, base64. */
  salt: string
  joueurs: JoueurPublic[]
}
