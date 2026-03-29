const express = require('express');
const upload = require('../middleware/upload');
const { uploadImage } = require('../controllers/uploadController');

const router = express.Router();

router.post('/image', upload.single('file'), uploadImage);

module.exports = router;
