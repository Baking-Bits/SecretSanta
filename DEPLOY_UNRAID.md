Deployment to unRAID

This document explains how to get the GitHub Actions-built Docker image onto your unRAID server and run the Secret Santa app.

1) Choose a container registry
- Docker Hub (docker.io) — easy and common. Use repo `yourdockerhubuser/secret-santa`.
- GitHub Container Registry (ghcr.io) — convenient if building in GitHub Actions.

Pick one and create the appropriate repository on the registry side.

2) Configure GitHub Actions secrets
- For Docker Hub:
  - `DOCKER_REGISTRY`: `docker.io`
  - `DOCKER_USERNAME`: your Docker Hub username
  - `DOCKER_PASSWORD`: a Docker Hub access token or password
  - `IMAGE_NAME`: `yourdockerhubuser/secret-santa`

- For GHCR (GitHub Packages):
  - `DOCKER_REGISTRY`: `ghcr.io`
  - `DOCKER_USERNAME`: your GitHub username (or `OWNER`)
  - `DOCKER_PASSWORD`: a personal access token (PAT) with `write:packages` and `read:packages`
  - `IMAGE_NAME`: `ghcr.io/OWNER/secret-santa`

3) Workflow notes
- The included workflow `/.github/workflows/docker-image.yml` will use the secrets above to push an image tagged `:latest`.
- If you prefer GHCR and want the image to be scoped to the repo owner, set `IMAGE_NAME` accordingly (e.g., `ghcr.io/youruser/secret-santa`).

4) Pull and run on unRAID

Option A — Use unRAID Docker UI
- On your unRAID web UI, go to the Docker tab and click "Add Container" (or "Add from Template").
- Set the `Repository` / `Image` field to the image you built, for example `docker.io/yourdockerhubuser/secret-santa:latest` or `ghcr.io/youruser/secret-santa:latest`.
- Environment variables (add these under the Env section):
  - `DATABASE_URL` = `postgresql://user:pass@host:5432/secret_santa_db`
  - `JWT_SECRET` = `<a strong secret>`
  - (optional) `PORT` = `3000`
- Network: `bridge` is fine. If your DB is reachable only on a specific network, ensure the container can access it.
- Ports: Map container port `3000` to a host port (e.g., `3000:3000`) so family members can reach it.
- Restart policy: `Always` or `Unless stopped`.

Option B — Use SSH / Terminal on your unRAID host
- Pull the image:
```
docker pull docker.io/yourdockerhubuser/secret-santa:latest
```
- Run the container (example):
```
docker run -d \
  --name secret-santa \
  -e DATABASE_URL="postgresql://user:pass@host:5432/secret_santa_db" \
  -e JWT_SECRET="your_strong_secret" \
  -p 3000:3000 \
  --restart unless-stopped \
  docker.io/yourdockerhubuser/secret-santa:latest
```

5) Notes on database access
- The app expects `DATABASE_URL` to point to a Postgres server reachable from the unRAID host. If your DB is on your LAN, use the internal IP/hostname.
- Create the database and run `db/schema.sql` before starting the container.

6) Optional: Configure TLS / reverse proxy
- Serve the app behind your existing reverse proxy (NGINX Proxy Manager, Traefik, Caddy, etc.) for HTTPS and friendly domain names.

7) Troubleshooting
- Logs: check container logs in unRAID UI or via `docker logs -f secret-santa`.
- DB connection errors typically mean `DATABASE_URL` is wrong or network blocked; verify access with `psql` from another host.
- If the server starts but frontend shows auth errors, ensure `JWT_SECRET` is identical (not required to be identical across instances, but tokens signed with different secrets are invalid).

If you'd like, I can also:
- Create a second GitHub Actions workflow that tags releases (v1.0.0) and keeps `latest` for main branch.
- Modify the existing workflow to push to a specific registry (Docker Hub or GHCR) — tell me which one you prefer and I'll update the workflow.
