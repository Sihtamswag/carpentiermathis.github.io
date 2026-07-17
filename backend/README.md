# Business Agents OS — Backend

Un vrai backend Node.js/Express pour le système multi-agents : base de données
persistante, pipeline planifié (cron), envoi réel d'emails de prospection, et
publication de contenu via webhook. Contrairement à la version `/agents-system`
(100% navigateur, aucune donnée hors de ton appareil), cette version tourne en
continu sur un serveur — donc elle nécessite un vrai login et une vraie
réflexion sur l'hébergement.

## Ce qui automatise réellement quelque chose

| Fonctionnalité | Comment |
|---|---|
| Pipeline sur horaire | `node-cron` lit `PIPELINE_CRON`, lance les 6 appels (CEO + 5 agents + debrief) tout seul, sauvegarde le run en base |
| Résumé automatique par email | Après un run planifié, un email est envoyé à `NOTIFY_EMAIL` via SMTP |
| Emails de prospection réels | Le Sales Rep peut envoyer un vrai email à un prospect (pas juste un brouillon) via `POST /api/leads/:id/send-email` |
| Publication de contenu | `POST /api/content/:id/publish` appelle un webhook externe (Zapier/Make/n8n) que tu configures |

## 1. Choisir un hébergement

Le code ne se déploie pas tout seul — il faut le faire tourner quelque part.
Trois options, de la plus simple à la plus flexible :

### Option A — Railway (recommandé, gratuit pour démarrer)
1. Crée un compte sur [railway.app](https://railway.app), connecte ton compte GitHub.
2. "New Project" → "Deploy from GitHub repo" → sélectionne ce repo.
3. Dans les paramètres du service, mets **Root Directory** sur `backend`.
4. Railway détecte `package.json` et lance `npm install` puis `npm start` automatiquement.
5. Ajoute les variables d'environnement (section 3 ci-dessous) dans l'onglet "Variables".
6. Railway te donne une URL publique (`https://xxx.up.railway.app`) — c'est ton backend.

### Option B — Render (gratuit aussi, un peu plus lent au démarrage)
1. [render.com](https://render.com) → "New Web Service" → connecte le repo.
2. Root Directory : `backend`. Build command : `npm install`. Start command : `npm start`.
3. Ajoute les variables d'environnement dans l'onglet "Environment".

### Option C — Ton propre serveur/VPS (Docker)
```bash
cd backend
docker build -t business-agents-os .
docker run -d -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data business-agents-os
```
Mets un reverse proxy (Caddy/nginx) devant avec HTTPS si tu exposes ça sur internet.

## 2. Ton compte admin

Rien à faire manuellement : au démarrage, le serveur regarde `ADMIN_EMAIL` /
`ADMIN_PASSWORD` et crée (ou met à jour) ton compte automatiquement, avant
même d'écouter sur le port — donc pas de commande spéciale à lancer sur
Railway/Render, `npm start` suffit.

Une fois que tu peux te connecter, tu peux laisser `ADMIN_PASSWORD` tel quel
(le serveur re-hash le même mot de passe à chaque redémarrage, sans effet de
bord) ou le retirer des variables une fois content — dans ce cas ton compte
reste actif avec le dernier mot de passe haché en base, tu n'as juste plus de
copie en clair qui traîne dans les variables d'environnement.

## 3. Variables d'environnement

Voir `.env.example` pour la liste complète. Les indispensables :

- `JWT_SECRET` — génère avec `openssl rand -hex 32`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — ton compte est créé automatiquement au démarrage
- `OPENAI_API_KEY` — la clé vit sur le serveur maintenant, plus dans le navigateur
- `PIPELINE_CRON` — ex: `0 8 * * *` pour tous les jours à 8h serveur ; laisse vide pour désactiver
- `PIPELINE_BUSINESS_CONTEXT` — valeur de secours si tu n'as pas encore sauvegardé de contexte via l'app

## 4. Configurer l'envoi d'emails réels

### Recommandé — Resend (API HTTP, pas de blocage de port possible)
Beaucoup d'hébergeurs (Railway inclus) bloquent les connexions SMTP sortantes
(port 465/587) par défaut — ça se manifeste par un timeout, pas une erreur
claire. Resend contourne le problème en envoyant via une simple requête HTTPS.
1. Crée un compte gratuit sur [resend.com](https://resend.com) (pas de carte bancaire).
2. **API Keys** → crée une clé, copie-la dans `RESEND_API_KEY`.
3. Pour commencer sans configurer de domaine, laisse `EMAIL_FROM=Business Agents OS <onboarding@resend.dev>` —
   ça fonctionne tout de suite mais seulement pour t'envoyer à toi-même. Pour
   envoyer à de vrais prospects, vérifie ton propre domaine dans Resend
   (**Domains** → ajoute des enregistrements DNS chez ton registrar) puis
   utilise `EMAIL_FROM="Toi <toi@tondomaine.com>"`.

### Alternative — SMTP classique (Gmail, etc.)
Si tu préfères SMTP (ou que RESEND_API_KEY n'est pas défini, le serveur bascule
automatiquement dessus) : active la validation en 2 étapes sur ton compte
Google, crée un [mot de passe d'application](https://myaccount.google.com/apppasswords),
puis `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`. Ça marche
en local ou sur des hébergeurs qui n'ont pas ce blocage — teste d'abord.

Teste avec le bouton **"Tester l'email"** dans l'onglet Pipeline (ou `POST /api/pipeline/test-email`) — ça t'envoie un email à `NOTIFY_EMAIL`.

## 5. Configurer la publication de contenu

Le plus simple : crée un **Zap** (Zapier) ou un scénario **Make**/**n8n** avec un
déclencheur "Webhook" (URL générée automatiquement), puis ajoute une étape qui
poste sur Instagram/LinkedIn/X à partir des champs reçus (`title`, `channel`,
`body`). Colle cette URL dans `PUBLISH_WEBHOOK_URL`.

C'est plus simple que d'intégrer directement les API Meta/LinkedIn/X (chacune
demande son propre compte développeur et sa propre revue d'app) — si tu veux
une intégration directe plus tard, il faudra créer ces apps toi-même et je
pourrai écrire le code pour les appeler une fois que tu as les identifiants.

## 6. Lancer en local pour tester

```bash
cd backend
npm install
cp .env.example .env   # remplis au moins JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, OPENAI_API_KEY
npm start
```
Ouvre `http://localhost:3000`, connecte-toi avec `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Sécurité

- Un seul compte existe (toi). Le login est protégé par mot de passe haché
  (bcrypt) + limite de tentatives (10 / 15 min / IP).
- Toutes les routes `/api/*` sauf `/api/auth/login` exigent un token JWT valide.
- La base SQLite (`data.sqlite`) contient toutes tes données — **ne la commite
  jamais** (déjà dans `.gitignore`). Sauvegarde-la si tu veux un backup.
- `OPENAI_API_KEY` et les identifiants SMTP vivent uniquement dans les
  variables d'environnement du serveur, jamais dans le code ni dans le repo.
