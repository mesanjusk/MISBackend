const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const Flow = require('../repositories/Flow');
const FlowSession = require('../repositories/FlowSession');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const sanitizeNodeIds = (nodes = []) =>
  nodes.map((node, index) => ({
    ...node,
    id: String(node?.id || `node_${index + 1}`).trim(),
  }));

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const flows = await Flow.find({}).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: flows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, nodes = [], edges = [], isActive = true, triggerKeywords = [] } = req.body || {};

    if (!name) {
      throw new AppError('name is required', 400);
    }

    const flow = await Flow.create({
      name: String(name).trim(),
      triggerKeywords: Array.isArray(triggerKeywords)
        ? triggerKeywords.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [],
      nodes: sanitizeNodeIds(Array.isArray(nodes) ? nodes : []),
      edges: Array.isArray(edges) ? edges : [],
      isActive: Boolean(isActive),
    });

    res.status(201).json({ success: true, data: flow });
  })
);

router.get(
  '/sessions/active',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = String(req.query.user || '').trim();
    const query = { isCompleted: false };

    if (user) query.user = user;

    const sessions = await FlowSession.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: sessions });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const flow = await Flow.findById(req.params.id).lean();
    if (!flow) {
      throw new AppError('flow not found', 404);
    }

    res.json({ success: true, data: flow });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, nodes, edges, isActive, triggerKeywords } = req.body || {};

    const updates = {};
    if (typeof name !== 'undefined') updates.name = String(name || '').trim();
    if (typeof nodes !== 'undefined') updates.nodes = sanitizeNodeIds(Array.isArray(nodes) ? nodes : []);
    if (typeof edges !== 'undefined') updates.edges = Array.isArray(edges) ? edges : [];
    if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
    if (typeof triggerKeywords !== 'undefined') {
      updates.triggerKeywords = Array.isArray(triggerKeywords)
        ? triggerKeywords.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
        : [];
    }

    const flow = await Flow.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).lean();

    if (!flow) {
      throw new AppError('flow not found', 404);
    }

    res.json({ success: true, data: flow });
  })
);

router.patch(
  '/:id/active',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { isActive } = req.body || {};

    if (typeof isActive === 'undefined') {
      throw new AppError('isActive is required', 400);
    }

    const flow = await Flow.findByIdAndUpdate(
      req.params.id,
      { isActive: Boolean(isActive) },
      {
        new: true,
        runValidators: true,
      }
    ).lean();

    if (!flow) {
      throw new AppError('flow not found', 404);
    }

    res.json({ success: true, data: flow });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const flow = await Flow.findByIdAndDelete(req.params.id).lean();
    if (!flow) {
      throw new AppError('flow not found', 404);
    }

    await FlowSession.updateMany(
      { flowId: flow._id, isCompleted: false },
      { $set: { isCompleted: true, completedAt: new Date(), awaiting: { nodeId: null, inputType: null } } }
    );

    res.json({ success: true, message: 'flow deleted' });
  })
);

module.exports = router;
