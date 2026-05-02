/**
 * CORS configuration
 *
 * Set ALLOWED_ORIGINS in your environment as a comma-separated list of frontend URLs.
 *
 * Render.com example:
 *   ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
 *
 * The backend always allows localhost origins in non-production for developer convenience.
 */
const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Always allow localhost in non-production
  if (process.env.NODE_ENV !== 'production') {
    list.push('http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173');
  }

  return list;
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();

    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    // In development with an empty ALLOWED_ORIGINS, allow everything for convenience
    if (process.env.NODE_ENV !== 'production' && allowed.length === 0) {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin ${origin} not allowed. Add it to ALLOWED_ORIGINS env var.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
