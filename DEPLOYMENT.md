# Deployment Guide

Everything here runs on **free tiers**. No card required for the core stack.

| Piece | Service | Free tier |
|---|---|---|
| Database | MongoDB Atlas M0 | 512 MB, always free |
| AI | Google AI Studio (Gemini) | free daily quota |
| Backend API | Render (Docker) | free web service, sleeps when idle |
| Frontend | Vercel | free static hosting |

---

## 1. Keep Docker off your C: drive

Docker Desktop stores its disk image on C: by default:

```
C:\Users\<you>\AppData\Local\Docker\wsl\disk\docker_data.vhdx
```

To move it to D:

1. Open **Docker Desktop → Settings (gear) → Resources → Advanced**.
2. Find **Disk image location**.
3. Change it to `D:\DockerData`.
4. Click **Apply & Restart**. Docker migrates the existing image for you (takes a few minutes).

After this, every image, container and build cache lives on D:.

### Stop Docker from hogging RAM

WSL2 (which Docker runs on) will otherwise take ~50% of your RAM. Your
`C:\Users\<you>\.wslconfig` already caps it:

```ini
[wsl2]
memory=6GB
processors=4
swap=2GB

[experimental]
autoMemoryReclaim=gradual
```

If you ever change it, apply with `wsl --shutdown` then restart Docker Desktop.

### Day-to-day tip

Don't run the containers while coding — use `npm run dev` in both folders
instead. Use Docker when you want to test the real production image or before
deploying. That keeps your laptop responsive.

---

## 2. Run the whole stack locally in Docker

From the folder containing `Backend/` and `Frontend/`:

```bash
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend: http://localhost:3000

Stop with `docker compose down`.

Note there is **no MongoDB container** — the app uses Atlas, which keeps ~300MB
of RAM off your machine.

---

## 3. Deploy the backend to Render

1. Push the project to GitHub.
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Settings:
   - **Root Directory**: `Backend`
   - **Runtime**: `Docker`
   - **Instance Type**: Free
4. Add **Environment Variables**:

   | Key | Value |
   |---|---|
   | `MONGO_URI` | your Atlas connection string |
   | `GOOGLE_GENAI_API_KEY` | your Gemini key |
   | `JWT_SECRET` | a long random string |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | your Vercel URL (add after step 4) |

   `PORT` is injected by Render automatically — don't set it.

5. Deploy, then confirm `https://<your-app>.onrender.com/health` returns
   `{"status":"ok"}`.

**Atlas network access:** add `0.0.0.0/0` under Atlas → Network Access, or
Render cannot reach your database.

**Free tier caveat:** the service sleeps after ~15 minutes idle, so the first
request afterwards takes ~30–60s to wake. Fine for a portfolio project.

---

## 4. Deploy the frontend to Vercel

1. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. Settings:
   - **Root Directory**: `Frontend`
   - **Framework Preset**: Vite
3. Add an **Environment Variable**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-app>.onrender.com` |

   This is read at *build* time, so redeploy after changing it.

4. Deploy, then copy the resulting URL.

---

## 5. Close the loop

Go back to Render and set `FRONTEND_URL` to your Vercel URL (e.g.
`https://interview-ai.vercel.app`), then redeploy the backend.

This matters for two reasons:

- **CORS** — the API only accepts browser requests from origins in `FRONTEND_URL`.
- **Cookies** — with `NODE_ENV=production` the auth cookie is issued as
  `SameSite=None; Secure`, which is required because the frontend and API are on
  different domains. Both must be HTTPS (Render and Vercel both are).

To allow several origins, use a comma-separated list:

```
FRONTEND_URL=https://interview-ai.vercel.app,http://localhost:5173
```

---

## Troubleshooting

**Logged in but immediately logged out** — `NODE_ENV` is not `production` on
Render, so the cookie is not `Secure`/`SameSite=None` and the browser drops it.

**CORS error in the console** — `FRONTEND_URL` on Render does not exactly match
your Vercel origin. It must include `https://` and no trailing slash.

**"free daily AI request limit reached"** — the Gemini free tier quota is spent
for the day. Set `GEMINI_MODEL` to another free model, or wait for the reset.

**PDF download fails on Render** — Chromium is memory hungry and the free tier
has 512MB. It usually works, but if it OOMs, upgrade the instance or move PDF
generation to the client.
