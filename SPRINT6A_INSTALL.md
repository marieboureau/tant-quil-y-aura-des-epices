# Sprint 6A — ordre d'installation

Ne pas importer le catalogue V2 avant d'avoir terminé les étapes ci-dessous.

1. Dans Supabase SQL Editor, exécuter `008_consolidation_etat_reel.sql`.
   - Cette migration archive l'état UX2 déjà présent dans la base.
   - Elle est idempotente.

2. Dans Supabase SQL Editor, exécuter `009_sprint6a_catalogue_vente.sql`.
   - Ajoute les modes de tarification.
   - Ajoute les prix par paliers.
   - Ajoute remise / offert.
   - Ajoute le moteur `complete_sale_v2`.
   - Fixe la fidélité à 10 passages.

3. Vérifier qu'aucune erreur SQL n'est affichée.

4. Fusionner la branche `sprint-6a` dans `main`.
   Cloudflare déploiera alors le frontend.

5. Ouvrir l'application et faire les tests suivants avant import réel :
   - un produit à paliers : 25 / 50 / 100 / 200 g ;
   - une quantité intermédiaire (ex. 75 g) ;
   - remise 5 %, 10 %, 20 % et libre ;
   - paiement CB, espèces, chèque ;
   - paiement mixte ;
   - une partie « Offert » ;
   - ticket 100 % offert ;
   - accessoire à prix libre ;
   - fidélité réglée à 10 ;
   - mode hors ligne puis synchronisation.

6. Seulement après ces tests, importer le CSV produit V2.

Important : les colonnes `source_photo`, `needs_review` et `notes` du fichier de travail sont des colonnes d'audit.
L'importeur les ignore volontairement ; elles ne modifient pas le produit en base.
