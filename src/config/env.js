const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });

const parseList = (value = '') => value.split(',').map((item) => item.trim()).filter(Boolean);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/sokon',
  mongoDnsServers: parseList(process.env.MONGO_DNS_SERVERS || '8.8.8.8,1.1.1.1'),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  corsOrigins: parseList(process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev_access_secret_change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    verifySecret: process.env.JWT_VERIFY_SECRET || 'dev_verify_secret_change_me',
    resetSecret: process.env.JWT_RESET_SECRET || 'dev_reset_secret_change_me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    verifyExpiresIn: process.env.JWT_VERIFY_EXPIRES_IN || '24h',
    resetExpiresIn: process.env.JWT_RESET_EXPIRES_IN || '15m',
  },
  supabase: {
    url: process.env.SUPABASE_URL || null,
    anonKey: process.env.SUPABASE_ANON_KEY || null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    jwtSecret: process.env.SUPABASE_JWT_SECRET || null,
  },
  cookieSecure: String(process.env.COOKIE_SECURE || 'false') === 'true',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'SOKON <noreply@sokon.local>',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 5),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
  },
  rateLimit: {
    windowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15),
    maxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 300),
    authMaxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 20),
  },
  cron: {
    enabled: String(process.env.ENABLE_CRON_JOBS || 'true') === 'true',
    bookingExpiryDays: Number(process.env.BOOKING_EXPIRY_DAYS || 4),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = env;
