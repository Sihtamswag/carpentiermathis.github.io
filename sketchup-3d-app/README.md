# Modeleur 3D (app desktop)

Application desktop de modélisation 3D, inspirée des concepts de SketchUp
(dessin de formes, push/pull, navigation caméra). Construite avec Electron
et Three.js — implémentation propre, indépendante du code de SketchUp.

Ce n'est pas un clone de SketchUp : c'est un outil de modélisation simple
et fonctionnel, avec un socle solide sur lequel ajouter des fonctionnalités
au fil du temps (groupes, calques, snapping avancé, cotes, etc.).

## Installation

```bash
cd sketchup-3d-app
npm install
npm start
```

## Utilisation

- **Sélection** : cliquez-glissez pour orbiter la caméra, molette pour zoomer,
  clic droit-glissé pour déplacer la vue (pan).
- **Dessiner** : cliquez sur le sol pour poser les points d'une forme
  (polygone quelconque), `Entrée` pour la fermer, `Échap` pour annuler.
  Une fois fermée, la forme passe automatiquement en mode Push/Pull.
- **Push/Pull** : cliquez une forme puis faites glisser la souris
  verticalement pour lui donner du volume (hauteur).
- **Nouveau** : efface la scène.
- **Enregistrer / Ouvrir** : sauvegarde/charge le projet au format JSON
  (`.json`), propriétaire à cette app.
- **Exporter OBJ** : exporte le modèle en `.obj` (Wavefront), lisible par
  la plupart des logiciels 3D (Blender, SketchUp lui-même, etc.).

## Limites connues (v1)

- Le push/pull ne gère que la hauteur globale de chaque forme (pas
  l'extrusion de faces latérales individuelles).
- Pas de gestion de groupes/composants, calques, texte, cotation.
- Pas d'import de fichiers `.skp` (format propriétaire fermé de SketchUp).
- Formats de fichiers propres à l'app (JSON) + export OBJ pour interop.

## Stack technique

- [Electron](https://www.electronjs.org/) — coquille desktop
- [Three.js](https://threejs.org/) — rendu et géométrie 3D
