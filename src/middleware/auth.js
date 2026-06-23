const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const User = require('../models/user.model');

const appRoles = new Set(['owner', 'client', 'admin']);

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.accessToken || null;
}

function normalizeClaimString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function extractExternalUserProfile(decoded) {
  const email = normalizeClaimString(decoded.email);
  const fullName =
    normalizeClaimString(decoded?.user_metadata?.full_name) ||
    normalizeClaimString(decoded?.user_metadata?.name) ||
    normalizeClaimString(decoded?.name) ||
    email?.split('@')[0] ||
    'External User';

  const rawRole =
    normalizeClaimString(decoded?.user_metadata?.role) ||
    normalizeClaimString(decoded?.app_metadata?.role) ||
    normalizeClaimString(decoded?.role) ||
    'client';
  const role = appRoles.has(rawRole) ? rawRole : 'client';

  return {
    id: String(decoded.sub || decoded.user_id || decoded.id || '').trim(),
    email,
    name: fullName,
    role,
    photoUrl:
      normalizeClaimString(decoded?.user_metadata?.avatar_url) ||
      normalizeClaimString(decoded?.user_metadata?.picture) ||
      normalizeClaimString(decoded?.picture) ||
      null,
    phoneNumber: normalizeClaimString(decoded.phone) || null,
  };
}

async function resolveExternalUser(decoded) {
  const profile = extractExternalUserProfile(decoded);
  if (!profile.id) throw new ApiError(401, 'Invalid or expired authentication token');

  const emailFilter = profile.email ? { email: profile.email.toLowerCase() } : null;
  const existingUser = emailFilter
    ? await User.findOne(emailFilter)
    : await User.findOne({ id: profile.id });

  if (existingUser) {
    if (!existingUser.id) existingUser.id = profile.id;
    if (profile.name) existingUser.name = profile.name;
    if (profile.photoUrl) existingUser.photoUrl = profile.photoUrl;
    if (profile.phoneNumber) existingUser.phoneNumber = profile.phoneNumber;
    if (profile.role && !existingUser.role) existingUser.role = profile.role;
    if (!existingUser.passwordHash) existingUser.passwordHash = 'external-auth-placeholder';
    await existingUser.save();
    return existingUser;
  }

  return User.create({
    id: profile.id,
    name: profile.name,
    email: profile.email || `${profile.id}@external.local`,
    role: profile.role,
    photoUrl: profile.photoUrl,
    phoneNumber: profile.phoneNumber,
    passwordHash: 'external-auth-placeholder',
  });
}

function verifyBackendToken(token) {
  const decoded = jwt.verify(token, env.jwt.accessSecret);
  return User.findOne({ id: decoded.sub });
}

async function verifySupabaseToken(token) {
  if (env.supabase.url && (env.supabase.anonKey || env.supabase.serviceRoleKey)) {
    const user = await verifySupabaseTokenWithAuthApi(token);
    if (user) return user;
  }

  if (env.supabase.jwtSecret) {
    const decoded = jwt.verify(token, env.supabase.jwtSecret);
    return resolveExternalUser(decoded);
  }

  return null;
}

async function verifySupabaseTokenWithAuthApi(token) {
  const apiKey = env.supabase.serviceRoleKey || env.supabase.anonKey;
  const response = await fetch(`${env.supabase.url}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return resolveExternalUser({
    sub: user.id,
    email: user.email,
    phone: user.phone,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata,
    role: user.role,
  });
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = getToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required');

  let decoded;
  try {
    const user = await verifyBackendToken(token);
    if (!user) throw new ApiError(401, 'User no longer exists');
    req.user = user;
    req.token = token;
    return next();
  } catch (_error) {
    try {
      const externalUser = await verifySupabaseToken(token);
      if (!externalUser) throw new ApiError(401, 'Invalid or expired authentication token');
      req.user = externalUser;
      req.token = token;
      return next();
    } catch (_externalError) {
      throw new ApiError(401, 'Invalid or expired authentication token');
    }
  }
});

const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = getToken(req);
  if (!token) return next();

  try {
    const backendUser = await verifyBackendToken(token);
    if (backendUser) {
      req.user = backendUser;
      return next();
    }
  } catch (_error) {
    // fall through to external auth
  }

  try {
    req.user = await verifySupabaseToken(token);
  } catch (_error) {
    req.user = null;
  }

  return next();
});

const authorizeRoles = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission to access this resource'));
  return next();
};

module.exports = { authenticate, optionalAuthenticate, authorizeRoles };
