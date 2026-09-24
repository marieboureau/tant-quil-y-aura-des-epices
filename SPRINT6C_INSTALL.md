# Sprint 6C — Pilotage consolidé

## Ce que le sprint ajoute

- Mois analysé sélectionnable dans Pilotage.
- Vue mensuelle consolidée :
  - CA total encaissé ;
  - Caisse banc ;
  - CA après Caisse banc ;
  - CA bancarisé ;
  - espèces conservées ;
  - remises préparées / déposées / créditées.
- Comparaison N / N-1 :
  - CA N-1 ;
  - écart en euros ;
  - taux de réalisation.
- Graphique mensuel :
  - année N détaillée en CB / chèques / espèces hors Caisse banc / Caisse banc ;
  - année N-1 en une seule barre grise ;
  - CA total affiché au-dessus de chaque barre.
- Compte de gestion enrichi avec les mêmes indicateurs mensuels.

## Historique N-1 chargé

Source : `Prev Benoit_RevMB_160426.xlsx`, feuille `CA et saisonnalité`.

Les 12 CA mensuels 2025 sont chargés en base par la migration 012.

## Installation

1. Dans Supabase SQL Editor, exécuter :
   `supabase/migrations/012_sprint6c_historique_n1.sql`

2. Vérifier :
   `Success. No rows returned`

3. Fusionner la PR Sprint 6C.

4. Attendre le build Cloudflare. Si le build reste bloqué à `Initializing`, utiliser `Retry build`.

5. Fermer/réouvrir l'application ou faire un rechargement forcé. Cache PWA : V9.

## Tests

- Pilotage affiche le mois courant par défaut.
- Changer le mois analysé met à jour les KPIs.
- Le graphique affiche 2 barres par mois :
  - barre N détaillée ;
  - barre N-1 grise.
- Les montants CA sont visibles au-dessus des deux barres.
- Septembre 2025 affiche 7 249,99 € dans la comparaison.
- Le cumul 2025 chargé vaut 88 391,79 €.
- Le CA bancarisé correspond aux CB + remises bancaires créditées pour les ventes du mois.
- Les espèces conservées correspondent aux espèces actuellement affectées aux fonds de caisse.
