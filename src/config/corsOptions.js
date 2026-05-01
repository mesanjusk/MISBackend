/**
 * CORS configuration
 * Set ALLOWED_ORIGINS in your .env as a comma-separated list of frontend URLs.
 * Example: ALLOWED_ORIGINS=https://your-app.vercel.app,https://your-custom-domain.com
 */
const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Always allow localhost in non-production for developer convenience
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

    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

module.exports = corsOptions;
