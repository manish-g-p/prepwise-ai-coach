const isProduction = process.env.NODE_ENV === "production"

/**
 * Auth cookie options.
 *
 * In production the frontend (e.g. Vercel) and API (e.g. Render) live on
 * different domains, so the cookie must be SameSite=None + Secure or the
 * browser will refuse to send it. Locally we use Lax over plain HTTP.
 *
 * httpOnly keeps the token out of reach of JavaScript (XSS protection) — the
 * frontend never reads it directly, it just relies on the browser sending it.
 */
const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000 // 1 day, matching the JWT expiry
}

// clearCookie must receive the same flags (minus maxAge) or the browser
// will not match and remove the cookie.
const clearCookieOptions = {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite
}

module.exports = { cookieOptions, clearCookieOptions, isProduction }
