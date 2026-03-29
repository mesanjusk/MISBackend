const fs = require('fs/promises');
const cloudinary = require('../config/cloudinary');

exports.uploadImage = async (req, res) => {
  let localPath = '';

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    localPath = req.file.path;
    console.log('Uploading file:', req.file);

    const result = await cloudinary.uploader.upload(localPath, {
      folder: 'whatsapp_uploads',
      resource_type: 'image',
    });

    console.log('Cloudinary response:', result);

    return res.status(200).json({
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    return res.status(500).json({ message: 'Upload failed', error: error?.message || 'Unknown error' });
  } finally {
    if (localPath) {
      await fs.unlink(localPath).catch(() => null);
    }
  }
};
