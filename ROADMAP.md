# Roadmap — Tant qu’il y aura des Épices

## Sprint 1 — Socle
- Supabase
- Base de données
- Login
- Produits
- Clients

## Sprint 2 — Vente
- Panier
- Ticket
- Paiement
- Stock
- Fidélité

## Sprint 2.1 — Finalisation opérationnelle
### Fidélité / Clients
- Passages cumulés
- Progression vers le prochain cadeau
- Cadeaux disponibles / utilisés
- Dernier passage
- Statut actif / inactif
- Attribution d’un cadeau depuis les produits éligibles
- Décrément de stock sans CA

### Historique des ventes
- Numéro de vente lisible et unique comme clé pivot
- Vue Ventes : 1 ligne = 1 ticket
- Vue Lignes de vente : 1 ligne = 1 produit vendu
- Vue Paiements : 1 ligne = 1 moyen de paiement
- Paiements mixtes conservés comme plusieurs lignes liées au même numéro de vente
- Annulation/correction d’une vente sans suppression de l’historique

### Exports / imports
- Export CSV Produits
- Export CSV Clients
- Export CSV Ventes
- Export CSV Lignes de vente
- Export CSV Paiements
- Références stables et lisibles pour produits et clients
- Import CSV avec prévisualisation : nouveaux / modifiés / inchangés / erreurs
- Aucun doublon lors d’un réimport grâce aux références stables

## Sprint 3 — Pilotage
- CA mensuel
- CA cumulé annuel
- Marge brute
- Taux de marge
- Top ventes
- Produits sous seuil
- Seuils TVA / micro
- Bloc URSSAF
- Compte de gestion mensuel + cumul annuel
- Graphique CA + marge brute % + marge nette %

## Sprint 4 — Caisse & trésorerie
- Clôture de caisse
- Import CSV bancaire
- Catégorisation simple
- Prévision 30 / 60 / 90 jours

## Sprint 5 — PWA / offline / sauvegardes
- Application installable sur tablette
- Données locales
- Synchronisation
- Export complet de sauvegarde
- Sauvegarde externe hebdomadaire des bases

## Principe de données
Le numéro de vente est la clé pivot entre :
- la vente / ticket ;
- les lignes de produits ;
- les lignes de paiement.

Cela permet de recouper facilement les données dans Excel sans dupliquer artificiellement le chiffre d’affaires.
