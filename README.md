# Secret Santa App

Simple family Secret Santa web app (single-container Node.js app) that uses a MariaDB / MySQL database.

Features
- User registration and login (JWT)
- Add wishlist items with optional link and "recommended" flag
- Get up to N recommendations (defaults to 5)
- Static frontend served from the same container

Quick start
1. Create a MariaDB / MySQL database and run the SQL in `db/schema.sql` to create tables.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` (or DB_* vars) and `JWT_SECRET`.
3. Build and run locally:

```powershell
npm install
npm run build
node server.js
```

Docker (build & run):

```powershell
docker build -t secret-santa-app:latest .
docker run -e DATABASE_URL="mysql://user:pass@host:3306/secret_santa_db" -e JWT_SECRET="your_secret" -p 3000:3000 secret-santa-app:latest
```

Local React dev & build notes
- To run the React dev server (hot reload) for UI development, open a terminal in `client/` and run:

```powershell
cd client
npm install
npm run dev
```

- To build the React app and serve it with the Express backend (production mode):

```powershell
cd B:\SecretSanta
npm install
npm run build
node server.js
```

The `npm run build` step installs client deps and builds the static assets to `client/dist`. The Express server will serve these files automatically.

CI / Docker Image
The included GitHub Actions workflow `/.github/workflows/docker-image.yml` builds and pushes the image. Set the repository secrets:
- `DOCKER_REGISTRY` (e.g. `docker.io` or `ghcr.io/<owner>`)
- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- `IMAGE_NAME` (e.g. `myuser/secret-santa`)

Next steps and notes
- You can run `db/schema.sql` using the `mysql` client or your DB admin tool to create the tables. Example (replace user/root as appropriate):

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS secret_santa_db;"
mysql -u root -p secret_santa_db < db/schema.sql
```
- Consider enabling HTTPS/proxy and strong JWT_SECRET in production.
