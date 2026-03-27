const express = require('express');
const Contact = require('../repositories/contact');

const router = express.Router();

const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', async (req, res) => {
  try {
    const {
      q = '',
      tags = '',
      assignedAgent = '',
      lastSeenFrom = '',
      lastSeenTo = '',
      page = '1',
      limit = '25',
      sort = 'lastSeen_desc',
    } = req.query;

    const query = {};
    const trimmedSearch = String(q || '').trim();
    const tagList = String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (trimmedSearch) {
      const searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
      query.$or = [{ phone: searchRegex }, { name: searchRegex }, { tags: searchRegex }];
    }

    if (tagList.length > 0) {
      query.tags = { $all: tagList };
    }

    if (assignedAgent) {
      query.assignedAgent = String(assignedAgent).trim();
    }

    if (lastSeenFrom || lastSeenTo) {
      query.lastSeen = {};
      if (lastSeenFrom) query.lastSeen.$gte = new Date(lastSeenFrom);
      if (lastSeenTo) query.lastSeen.$lte = new Date(lastSeenTo);
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 25));
    const skip = (safePage - 1) * safeLimit;
    const sortMap = {
      lastSeen_desc: { lastSeen: -1, updatedAt: -1 },
      lastSeen_asc: { lastSeen: 1, updatedAt: 1 },
      name_asc: { name: 1, phone: 1 },
      name_desc: { name: -1, phone: -1 },
    };

    const [data, total] = await Promise.all([
      Contact.find(query).sort(sortMap[sort] || sortMap.lastSeen_desc).skip(skip).limit(safeLimit).lean(),
      Contact.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (err) {
    console.error('[contacts] list error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

router.get('/:phone', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/\D/g, '');
    const contact = await Contact.findOne({ phone }).lean();
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    return res.json({ success: true, data: contact });
  } catch (err) {
    console.error('[contacts] fetch error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch contact' });
  }
});

router.patch('/:phone', async (req, res) => {
  try {
    const phone = String(req.params.phone || '').replace(/\D/g, '');
    const { name, tags, customFields, assignedAgent } = req.body || {};

    const update = {};
    if (typeof name === 'string') update.name = name.trim();
    if (Array.isArray(tags)) {
      update.tags = [...new Set(tags.map((tag) => String(tag || '').trim()).filter(Boolean))];
    }
    if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
      update.customFields = customFields;
    }
    if (typeof assignedAgent === 'string') update.assignedAgent = assignedAgent.trim();

    const contact = await Contact.findOneAndUpdate({ phone }, { $set: update }, { new: true }).lean();
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    return res.json({ success: true, data: contact });
  } catch (err) {
    console.error('[contacts] update error', err);
    return res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

module.exports = router;
