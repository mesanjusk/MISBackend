// Routers/OrderMigrate.js
const express = require("express");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const router = express.Router();

// ---- Config ----
const COLLECTION = "orders"; // change if your collection name differs

// Any doc with at least one step missing 'posting' is treated as "old format"
const OLD_FILTER = { Steps: { $elemMatch: { posting: { $exists: false } } } };

/**
 * Build the aggregation pipeline stages used to normalize:
 * - Steps[*].vendorId/vendorCustomerUuid/vendorName/costAmount/status/posting/stepId
 * - Items (ensure array)
 * - saleSubtotal (from Items)
 * - stepsCostTotal (sum of Steps.costAmount)
 * Idempotent: existing values are preserved.
 */
function buildStages() {
  return [
    {
      $set: {
        Steps: {
          $map: {
            input: { $ifNull: ["$Steps", []] },
            as: "s",
            in: {
              $mergeObjects: [
                "$$s",
                {
                  vendorId: { $ifNull: ["$$s.vendorId", null] },
                  vendorCustomerUuid: { $ifNull: ["$$s.vendorCustomerUuid", null] },
                  vendorName: { $ifNull: ["$$s.vendorName", null] },
                  costAmount: { $ifNull: ["$$s.costAmount", 0] },
                  status: { $ifNull: ["$$s.status", "pending"] },
                  posting: {
                    $ifNull: [
                      "$$s.posting",
                      { isPosted: false, txnId: null, postedAt: null }
                    ]
                  },
                  stepId: {
                    $ifNull: ["$$s.stepId", { $toString: { $ifNull: ["$$s._id", ""] } }]
                  }
                }
              ]
            }
          }
        },
        Items: { $ifNull: ["$Items", []] },
        saleSubtotal: {
          $ifNull: [
            "$saleSubtotal",
            {
              $sum: {
                $map: {
                  input: { $ifNull: ["$Items", []] },
                  as: "it",
                  in: {
                    $ifNull: [
                      "$$it.Amount",
                      {
                        $multiply: [
                          { $ifNull: ["$$it.Quantity", 0] },
                          { $ifNull: ["$$it.Rate", 0] }
                        ]
                      }
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    },
    {
      $set: {
        stepsCostTotal: {
          $sum: {
            $map: {
              input: { $ifNull: ["$Steps", []] },
              as: "sp",
              in: { $ifNull: ["$$sp.costAmount", 0] }
            }
          }
        }
      }
    }
  ];
}

/* ----------------------------- Health ----------------------------- */
router.get("/health", (_req, res) =>
  res.json({ ok: true, router: "OrderMigrate" })
);

/* ----------------------------- Preview ---------------------------- */
/**
 * GET /preview
 * Returns counts to help decide migration scope.
 */
router.get("/preview", async (_req, res) => {
  try {
    const col = mongoose.connection.collection(COLLECTION);
    const [counts] = await col
      .aggregate([
        {
          $facet: {
            total: [{ $count: "n" }],
            oldStyle: [{ $match: OLD_FILTER }, { $count: "n" }]
          }
        },
        {
          $project: {
            total: { $ifNull: [{ $arrayElemAt: ["$total.n", 0] }, 0] },
            oldStyle: { $ifNull: [{ $arrayElemAt: ["$oldStyle.n", 0] }, 0] }
          }
        }
      ])
      .toArray();

    return res.json({ ok: true, ...counts });
  } catch (err) {
    console.error("Preview error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Preview failed" });
  }
});

/* ------------------------------- Run ------------------------------ */
/**
 * POST /run?onlyOld=1
 * Body: { secret?: string }  // must match process.env.MIGRATE_SECRET if set
 */
router.post("/run", async (req, res) => {
  try {
    const { secret } = req.body || {};
    if (process.env.MIGRATE_SECRET && secret !== process.env.MIGRATE_SECRET) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const onlyOld = String(req.query.onlyOld || "").trim() === "1";
    const filter = onlyOld ? OLD_FILTER : {};

    const col = mongoose.connection.collection(COLLECTION);
    const result = await col.updateMany(filter, buildStages());

    return res.json({
      ok: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      onlyOld
    });
  } catch (err) {
    console.error("Migration error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Migration failed" });
  }
});

/* ------------------------- Frontend Helpers ----------------------- */
/**
 * GET /flat?limit=200&skip=0
 * Returns *old-format* orders with computed totals so the table can show data pre-migration.
 */
router.get("/flat", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "200", 10), 1000);
    const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);

    const col = mongoose.connection.collection(COLLECTION);

    const docs = await col
      .aggregate([
        { $match: OLD_FILTER },
        {
          $addFields: {
            _isOld: true,
            _saleSubtotal: {
              $cond: [
                { $ne: ["$saleSubtotal", null] },
                "$saleSubtotal",
                {
                  $sum: {
                    $map: {
                      input: { $ifNull: ["$Items", []] },
                      as: "it",
                      in: {
                        $ifNull: [
                          "$$it.Amount",
                          {
                            $multiply: [
                              { $ifNull: ["$$it.Quantity", 0] },
                              { $ifNull: ["$$it.Rate", 0] }
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              ]
            },
            _stepsCostTotal: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$Steps", []] },
                  as: "sp",
                  in: { $ifNull: ["$$sp.costAmount", 0] }
                }
              }
            }
          }
        },
        {
          $project: {
            Order_Number: 1,
            Customer_uuid: 1,
            Customer_name: 1, // if you store it; UI can fall back to uuid
            Steps: 1,
            saleSubtotal: "$_saleSubtotal",
            stepsCostTotal: "$_stepsCostTotal",
            _isOld: 1
          }
        },
        { $sort: { Order_Number: 1, _id: 1 } },
        { $skip: skip },
        { $limit: limit }
      ])
      .toArray();

    res.json(docs);
  } catch (err) {
    console.error("flat error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch candidates" });
  }
});

/**
 * PUT /single/:id
 * Migrate a single order by _id.
 */
router.put("/single/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }
    const col = mongoose.connection.collection(COLLECTION);
    const result = await col.updateOne({ _id: new ObjectId(id) }, buildStages());
    return res.json({
      ok: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error("single migrate error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Single migration failed" });
  }
});

/**
 * PUT /bulk
 * Body: { ids: string[] }
 * Migrate many orders by ids.
 */
router.put("/bulk", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, error: "ids[] required" });
    }

    const valid = [];
    const invalid = [];
    for (const s of ids) {
      if (ObjectId.isValid(s)) valid.push(new ObjectId(s));
      else invalid.push(s);
    }
    if (valid.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid ObjectIds in ids[]" });
    }

    const col = mongoose.connection.collection(COLLECTION);
    const result = await col.updateMany({ _id: { $in: valid } }, buildStages());

    return res.json({
      ok: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      invalidIds: invalid
    });
  } catch (err) {
    console.error("bulk migrate error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Bulk migration failed" });
  }
});

module.exports = router;
