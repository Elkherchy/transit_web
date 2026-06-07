# Polices pour le PDF (transit et facture)

**Vercel** : Les TTF `Cairo-Regular.ttf` et `Cairo-Bold.ttf` doivent être **committés** dans ce dossier pour que l'arabe s'affiche correctement en production. Le dossier `public/` est inclus dans le déploiement.

**Configuration actuelle :**
- Priorité 1 : TTF dans `public/fonts/` (recommandé pour Vercel)
- Priorité 2 : WOFF de `@fontsource/cairo` en base64 (fallback si TTF absents)

**Si l'arabe s'affiche mal sur Vercel :**
1. [Google Fonts – Cairo](https://fonts.google.com/specimen/Cairo) → Download family
2. Extraire `Cairo-Regular.ttf` et `Cairo-Bold.ttf` du zip
3. Les placer ici avec exactement ces noms
4. Committer et redéployer
