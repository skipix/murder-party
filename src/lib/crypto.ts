// Chiffrement symétrique via la Web Crypto API, disponible telle quelle dans
// le navigateur et dans Node ≥ 20 (globalThis.crypto). Le même module sert
// donc au script de build (chiffrer) et à l'app (déchiffrer).
//
// Un code joueur → clé AES-GCM 256 via PBKDF2. Le sel est public et commun à
// tout le scénario : une seule dérivation par code saisi suffit pour tester
// tous les blocs.

const PBKDF2_ITERATIONS = 100_000

/** Un bloc chiffré, tel qu'il est stocké dans le JSON déployé. */
export type Sealed = {
  /** Nonce AES-GCM, base64. */
  iv: string
  /** Chiffré + tag d'authentification, base64. */
  data: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Les codes sont insensibles à la casse, aux espaces et aux tirets. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function deriveKey(code: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizeCode(code)),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

/**
 * Renvoie `null` si la clé est mauvaise : AES-GCM authentifie le contenu, un
 * mauvais code ne produit jamais de texte corrompu, il échoue franchement.
 */
export async function open<T>(key: CryptoKey, sealed: Sealed): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.data),
    )
    return JSON.parse(decoder.decode(plain)) as T
  } catch {
    return null
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
