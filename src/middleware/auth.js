const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const User = require('../models/user.model');

function getToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.accessToken || null;
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = getToken(req);
  if (!token) throw new ApiError(401, 'Authentication token is required');

  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.accessSecret);
  } catch (_error) {
    throw new ApiError(401, 'Invalid or expired authentication token');
  }

  const user = await User.findOne({ id: decoded.sub });
  if (!user) throw new ApiError(401, 'User no longer exists');

  req.user = user;
  req.token = token;
  return next();
});

const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = getToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret);
    req.user = await User.findOne({ id: decoded.sub });
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
