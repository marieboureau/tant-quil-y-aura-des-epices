# Rapprochement fournisseurs — cahier Benoît (09/10/2026)

Sources : les 15 photos IMG_1078 à IMG_1093 (sans IMG_1091) fournies par l'utilisatrice, et `Tarif-CAILLEAU-Herboristerie_D.pdf` (2026).

## Mise à jour réalisée en direct dans Supabase
- 51 rapprochements à forte confiance, dont 49 fiches précédemment sans fournisseur principal.
- Produits renseignés : DB (35 au total après harmonisation), Alain Pilloy (8), Orientis Gourmet (6), George Cannon (2).
- Aucune valeur fournisseur historique différente n'a été remplacée.
- Deux références DB déjà attribuées ont été respectées ; Lapacho Orange Vanille a reçu sa référence de commande 22119.
- 15 autres correspondances potentiellement ambiguës sont listées `a_verifier` dans le CSV source.
- Aucun stock, tarif de vente, total client, événement de fidélité ni vente réelle n'a été modifié.

## Alternatives Cailleau (prix HT indiqués sur une base de 100 g)
| SKU | Produit | DB réf. | Cailleau réf. | Prix Cailleau HT/100g | Tarif source |
|---|---|---|---|---|---|
| PRD-0015 | Thé noir de Ceylan | 22491 | THE17 | 2,750 € | 27,50 €/kg, page 21 |
| PRD-0025 | Thé noir Pu-Erh nature (Yunnan) | 22842 | THE30 | 2,935 € | 29,35 €/kg, page 21 |
| PRD-0035 | Thé vert Fleur de Jasmin | 22508 | THE13 | 2,730 € | 27,30 €/kg, page 21 |

**À vérifier avant toute commande** : ces références Cailleau représentent des alternatives commerciales à comparer au produit DB (grades, arômes, certification bio, goût). Les prix du catalogue Cailleau sont HT, hors transport et TVA non récupérable. Les prix DB d'achat restent à renseigner par Benoît.

## État Supabase vérifié le 09/10/2026
- 241 produits, 130 fournisseurs principaux renseignés, 111 non renseignés.
- 94 produits avec prix d'achat actuellement renseigné ; 37 produits avec fournisseur connu mais prix d'achat manquant.
- 3 fournisseurs secondaires Cailleau enregistrés.
- Les champs secondaires sont présents dans Supabase mais seront visibles/modifiables dans l'interface à la fusion ultérieure du Sprint 6F.

Le fichier `data/rapprochement_cahier_benoit_20261009.csv` documente pour chaque ligne la photo et la référence de commande, et sépare les correspondances certaines des points de vigilance.
