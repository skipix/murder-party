# Budget

Petit outil local pour suivre ton budget à partir de tes comptes bancaires,
via l'API [Enable Banking](https://enablebanking.com) (agrégateur DSP2) :

- tableau de toutes les transactions (tri, recherche, filtres, export CSV) ;
- catégorisation automatique par règles, modifiable à la main ligne par ligne ;
- graphiques : revenus/dépenses par mois, dépenses par catégorie ;
- budgets mensuels par catégorie avec suivi de consommation.

Tout tourne sur ta machine : un serveur Node sans dépendance signe les requêtes
avec ta clé privée et stocke les transactions dans `data/db.json`. Rien n'est
envoyé ailleurs qu'à Enable Banking, et le serveur n'écoute que sur `127.0.0.1`.
`config.json`, la clé `.pem` et `data/` sont ignorés par git.

## Essayer sans banque

```sh
cd budget
npm run demo        # http://localhost:3000, données fictives (data/demo.json)
```

## Brancher Enable Banking

1. Crée un compte sur <https://enablebanking.com/cp/> puis une application
   (**Applications → Register new application**).
   - Environnement : *Sandbox* pour tester avec des banques fictives,
     *Production* pour tes vrais comptes. En production, l'accès à tes propres
     comptes s'active en liant les comptes à l'application depuis le panneau
     de contrôle (usage personnel, gratuit).
   - URL de redirection : `http://localhost:3000/callback`.
   - Laisse le panneau générer la clé : un fichier `<application-id>.pem` est
     téléchargé. Place-le dans `budget/`.
2. Copie `config.example.json` en `config.json` et renseigne `applicationId`
   et `privateKeyPath`.
3. Lance le serveur :

   ```sh
   cd budget
   npm start           # Node 18+ requis, aucune installation nécessaire
   ```

4. Dans l'interface : **Connecter une banque** → choisis ta banque → authentifie-toi
   chez elle → retour automatique sur l'outil → **Synchroniser**.

Si Enable Banking refuse `localhost` comme URL de redirection, déclare-en une autre
(par ex. `https://enablebanking.com/`) dans l'application et dans `redirectUrl` :
après l'authentification, copie l'adresse de la page d'arrivée et colle-la dans
« La redirection n'a pas ramené ici ? » de la fenêtre de connexion.

## Bon à savoir

- **Durée d'accès** : le consentement bancaire dure au maximum 90 à 180 jours selon
  la banque (date visible dans Réglages → Comptes). Ensuite, reconnecte la banque :
  les comptes et l'historique déjà téléchargés sont conservés.
- **Historique** : la première synchro remonte `historyDays` jours (365 par défaut).
  Beaucoup de banques ne donnent que 90 jours hors de la première connexion.
- **Synchros suivantes** : seuls les derniers jours sont relus (depuis la dernière
  synchro, moins 7 jours) ; les opérations « à venir » sont remplacées quand elles
  sont comptabilisées.
- **Règles** (Réglages) : une par ligne, `motif => Catégorie`, où le motif est une
  expression régulière insensible à la casse testée sur le libellé et la contrepartie.
  Une catégorie choisie dans le tableau l'emporte toujours sur les règles.
- Par défaut, les catégories *Épargne* et *Virements internes* sont exclues des totaux
  (case à cocher dans les filtres) pour ne pas compter deux fois un virement entre tes comptes.

## Configuration (`config.json`)

| Clé | Rôle | Défaut |
|---|---|---|
| `applicationId` | ID de l'application Enable Banking | — |
| `privateKeyPath` | Chemin de la clé privée `.pem` | — |
| `redirectUrl` | URL de retour déclarée dans l'application | — |
| `port` | Port local | `3000` |
| `country` | Pays proposé par défaut pour la liste des banques | `FR` |
| `historyDays` | Profondeur de la première synchronisation | `365` |
| `apiOrigin` | URL de l'API | `https://api.enablebanking.com` |
