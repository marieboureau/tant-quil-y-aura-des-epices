# Sprint 6C — cadrage Pilotage

## Objectif
Recaler le Pilotage mensuel à partir des données du Sprint 6B sans modifier la logique réglementaire déjà retenue.

## Indicateurs mensuels
- CA encaissé total du mois.
- CA bancarisé : CB + remises espèces créditées + remises chèques créditées.
- Espèces conservées physiquement.
- Remises espèces préparées / déposées / créditées.
- Chèques préparés / déposés / crédités.
- Indicateur affiché sous le nom **Caisse banc** : sous-total analytique des remises espèces dont le libellé commence par `CAISSE N` suivi de 4 chiffres, par exemple `CAISSE N2309`.
- Comparatif analytique : CA total du mois vs CA total moins **Caisse banc**.
  Ce comparatif reste un indicateur de gestion et ne remplace pas le CA encaissé utilisé pour les seuils / URSSAF.

## Comparaison N / N-1
- CA total mensuel N.
- CA total mensuel N-1.
- Écart en euros.
- Taux de réalisation = CA N / CA N-1.
- Pas de ventilation CB / espèces / chèques sur N-1 si la donnée historique n'existe pas.

## Présentation
- Vue mensuelle.
- KPIs en haut.
- Tableau mensuel 12 mois.
- Graphique de comparaison N vs N-1.
- Détail du mois sélectionné.
- Les seuils TVA / micro et le miroir URSSAF restent basés sur le CA encaissé total.

## Historique N-1
Les valeurs mensuelles exactes doivent être reprises du fichier historique fourni par l'utilisateur.
Ne pas inventer de ventilation par moyen de paiement.
