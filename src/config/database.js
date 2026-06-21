const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');
const logger = require('./logger');

const legacyIndexesToDrop = {
  apartments: ['ownerId_1_address_1_buildingNumber_1_floor_1_unitNumber_1'],
};

async function dropLegacyIndexes(connection) {
  await Promise.all(Object.entries(legacyIndexesToDrop).map(async ([collectionName, indexNames]) => {
    const collection = connection.db.collection(collectionName);
    const indexes = await collection.indexes();
    const existingNames = new Set(indexes.map((index) => index.name));

    await Promise.all(indexNames
      .filter((indexName) => existingNames.has(indexName))
      .map(async (indexName) => {
        await collection.dropIndex(indexName);
        logger.info({ collection: collectionName, index: indexName }, 'Dropped legacy MongoDB index');
      }));
  }));
}

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
  await dropLegacyIndexes(mongoose.connection);
  logger.info('MongoDB connected');
}

module.exports = { connectDatabase };
