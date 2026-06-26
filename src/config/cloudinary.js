const cloudinary = require('cloudinary').v2;
const env = require('./env');

if (env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret) {
  console.log('Configuring Cloudinary with API Key:', env.cloudinary.apiKey);
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
} else if (env.cloudinary.cloudName) {
  console.log('Configuring Cloudinary for Unsigned Uploads');
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
  });
} else {
  console.warn('Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, etc.)');
}

module.exports = cloudinary;
