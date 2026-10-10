# Murder Party

Site statique pour organiser une murder party. Chaque joueur reçoit un code
d'accès qui ouvre son personnage (script + secrets). Pour fouiller un autre
joueur, il faut obtenir son *code de fouille* et le saisir : les indices
apparaissent.

Tout tourne dans le navigateur, sans serveur. Les scripts et indices sont
chiffrés (AES-GCM, clé dérivée du code) : le site déployé ne contient que
du chiffré, personne ne peut lire les secrets des autres en ouvrant la source.

## Écrire son scénario

1. Copie `scenario/scenario.example.json` en `scenario/scenario.json` (ignoré
   par git : le repo est public, ton scénario reste chez toi).
2. Remplis les joueurs : `script`, `secrets`, `fouille`, et deux codes par
   joueur — `codeAcces` (pour lui) et `codeFouille` (pour ceux qui le fouillent).
   Les codes sont insensibles à la casse, aux espaces et aux tirets.
3. `npm run encrypt` : génère `src/data/scenario.enc.json` et affiche le
   tableau des codes à distribuer. Commite ce fichier chiffré.

## Développer

```sh
npm install
npm run dev        # http://localhost:5173/murder-party/
npm run build
```

## Déployer

Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`.
