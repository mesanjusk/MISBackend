// POST /orders/:orderId/steps/:stepId/assign-vendor
// body: { vendorId, vendorName, costAmount, createdBy }
router.post('/orders/:orderId/steps/:stepId/assign-vendor', async (req, res) => {
  const { orderId, stepId } = req.params;
  const { vendorId, vendorName, costAmount, createdBy } = req.body;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Orders.findById(orderId).session(session);
      if (!order) throw new Error('Order not found');

      const step = order.Steps.id(stepId);
      if (!step) throw new Error('Step not found');

      // Update vendor info
      step.vendorId = vendorId || step.vendorId || null;
      step.vendorName = vendorName || step.vendorName || null;
      step.costAmount = Number(costAmount ?? step.costAmount ?? 0);

      // If already posted, just save vendor info and return
      if (step.posting?.isPosted) {
        await order.save({ session });
        return res.json({ ok: true, message: 'Vendor saved. Step already posted.', txnId: step.posting.txnId });
      }

      // Build and save a balanced Transaction (use your Transaction model)
      const txn = await Transaction.create([{
        Transaction_date: new Date(),
        Description: `Outsource step: ${step.label} (Order #${order.Order_Number})`,
        Payment_mode: null,
        Created_by: createdBy || 'system',

        // If you added source/counterparty fields in your Transaction model, fill them:
        source: { type: 'order_step', id: step._id, label: step.label },
        counterparty: { type: 'vendor', id: vendorId || null, name: vendorName || null },

        Journal_entry: [
          { Account_id: 'COGS:Outsourcing',        Type: 'Debit',  Amount: step.costAmount },
          { Account_id: `Vendor:${vendorId || vendorName}`, Type: 'Credit', Amount: step.costAmount }
        ],

        // link for reference
        Order_uuid: order.Order_uuid || null,
        Order_number: order.Order_Number,

        // totals will be auto-computed if you added a pre('validate') guard
        Total_Debit: 0,
        Total_Credit: 0
      }], { session });

      // Link back to the step
      step.posting = { isPosted: true, txnId: txn[0]._id, postedAt: new Date() };
      step.status = 'posted';

      await order.save({ session });
      res.json({ ok: true, txnId: txn[0]._id });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    session.endSession();
  }
});
