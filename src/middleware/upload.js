const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeOriginal = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeOriginal}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const isImage = String(file.mimetype || '').startsWith('image/');
    if (!isImage) {
      return cb(new Error('Only image uploads are allowed'));
    }
    return cb(null, true);
  },
});

module.exports = upload;
