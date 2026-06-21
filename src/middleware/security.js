const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const env = require('../config/env');

function corsOptions() {
  return {
    origin(origin, callback) {
      // Allow all origins in development
      if (!env.isProduction) return callback(null, true);
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept-Language'],
  };
}

const globalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMinutes * 60 * 1000,
  max: env.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMinutes * 60 * 1000,
  max: env.rateLimit.authMaxRequests,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

function applyPreBodySecurity(app) {
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(compression());
  app.use(cookieParser());
  app.use(globalLimiter);
}

function applyPostBodySecurity(app) {
  app.use(mongoSanitize());
  app.use(xssClean());
  app.use(hpp({ whitelist: ['price', 'beds', 'rooms', 'floor', 'rating'] }));
}

module.exports = { applyPreBodySecurity, applyPostBodySecurity, authLimiter };
