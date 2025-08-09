// routes/migrateOrders.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require("../Models/order");

// helpers
const norm = (s) => String(s || "").trim().toLowerCase();
const isLatestDelivered = (order) => {
  const st = Array.isArray(order?.Status) ? order.Status : [];
  if (!st.length) return false;
  const latest = st[st.length - 1];
  return norm(latest?.Task) === "delivered";
};

function buildPrintStep(designStep) {
  return {
    label: "Print",
    checked: false,
    vendorId: designStep?.vendorId ?? null,
    vendorCustomerUuid: designStep?.vendorCustomerUuid ?? null,
    vendorName: designStep?.vendorName ?? null,
    costAmount: Number(designStep?.costAmount || 0) || 0,
    plannedDate: designStep?.plannedDate ? new Date(designStep.plannedDate) : undefined,
    status: "pending",
    posting: { isPosted: false, txnId: null, postedAt: null },
  };
}

/**
 * GET /api/orders/migrate/flat
 * Find orders where:
 *  - latest Status is "Delivered"
 *  - Steps contains "Design" (any case/whitespace)
 *  - Steps does NOT contain "Print" (any case/whitespace)
 */
router.get("/flat", async (req, res) => {
  try {
    const rows = await Orders.aggregate([
      {
        $project: {
          Order_Number: 1,
          Customer_uuid: 1,
          // include if present, otherwise omit safely
          Customer_name: { $ifNull: ["$Customer_name", null] },
          Steps: { $ifNull: ["$Steps", []] },
          Status: { $ifNull: ["$Status", []] },
          _statusSize: { $size: { $ifNull: ["$Status", []] } },
        },
      },
      // derive latest status doc (last element)
      {
        $addFields: {
          latestStatus: {
            $cond: [
              { $gt: ["$_statusSize", 0] },
              { $arrayElemAt: ["$Status", { $subtract: ["$_statusSize", 1] }] },
              null,
            ],
          },
        },
      },
      // normalized label checks for Steps
      {
        $addFields: {
          hasDesign: {
            $anyElementTrue: {
              $map: {
                input: "$Steps",
                as: "s",
                in: {
                  $eq: [
                    {
                      $toLower: {
                        $trim: { input: { $ifNull: ["$$s.label", ""] } },
                      },
                    },
                    "design",
                  ],
                },
              },
            },
          },
          hasPrint: {
            $anyElementTrue: {
              $map: {
                input: "$Steps",
                as: "s",
                in: {
                  $eq: [
                    {
                      $toLower: {
                        $trim: { input: { $ifNull: ["$$s.label", ""] } },
                      },
                    },
                    "print",
                  ],
                },
              },
            },
          },
          latestTaskLower: {
            $toLower: {
              $trim: { input: { $ifNull: ["$latestStatus.Task", ""] } },
            },
          },
        },
      },
      { $match: { hasDesign: true, hasPrint: false, latestTaskLower: "delivered" } },
      {
        $project: {
          Order_Number: 1,
          Customer_uuid: 1,
          Customer_name: 1,
          Steps: 1,
          _isOld: { $literal: true },
        },
      },
      { $sort: { Order_Number: 1 } },
    ]);

    res.json(rows);
  } catch (err) {
    console.error("migrate/flat error:", err);
    res.status(500).json({ error: "Failed to load orders for migration" });
  }
});

/**
 * PUT /api/orders/migrate/single/:id
 * Append "Print" step (cloned vendor fields from "Design") if missing.
 */
router.put("/single/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  try {
    const order = await Orders.findById(id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!isLatestDelivered(order)) {
      return res.status(400).json({ error: "Latest status is not Delivered" });
    }

    const steps = Array.isArray(order.Steps) ? order.Steps : [];
    const hasPrint = steps.some((s) => norm(s?.label) === "print");
    const designStep = steps.find((s) => norm(s?.label) === "design");

    if (hasPrint) return res.json({ ok: true, message: "Already has Print step" });
    if (!designStep) return res.status(400).json({ error: "No Design step to base on" });

    steps.push(buildPrintStep(designStep));
    order.Steps = steps;
    await order.save();

    res.json({ ok: true, added: "Print", orderId: order._id });
  } catch (err) {
    console.error("migrate/single error:", err);
    res.status(500).json({ error: "Migration failed for this order" });
  }
});

/**
 * PUT /api/orders/migrate/bulk
 * Body: { ids: string[] }
 */
router.put("/bulk", async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Provide ids: string[]" });
  }

  const results = [];
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) {
      results.push({ id, ok: false, error: "Invalid id" });
      continue;
    }
    try {
      const order = await Orders.findById(id);
      if (!order) {
        results.push({ id, ok: false, error: "Order not found" });
        continue;
      }
      if (!isLatestDelivered(order)) {
        results.push({ id, ok: false, error: "Latest status not Delivered" });
        continue;
      }

      const steps = Array.isArray(order.Steps) ? order.Steps : [];
      const hasPrint = steps.some((s) => norm(s?.label) === "print");
      const designStep = steps.find((s) => norm(s?.label) === "design");

      if (hasPrint) {
        results.push({ id, ok: true, message: "Already has Print step" });
        continue;
      }
      if (!designStep) {
        results.push({ id, ok: false, error: "No Design step" });
        continue;
      }

      steps.push(buildPrintStep(designStep));
      order.Steps = steps;
      await order.save();

      results.push({ id, ok: true, added: "Print" });
    } catch (err) {
      console.error("bulk migrate item error:", id, err);
      results.push({ id, ok: false, error: "Exception" });
    }
  }

  res.json({ ok: true, count: results.length, results });
});

module.exports = router;
