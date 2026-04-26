# Production Readiness Audit — IN-FINAL

> Audited: Frontend · Backend · Electron Desktop  
> Date: 2026-04-26

---

## 🟢 Overall Verdict

| Part | Status | Blockers |
|------|--------|----------|
| **Backend** | ⚠️ Almost Ready | 3 issues to fix |
| **Frontend** | ⚠️ Almost Ready | 2 issues to fix |
| **Electron** | ✅ Ready | 0 blockers |

---

## 🖥️ Electron Desktop

| Check | Status | Notes |
|-------|--------|-------|
| 0 vulnerabilities | ✅ | `npm audit` = 0 |
| Loads from local files | ✅ | `loadFile()` in prod, `loadURL()` in dev |
| Kiosk / fullscreen lockdown | ✅ | Only in production |
| Content protection (screen rec) | ✅ | Only in production |
| Keyboard lockdown | ✅ | F-keys, Alt+Tab, Ctrl+C all blocked |
| Master exit shortcuts | ✅ | `Alt+Shift+Q` / `Ctrl+Alt+Shift+Q` |
| Exit confirmation for candidates | ✅ | Native dialog, Cancel is default |
| Bluetooth blocked | ✅ | Permission denied + picker cancelled |
| VM detection | ✅ | Win32_ComputerSystem model check |
| VPN detection | ✅ | Network interface keyword scan |
| Process blacklisting | ✅ | AnyDesk, TeamViewer, OBS, etc. |
| Single instance lock | ✅ | `requestSingleInstanceLock()` |
| Graceful crash logging | ✅ | `uncaughtException` + `unhandledRejection` |
| Role-aware exit | ✅ | `set-user-role` IPC from renderer |
| `devTools: isDev` | ✅ | DevTools disabled in production |

**Electron is production-ready. ✅**

---

## 🌐 Frontend

| Check | Status | Notes |
|-------|--------|-------|
| Build config (`vite.config.ts`) | ✅ | `base: './'` for Electron, `'/'` for web |
| HashRouter in Electron | ✅ | Detected via `window.electronBridge.isElectron` |
| Remote error logger | ✅ | `remoteLogger` sends errors to backend |
| Role notification to Electron | ✅ | `setUserRole()` on auth change in App.tsx |
| Env example file exists | ✅ | `.env.example` present |
| Correct API base URL in prod | ✅ | `VITE_API_BASE_URL=/api` in example |

### ❌ Issue 1 — `.env` has a **hardcoded internal IP**

```
VITE_API_BASE_URL=http://10.10.142.96/api     ← hardcoded IP
VITE_BACKEND_URL=http://10.10.142.96:4000     ← hardcoded IP
```

**This `.env` is your local dev file — it must NOT be used for production builds.**
When you run `npm run build` for the web deployment, these IP values get baked into the JS bundle.

**Fix:** Use a `.env.production` file for production builds:
```env
# .env.production
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=https://your-production-domain.com
```
Vite automatically picks `.env.production` during `npm run build`.

### ❌ Issue 2 — `remoteLogger` has a **double `/api` path bug**

In `remoteLogger.ts` line 25:
```ts
const API_URL = import.meta.env.VITE_API_BASE_URL || '/api'
// VITE_API_BASE_URL is already "http://10.10.142.96/api"
await fetch(`${API_URL}/api/internal/logs`, ...)
// → Results in: http://10.10.142.96/api/api/internal/logs  ← WRONG
```

The `/api` is doubled. Fix: use `/internal/logs` as the suffix, not `/api/internal/logs`.

---

## ⚙️ Backend

| Check | Status | Notes |
|-------|--------|-------|
| Helmet security headers | ✅ | `helmet()` applied |
| CORS properly configured | ✅ | `CLIENT_URL` driven, not hardcoded |
| Rate limiting | ✅ | Auth + API + Strike limiters |
| Graceful shutdown | ✅ | SIGTERM/SIGINT handled, 10s forced exit |
| Env validation with Zod | ✅ | `EnvSchema.parse(process.env)` at startup |
| No `console.log` in source | ✅ | All logging via `pino` logger |
| Error handler catches all cases | ✅ | Zod, Prisma, JWT, 500 fallback |
| Docker multi-stage build | ✅ | Builder + slim runtime image |
| `x-powered-by` header removed | ✅ | `app.disable('x-powered-by')` |
| Prisma connection pooling | ✅ | `pgbouncer=true` in DATABASE_URL |

### ❌ Issue 1 — `NODE_ENV=development` in `.env`

```env
NODE_ENV=development    ← Line 50 in backend/.env
```

On your production server, this **must** be `NODE_ENV=production`. This affects:
- Express error output (stack traces leaked in dev mode)
- `ENABLE_API_DOCS=true` → your API docs are publicly accessible in prod

**Fix on your server:** Set `NODE_ENV=production` and `ENABLE_API_DOCS=false` in your production environment variables (not in the `.env` file committed to the repo).

### ❌ Issue 2 — `ENABLE_API_DOCS=true` in `.env`

The Scalar API documentation UI is exposed at `/docs`. In production, this should be disabled:
```env
ENABLE_API_DOCS=false
```

### ❌ Issue 3 — Real secrets committed in `.env`

Your `backend/.env` contains live production secrets:
- `OPENAI_API_KEY=sk-proj-...` (real OpenAI key)  
- `SMTP_PASS=ercf zvme aawt jcvp` (real Gmail app password)
- `CLOUDINARY_API_SECRET=...` (real key)
- `DATABASE_URL` with real credentials

> [!CAUTION]
> If this repo is ever pushed to GitHub (even private), these secrets are exposed. 
> Rotate these keys immediately if the repo is/was public. 
> Move all secrets to your deployment platform's environment variable settings (e.g. Render dashboard, AWS Secrets Manager, etc.), never store them in `.env` files that get committed.

The `.gitignore` does list `.env` — **verify** `.env` is not currently tracked by git:
```bash
git ls-files backend/.env
```
If it shows any output, the file is tracked and must be removed:
```bash
git rm --cached backend/.env
```

---

## 📋 Pre-Production Checklist

### Backend (server)
- [ ] Set `NODE_ENV=production` in server env
- [ ] Set `ENABLE_API_DOCS=false` in server env
- [ ] Verify `CLIENT_URL` / `FRONTEND_URL` = your real production domain
- [ ] Rotate any secrets if repo was ever public
- [ ] Run `npm run build` then `npm start` (not `npm run dev`)
- [ ] Confirm `JUDGE0_API_URL` points to live Judge0 instance

### Frontend (web)
- [ ] Create `.env.production` with `VITE_API_BASE_URL=/api`
- [ ] Fix double `/api` path in `remoteLogger.ts`
- [ ] Run `npm run build` (Vite auto-uses `.env.production`)
- [ ] Serve `dist/` from Nginx/CDN

### Frontend (Electron)
- [ ] Run `npm run build` from `desktop/` directory  
  (This builds frontend with `VITE_BUILD_TARGET=electron`, copies to `renderer/`, then packages the `.exe`)
- [ ] Test the portable `.exe` from `desktop/dist/`

### Electron
- [ ] Verify `build/icon.png` exists before packaging
- [ ] Test `Alt+Shift+Q` shows confirmation dialog as candidate
- [ ] Test `Alt+Shift+Q` exits immediately as admin

---

## 🔧 Fixes Needed (Code Changes)

### Fix 1 — Create `frontend/.env.production`
```env
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=https://YOUR_PRODUCTION_DOMAIN
VITE_APP_NAME=INDIUM
VITE_APP_VERSION=1.0.0
VITE_FACE_MODEL_URL=https://vladmandic.github.io/face-api/model
VITE_MEDIAPIPE_VISION_WASM_URL=https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm
VITE_MEDIAPIPE_FACE_LANDMARKER_MODEL_URL=https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
VITE_MEDIAPIPE_OBJECT_DETECTOR_MODEL_URL=https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task
VITE_MEDIAPIPE_OBJECT_SCORE_THRESHOLD=0.5
VITE_PROCTORING_GAZE_AWAY_MS=10000
VITE_PROCTORING_WARN_COOLDOWN_MS=12000
```

### Fix 2 — Double `/api` in `remoteLogger.ts` line 25
```diff
- await fetch(`${API_URL}/api/internal/logs`, {
+ await fetch(`${API_URL}/internal/logs`, {
```
