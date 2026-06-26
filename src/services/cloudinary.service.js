const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function hasSignedCredentials() {
  const config = cloudinary.config();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
}

function hasUnsignedCredentials() {
  const config = cloudinary.config();
  return Boolean(config.cloud_name && env.cloudinary.uploadPreset);
}

function uploadBuffer(file, folder) {
  const config = cloudinary.config();
  if (!hasSignedCredentials() && !hasUnsignedCredentials()) {
    console.error('Cloudinary Configuration Error:', {
      cloudName: config.cloud_name,
      apiKey: !!config.api_key,
      apiSecret: !!config.api_secret,
      uploadPreset: !!env.cloudinary.uploadPreset,
    });
    throw new ApiError(500, `Cloudinary configuration missing. Please check CLOUDINARY_CLOUD_NAME and either CLOUDINARY_API_KEY/SECRET or CLOUDINARY_UPLOAD_PRESET`);
  }

  return new Promise((resolve, reject) => {
    const resourceType = file.mimetype?.startsWith('video/') ? 'video' : 'image';
    const options = {
      folder,
      resource_type: resourceType,
    };
    const done = (error, result) => {
      if (error) {
        console.error('Cloudinary Upload Rejection:', error);
        return reject(error);
      }
      return resolve(result);
    };

    const stream = hasSignedCredentials()
      ? cloudinary.uploader.upload_stream(options, done)
      : cloudinary.uploader.unsigned_upload_stream(env.cloudinary.uploadPreset, options, done);

    if (!file.buffer) {
      return reject(new ApiError(400, 'File buffer is missing'));
    }

    Readable.from(file.buffer).pipe(stream);
  });
}

async function deleteAsset(publicId, resourceType = 'image') {
  if (!hasSignedCredentials()) {
    throw new ApiError(500, 'Cloudinary API key and secret are required to delete assets');
  }
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

module.exports = {
  uploadBuffer,
  deleteAsset,
};
