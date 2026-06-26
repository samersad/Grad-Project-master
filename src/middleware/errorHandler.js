const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');

function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
}

function errorHandler(err, _req, res, _next) {
  let error = err;

  if (err.name === 'CastError') error = new ApiError(400, 'Invalid resource id');
  if (err.code === 11000) error = new ApiError(409, 'Duplicate resource', Object.keys(err.keyValue || {}).map((field) => ({ field, message: 'Already exists' })));
  if (err.name === 'ValidationError') {
    error = new ApiError(422, 'Validation failed', Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })));
  }
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      error = new ApiError(413, 'File too large. Maximum size is 20MB');
    } else {
      error = new ApiError(400, `Upload error: ${err.message}`);
    }
  }

  const statusCode = error.statusCode || 500;
  const payload = {
    success: false,
    message: error.message || 'Internal server error',
    errors: error.errors || [],
  };

  if (!env.isProduction) payload.stack = error.stack;
  if (statusCode >= 500) logger.error({ err }, 'Unhandled error');

  return res.status(statusCode).json(payload);
}

module.exports = { errorHandler, notFound };
