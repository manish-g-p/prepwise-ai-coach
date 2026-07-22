/**
 * Base URL of the backend API.
 *
 * Set VITE_API_URL at build time (e.g. in Vercel's environment variables) to
 * point the deployed frontend at the deployed backend. Falls back to the local
 * dev server so `npm run dev` keeps working with no configuration.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000"
