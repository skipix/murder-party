// Transforme le scénario en clair en scénario chiffré, prêt à être déployé.
//
//   npm run encrypt                      → scenario/scenario.json (ou l'exemple)
//   npm run encrypt -- chemin/vers.json
//
// Seule la sortie (src/data/scenario.enc.json) est commitée. Le fichier source
// reste sur ta machine : le repo est public.

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { deriveKey, normalizeCode, randomSalt, seal } from '../src/lib/crypto.ts'
import type { JoueurPublic, ScenarioEncrypted, ScenarioSource } from '../src/lib/types.ts'

const DEFAULT_INPUT = existsSync('scenario/scenario.json')
  ? 'scenario/scenario.json'
  : 'scenario/scenario.example.json'
const OUTPUT = 'src/data/scenario.enc.json'

const input = process.argv[2] ?? DEFAULT_INPUT
const source = JSON.parse(await readFile(input, 'utf8')) as ScenarioSource

verifier(source)

const salt = randomSalt()
const joueurs: JoueurPublic[] = []
for (const j of source.joueurs) {
  const keyAcces = await deriveKey(j.codeAcces, salt)
  const keyFouille = await deriveKey(j.codeFouille, salt)
  joueurs.push({
    id: j.id,
    nom: j.nom,
    role: j.role,
    perso: await seal(keyAcces, { script: j.script, secrets: j.secrets }),
    fouille: await seal(keyFouille, { objets: j.fouille }),
  })
}

const out: ScenarioEncrypted = { titre: source.titre, intro: source.intro, salt, joueurs }
await writeFile(OUTPUT, JSON.stringify(out, null, 2) + '\n')

console.log(`${input} → ${OUTPUT}\n`)
console.log('Codes à distribuer (à garder pour le MJ) :\n')
console.table(
  source.joueurs.map((j) => ({ joueur: j.nom, accès: j.codeAcces, fouille: j.codeFouille })),
)

/** Un code qui ouvre deux choses, c'est un secret qui fuit. */
function verifier(s: ScenarioSource): void {
  const erreurs: string[] = []
  const ids = new Set<string>()
  const codes = new Map<string, string>()

  for (const j of s.joueurs) {
    if (ids.has(j.id)) erreurs.push(`id en double : ${j.id}`)
    ids.add(j.id)
    for (const [label, code] of [
      [`accès de ${j.nom}`, normalizeCode(j.codeAcces)],
      [`fouille de ${j.nom}`, normalizeCode(j.codeFouille)],
    ]) {
      if (code.length < 4) erreurs.push(`code trop court (${label}) : "${code}"`)
      const deja = codes.get(code)
      if (deja) erreurs.push(`même code pour ${deja} et ${label}`)
      codes.set(code, label)
    }
  }

  if (erreurs.length) {
    console.error('Scénario invalide :\n- ' + erreurs.join('\n- '))
    process.exit(1)
  }
}
