const express = require('express');
const upload = require('../middleware/upload');
const { uploadImage } = require('../controllers/uploadController');

const router = express.Router();

router.post('/image', (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Max allowed size is 10MB' });
    }

    return res.status(400).json({ message: error.message || 'Invalid file upload request' });
  });
}, uploadImage);

module.exports = router;
