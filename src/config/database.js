const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');
const logger = require('./logger');

async function connectDatabase(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  if (uri.startsWith('mongodb+srv://') && env.mongoDnsServers.length > 0) {
    dns.setServers(env.mongoDnsServers);
  }
  await mongoose.connect(uri, {
    autoIndex: !env.isProduction,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 10000,
  });
  logger.info('MongoDB connected');
}

module.exports = { connectDatabase };
