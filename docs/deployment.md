# Deployment

Production runs on a Mac mini under Docker Compose. Public traffic reaches it
through a Cloudflare Tunnel — the host has no inbound ports open on the internet.

```
browser → Cloudflare edge (TLS) → cloudflared tunnel → 127.0.0.1:80 (nginx)
                                                        ├─ /        → client/dist (static SPA)
                                                        └─ /api/    → app:3000 (Fastify)
```

## Why there is no certbot

TLS is terminated at the Cloudflare edge, so the origin speaks plain HTTP and
never needs a certificate of its own. `nginx/default.conf` therefore listens on
port 80 only and hardcodes `X-Forwarded-Proto: https`, because the tunnel always
delivers requests that started as HTTPS.

The nginx container publishes `127.0.0.1:80:80` — bound to loopback, so the
origin is unreachable except through the tunnel.

## What lives outside this repository

Nothing about Cloudflare is committed here, and nothing here needs to be.

| What | Where | Notes |
|---|---|---|
| Tunnel config | `/etc/cloudflared/config.yml` | root-owned; maps hostnames → local ports |
| Tunnel credentials | `/etc/cloudflared/<tunnel-id>.json` | secret, mode `600` |
| App secrets | `.env` in the project root | gitignored; see `.env.example` |

`cloudflared` runs as a system service (`tunnel run macmini`) and is shared with
other sites on the same host, so it is managed outside this project entirely.

The tunnel's ingress entry for this app is:

```yaml
  - hostname: pickme.mov
    service: http://localhost:80
  - hostname: www.pickme.mov
    service: http://localhost:80
```

## Deploying

```bash
./scripts/deploy.sh
```

It rebuilds the base image when dependencies changed, builds server and client
inside Docker, writes `.git-hash` for the version display, and restarts the
containers. nginx picks up `nginx/default.conf` directly as a read-only mount,
so a config change needs only `docker compose up -d nginx`.

## Moving to a different host

The origin makes no assumption about Cloudflare beyond "TLS ends upstream". Any
reverse proxy that terminates TLS and forwards to `127.0.0.1:80` works unchanged.
If you ever need the origin to terminate TLS itself, the previous certbot setup
is in git history (removed in the commit that added this file).
