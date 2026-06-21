const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBuffer, deleteAsset } = require('../services/cloudinary.service');

const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'file is required');
  const bucket = req.params.bucket;
  if (!['profiles', 'apartments'].includes(bucket)) throw new ApiError(400, 'Invalid upload bucket');

  const folder = [bucket, req.body.folder].filter(Boolean).join('/');
  const result = await uploadBuffer(req.file, folder);
  return res.status(201).json({
    bucket,
    path: result.public_id,
    public_id: result.public_id,
    url: result.secure_url,
    secure_url: result.secure_url,
    resource_type: result.resource_type,
  });
});

const remove = asyncHandler(async (req, res) => {
  const { public_id: publicId, resource_type: resourceType } = req.body;
  if (!publicId) throw new ApiError(422, 'public_id is required');
  const result = await deleteAsset(publicId, resourceType || 'image');
  return res.json(result);
});

module.exports = {
  upload,
  remove,
};
