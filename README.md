# aarg.dev

Personal website for [aarg.dev](https://aarg.dev). A minimal landing page with links to projects and services.

## Stack

- React 19 + Vite
- Tailwind CSS v4
- React Router v7

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

Served in production by **NGINX** (static `dist/`, with SPA fallback for React Router),
supervised by an **NSSM Windows service** named `aarg-dev`. Cloudflare terminates TLS and
the tunnel forwards `aarg.dev` to nginx on `localhost:4173`.

Requires nginx for Windows installed at `C:\nginx`.

Install / reinstall the service (builds `dist/`, validates the config, registers nginx) —
**run from an elevated PowerShell**:

```powershell
.\scripts\install-service.ps1
```

Remove it:

```powershell
.\scripts\uninstall-service.ps1
```

After a content change, rebuild and restart:

```powershell
npm run build
Restart-Service aarg-dev
```

- `nginx.conf` — the nginx server config (uses the shared `C:\nginx` binary).
- `scripts/install-service.ps1` — builds and registers nginx as the `aarg-dev` service.
