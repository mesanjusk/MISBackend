// Routers/OrderMigrate.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

/**
 * Build the aggregation pipeline stages used to normalize:
 * - Steps[*].vendorId/vendorCustomerUuid/vendorName/costAmount/status/posting/stepId
 * - Items (ensure array)
 * - saleSubtotal (from Items)
 * - stepsCostTotal (sum of Steps.costAmount)
 *
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

/**
 * POST /order/migrate/run
 * Body:
 *   - secret?: string (must match process.env.MIGRATE_SECRET if set)
 * Query:
 *   - onlyOld=1 -> migrate only docs where a step is missing posting
 */
router.post("/run", async (req, res) => {
  try {
    const { secret } = req.body || {};
    if (process.env.MIGRATE_SECRET && secret !== process.env.MIGRATE_SECRET) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const onlyOld = String(req.query.onlyOld || "").trim() === "1";

    const filter = onlyOld
      ? { Steps: { $elemMatch: { posting: { $exists: false } } } }
      : {}; // all docs

    const stages = buildStages();
    const col = mongoose.connection.collection("orders"); // change if your collection name differs

    const result = await col.updateMany(filter, stages);
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

/**
 * GET /order/migrate/preview
 * Returns counts to help you decide.
 */
router.get("/preview", async (req, res) => {
  try {
    const col = mongoose.connection.collection("orders");
    const [counts] = await col
      .aggregate([
        {
          $facet: {
            total: [{ $count: "n" }],
            oldStyle: [
              { $match: { Steps: { $elemMatch: { posting: { $exists: false } } } } },
              { $count: "n" }
            ]
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

module.exports = router;
