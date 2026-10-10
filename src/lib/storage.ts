// Tout vit dans le localStorage du téléphone du joueur : qui il est, et ce
// qu'il a déjà trouvé. Pas de serveur, un refresh ne perd rien.

export type Session = { joueurId: string; code: string }
/** Objets trouvés, par id de joueur fouillé. */
export type Trouvailles = Record<string, string[]>

const SESSION_KEY = 'mp:session'
const FOUND_KEY = 'mp:trouvailles'

export function loadSession(): Session | null {
  return read<Session>(SESSION_KEY)
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadTrouvailles(): Trouvailles {
  return read<Trouvailles>(FOUND_KEY) ?? {}
}

export function saveTrouvailles(found: Trouvailles): void {
  localStorage.setItem(FOUND_KEY, JSON.stringify(found))
}

export function clearAll(): void {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(FOUND_KEY)
}

function read<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
