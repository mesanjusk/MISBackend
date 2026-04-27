const express = require('express');
const router = express.Router();
const { sendDigestToAllUsers } = require('../services/messageScheduler');

router.post('/send-digest', async (req, res) => {
  try {
    const mode = String(req.body?.mode || req.query?.mode || 'morning').toLowerCase() === 'evening' ? 'evening' : 'morning';
    const result = await sendDigestToAllUsers(mode);
    res.json({ success: true, mode, result });
  } catch (error) {
    console.error('Manual digest failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
