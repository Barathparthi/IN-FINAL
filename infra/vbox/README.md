# VirtualBox Ubuntu Deployment Scripts

These scripts deploy the backend + database + Redis + Judge0 with Docker Compose,
and serve the frontend with Nginx from the same Ubuntu VM.

## 1) Bootstrap Ubuntu

```bash
bash infra/vbox/01_bootstrap_ubuntu.sh
```

## 2) Create VM deployment config

```bash
cp infra/vbox/.env.vm.example infra/vbox/.env.vm
nano infra/vbox/.env.vm
```

Minimum required in `.env.vm`:
- `PUBLIC_BASE_URL` (example: `http://192.168.56.10`)
- one of `GROQ_API_KEY` or `OPENAI_API_KEY`

## 3) Deploy the app stack

```bash
bash infra/vbox/02_deploy_app.sh
```

This will:
- generate `infra/vbox/.env.runtime`
- generate compose/docker artifacts in `infra/vbox`
- build frontend with Node 20 in Docker
- sync frontend static assets to `/var/www/indium`
- start Postgres, Redis, Judge0, and backend containers
- configure Nginx to serve frontend and proxy API/WebSocket traffic

## 4) Check status

```bash
bash infra/vbox/03_status.sh
```

## Notes

- On first setup, re-login once after bootstrap to apply Docker group membership.
- To redeploy after code changes, run `bash infra/vbox/02_deploy_app.sh` again.
- If your VM uses Host-only networking, use the Host-only IP for `PUBLIC_BASE_URL`.
