const Flow = require('../repositories/Flow');

const normalizeTriggerKeywords = (keywords = []) =>
  [...new Set((Array.isArray(keywords) ? keywords : []).map((keyword) => String(keyword || '').trim().toLowerCase()).filter(Boolean))];

const listFlows = async (_req, res) => {
  try {
    const flows = await Flow.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: flows });
  } catch (error) {
    console.error('[flows] list error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch flows' });
  }
};

const createFlow = async (req, res) => {
  try {
    const payload = req.body || {};
    const flow = await Flow.create({
      ...payload,
      triggerKeywords: normalizeTriggerKeywords(payload.triggerKeywords),
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : true,
    });

    return res.status(201).json({ success: true, data: flow });
  } catch (error) {
    console.error('[flows] create error:', error);
    return res.status(400).json({ success: false, error: 'Failed to create flow' });
  }
};

const updateFlow = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (payload.triggerKeywords) {
      payload.triggerKeywords = normalizeTriggerKeywords(payload.triggerKeywords);
    }

    const flow = await Flow.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean();
    if (!flow) {
      return res.status(404).json({ success: false, error: 'Flow not found' });
    }

    return res.json({ success: true, data: flow });
  } catch (error) {
    console.error('[flows] update error:', error);
    return res.status(400).json({ success: false, error: 'Failed to update flow' });
  }
};

const deleteFlow = async (req, res) => {
  try {
    const { id } = req.params;
    const flow = await Flow.findByIdAndDelete(id).lean();

    if (!flow) {
      return res.status(404).json({ success: false, error: 'Flow not found' });
    }

    return res.json({ success: true, data: flow });
  } catch (error) {
    console.error('[flows] delete error:', error);
    return res.status(400).json({ success: false, error: 'Failed to delete flow' });
  }
};

const toggleFlow = async (req, res) => {
  try {
    const { id } = req.params;
    const flow = await Flow.findById(id);
    if (!flow) {
      return res.status(404).json({ success: false, error: 'Flow not found' });
    }

    flow.isActive = !flow.isActive;
    await flow.save();

    return res.json({ success: true, data: flow.toObject() });
  } catch (error) {
    console.error('[flows] toggle error:', error);
    return res.status(400).json({ success: false, error: 'Failed to toggle flow' });
  }
};

module.exports = {
  listFlows,
  createFlow,
  updateFlow,
  deleteFlow,
  toggleFlow,
};
