const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

const app = express()

app.use(express.json())
app.use(cookieParser())

// Allowed origins come from env so the deployed frontend (e.g. Vercel) can be
// added without a code change. Comma-separated list; falls back to local dev.
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)

app.use(cors({
    origin(origin, callback) {
        // Allow same-origin/non-browser requests (curl, health checks) which send no Origin.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)

        const err = new Error("Not allowed by CORS")
        err.status = 403
        return callback(err)
    },
    credentials: true
}))

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")
const mockRouter = require("./routes/mock.routes")


/* using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)
app.use("/api/mock", mockRouter)

/* health check (useful for uptime monitors and deployment platforms) */
app.get("/health", (req, res) => res.status(200).json({ status: "ok" }))

/* 404 for unknown routes */
app.use((req, res) => {
    res.status(404).json({ message: "Route not found." })
})

/* global error handler — Express 5 forwards rejected async handlers here,
   so a failed AI call or DB error returns clean JSON instead of crashing. */
app.use((err, req, res, next) => {
    console.error("[error]", err)

    if (res.headersSent) {
        return next(err)
    }

    let status = err.status || err.statusCode || 500
    const raw = String(err.message || "")

    // AI provider quota exhaustion (free-tier daily limit).
    if (status === 429 || /quota|resource_exhausted/i.test(raw)) {
        return res.status(429).json({
            message: "The free daily AI request limit has been reached. Please try again later."
        })
    }

    // The AI provider sometimes returns "503 high demand"; surface a clean,
    // user-friendly message instead of leaking the raw provider JSON.
    if (status === 503 || /high demand|unavailable|overloaded/i.test(raw)) {
        return res.status(503).json({
            message: "The AI service is busy right now. Please try again in a moment."
        })
    }

    res.status(status).json({
        message: status >= 500
            ? "Something went wrong on our end. Please try again."
            : raw
    })
})

module.exports = app