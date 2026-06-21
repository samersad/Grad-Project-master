const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.logLevel,
  redact: ['req.headers.authorization', 'password', 'refreshToken', 'accessToken'],
  transport: env.isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});

module.exports = logger;
