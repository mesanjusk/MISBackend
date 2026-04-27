const mongoose = require('mongoose');
const Orders = require('../repositories/order');
const Tasks = require('../repositories/tasks');
const Customers = require('../repositories/customer');
const { sendMessage } = require('./metaApiService');

const VALID_STAGES = [
  'enquiry',
  'quoted',
  'approved',
  'design',
  'printing',
  'finishing',
  'ready',
  'delivered',
  'paid',
];

const stageIndex = new Map(VALID_STAGES.map((value, index) => [value, index]));

const resolveOrderFilter = (rawId) => {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) return { _id: id };
  if (/^\d+$/.test(id)) return { Order_Number: Number(id) };
  return { Order_uuid: id };
};

const normalizeStage = (stage) => String(stage || '').trim().toLowerCase();



const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');

const sendEnvWhatsAppText = async ({ to, body }) => {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp env credentials missing (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)');
  }
  return sendMessage({
    phoneNumberId,
    accessToken,
    payload: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'text',
      text: { preview_url: false, body },
    },
  });
};

const notifyDeliveredOrder = async (order) => {
  try {
    const customer = await Customers.findOne({ Customer_uuid: order.Customer_uuid }).lean();
    const mobile = normalizePhone(customer?.Mobile_number);
    if (!mobile) return;

    const customerName = customer?.Customer_name || order.customerName || 'Customer';
    const amount = Number(order.Amount || order.saleSubtotal || 0);
    const businessName = process.env.BUSINESS_NAME || process.env.APP_NAME || 'MIS System';
    const body = `Dear ${customerName}, your order #${order.Order_Number} is ready for delivery.\n\nAmount due: Rs ${amount}.\n\nPlease arrange payment. Thank you! - ${businessName}`;

    await sendEnvWhatsAppText({ to: mobile, body });
    console.log(`WhatsApp sent to ${mobile} for delivered order #${order.Order_Number}`);
  } catch (error) {
    console.error(`WhatsApp failed: ${error.message}`);
  }
};

const assertValidStage = (stage) => {
  if (!stageIndex.has(stage)) {
    const error = new Error(`Invalid stage. Allowed stages: ${VALID_STAGES.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }
};

const updateOrderStage = async ({ orderId, stage }) => {
  const normalizedStage = normalizeStage(stage);
  assertValidStage(normalizedStage);

  const filter = resolveOrderFilter(orderId);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const order = await Orders.findOne(filter).lean();
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  const currentStage = normalizeStage(order.stage || 'enquiry');
  assertValidStage(currentStage);

  if (stageIndex.get(normalizedStage) < stageIndex.get(currentStage)) {
    const error = new Error(`Stage rollback not allowed from ${currentStage} to ${normalizedStage}`);
    error.statusCode = 400;
    throw error;
  }

  if (currentStage === normalizedStage) {
    return await Orders.findById(order._id);
  }

  const updatePayload = {
    $set: { stage: normalizedStage },
    $push: { stageHistory: { stage: normalizedStage, timestamp: new Date() } },
  };

  if (normalizedStage === 'delivered') {
    updatePayload.$set.deliveryNotifiedAt = new Date();
  }

  await Orders.updateOne({ _id: order._id }, updatePayload);

  const updatedOrder = await Orders.findById(order._id);
  if (normalizedStage === 'delivered') {
    await notifyDeliveredOrder({ ...order, ...updatedOrder.toObject?.() });
  }

  return updatedOrder;
};

const getOrderTasks = async (orderId) => {
  const filter = resolveOrderFilter(orderId);
  if (!filter) {
    const error = new Error('Order id is required');
    error.statusCode = 400;
    throw error;
  }

  const order = await Orders.findOne(filter, { _id: 1 }).lean();
  if (!order) {
    const error = new Error('Order not found');
    error.statusCode = 404;
    throw error;
  }

  return await Tasks.find({ orderId: order._id }).sort({ deadline: 1, createdAt: -1 });
};

module.exports = {
  VALID_STAGES,
  updateOrderStage,
  getOrderTasks,
};
