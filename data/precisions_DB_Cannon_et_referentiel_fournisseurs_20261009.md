# Complément au cahier de Benoît — précision du 09/10/2026

## Règles confirmées par l'utilisatrice
- Toutes les références à **5 chiffres** commençant par **21** ou **22** dans le cahier sont des références **DB**.
- La page `IMG_1089` (thés, tisanes et eaux de fruits), consécutive à la page `IMG_1090` sous l'en-tête George Cannon, relève de **George Cannon**, même sans références fournisseur.

Cette information confirme l'identité du fournisseur ; elle **n'établit pas automatiquement l'identité des compositions** entre une désignation du cahier et une fiche existante portant un nom différent.

## Changements appliqués directement dans Supabase

| SKU | Produit | Modification | Source |
|---|---|---|---|
| PRD-0043 | Thé vert Rêve de la Martinique | Principal George Cannon | IMG_1089 |
| PRD-0089 | Tisane Sérénité | Principal George Cannon | IMG_1089 |
| PRD-0087 | Tisane Relaxation | Principal George Cannon | IMG_1089 |
| PRD-0055 | Eau de fruits Kiwi Royal | DB réf. 22663 conservé principal, George Cannon secondaire | IMG_1085 et IMG_1089 |
| PRD-0078 | Tisane Détox | Cailleau T8001 conservé principal, DB réf. 22858 en secondaire | IMG_1084 |
| PRD-0076 | Tisane Digestion | Cailleau T8015 conservé principal, DB réf. 22809 en secondaire | IMG_1084 |

**Sans modification automatique :** la ligne « Tisane Silhouette (Minceur) » sur IMG_1089, potentiellement apparentée à la fiche existante « Tisane Minceur » (actuellement Cailleau), exige la confirmation de la recette. Pareil pour les thés ou infusions DB à référence 21xxx/22xxx dont le libellé varie sensiblement de la fiche catalogue.

## Référentiel fournisseurs
Table `public.suppliers` créée et sécurisée dans Supabase. Elle contient les six fournisseurs déjà présents : Alain Pilloy, Cailleau Herboristerie, DB, George Cannon, Le Comptoir & Co et Orientis Gourmet. Index d'unicité insensible à la casse et politique RLS par organisation. Interface de sélection et gestion d'ajout/désactivation sur la PR 13 (Sprint 6F), encore en brouillon.

Les ventes, prix, stocks et passages de fidélité ne sont pas modifiés par ces corrections fournisseurs.
