# Sprint 6B — Remises & caisse

## Ordre d'installation

1. Dans Supabase SQL Editor, exécuter :
   `supabase/migrations/010_sprint6b_remises_caisse.sql`

2. Vérifier le message :
   `Success. No rows returned`

3. Fusionner la PR Sprint 6B dans `main`.

4. Fermer complètement la PWA puis la rouvrir (cache V4).

## Tests à faire avant Sprint 6C

- L'onglet **Remises & caisse** apparaît avant Pilotage.
- La période par défaut est le mois courant.
- Le fonds de caisse cible peut être saisi et enregistré.
- Les paiements espèces de la période apparaissent avec leur vente, date et montant.
- **Proposer une remise** sélectionne des lignes en tenant compte du fonds de caisse cible.
- Une sélection peut être affectée à **Conserver en caisse**.
- Une sélection peut devenir une remise espèces, avec numéro automatique si le nom est laissé vide.
- Une ligne conservée en caisse peut ensuite être déplacée vers une remise bancaire.
- Les chèques peuvent être regroupés dans une remise.
- Les dates de dépôt et de crédit bancaire font évoluer le statut : Préparée → Déposée → Créditée.
- Une remise non créditée peut être annulée et ses paiements redeviennent disponibles.
- Les montants sélectionnés sont affichés avant validation.

## Important

Ce sprint suit la circulation physique et bancaire des espèces et chèques.
Le recalage complet du Pilotage (CA encaissé / bancarisé / fonds de caisse / remises créditées)
est prévu au Sprint 6C.
