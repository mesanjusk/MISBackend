/**
 * DesignFiles.js  —  /api/design-files
 *
 * Watches the designer's synced Google Drive "Daily" folder.
 * Subfolders are identified by leading numeric prefix (1, 2, 3 …)
 * so the exact name can change without breaking anything.
 *
 * Key endpoints:
 *   GET  /api/design-files/folders          — list all numbered subfolders found
 *   GET  /api/design-files/scan             — scan all subfolders, return files with stage
 *   GET  /api/design-files/unlinked         — files with no order linked yet
 *   POST /api/design-files/link             — link a Drive file to an MIS order
 *   GET  /api/design-files/order/:orderUuid — all Drive files linked to one order
 *   DELETE /api/design-files/link/:fileId   — remove a link
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getAuthorizedDriveClient } = require('../services/googleDriveOAuthService');
const DesignFileLink = require('../repositories/DesignFileLink');
const Orders = require('../repositories/order');
const logger = require('../utils/logger');

router.use(requireAuth);

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract leading number from a folder name.
 * "1. New Designs" → 1,  "12.Final" → 12,  "Old" → null
 */
function folderStageNumber(name = '') {
  const m = String(name).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Map stage number → human label.
 * Numbers beyond the known list fall back to "Stage N".
 */
const STAGE_LABELS = {
  1: 'New Design',
  2: 'Old Design',
  3: 'Approval',
  4: 'Ready for Print',
  5: 'Hold',
  6: 'Final',
  7: 'Printing',
};
function stageLabel(n) {
  return STAGE_LABELS[n] || `Stage ${n}`;
}

/**
 * List immediate children of a Drive folder.
 * Returns array of { id, name, mimeType, modifiedTime, size }
 */
async function listChildren(drive, folderId, mimeTypeFilter = null) {
  const q = [`'${folderId}' in parents`, `trashed = false`];
  if (mimeTypeFilter) q.push(`mimeType = '${mimeTypeFilter}'`);

  const res = await drive.files.list({
    q: q.join(' and '),
    fields: 'files(id,name,mimeType,modifiedTime,size,parents)',
    pageSize: 500,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

// ─── GET /api/design-files/config-check ─────────────────────────────────────
// Quick check: is the daily folder ID configured?
router.get('/config-check', (_req, res) => {
  const configured = !!process.env.DRIVE_DAILY_FOLDER_ID;
  return res.json({ configured, folderId: configured ? process.env.DRIVE_DAILY_FOLDER_ID : null });
});

// ─── GET /api/design-files/folders ──────────────────────────────────────────
// Return numbered subfolders found inside the Daily folder.
router.get('/folders', async (_req, res) => {
  try {
    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_DAILY_FOLDER_ID not configured in .env' });
    }

    const drive = await getAuthorizedDriveClient();
    const folders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');

    const numbered = folders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null)
      .sort((a, b) => a.stageNumber - b.stageNumber)
      .map((f) => ({
        id: f.id,
        name: f.name,
        stageNumber: f.stageNumber,
        stageLabel: stageLabel(f.stageNumber),
      }));

    return res.json({ success: true, folders: numbered });
  } catch (err) {
    logger.error({ err }, 'design-files/folders error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/scan ─────────────────────────────────────────────
// Scan all numbered subfolders, return every file with its current stage.
// Also enriches each file with its linked order (if any).
router.get('/scan', async (_req, res) => {
  try {
    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_DAILY_FOLDER_ID not configured in .env' });
    }

    const drive = await getAuthorizedDriveClient();

    // 1. Get all numbered subfolders
    const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
    const numbered = allFolders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null)
      .sort((a, b) => a.stageNumber - b.stageNumber);

    // 2. List files in each folder (in parallel, max 7 folders)
    const folderScans = await Promise.all(
      numbered.map(async (folder) => {
        const files = await listChildren(drive, folder.id);
        return files.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          size: file.size || null,
          folderId: folder.id,
          folderName: folder.name,
          stageNumber: folder.stageNumber,
          stageLabel: stageLabel(folder.stageNumber),
        }));
      })
    );

    const allFiles = folderScans.flat();

    // 3. Enrich with link data from DB
    const fileIds = allFiles.map((f) => f.fileId);
    const links = await DesignFileLink.find({ driveFileId: { $in: fileIds } }).lean();
    const linkMap = {};
    links.forEach((l) => { linkMap[l.driveFileId] = l; });

    // 4. Load linked orders (minimal fields)
    const linkedOrderUuids = [...new Set(links.map((l) => l.orderUuid))];
    const orders = linkedOrderUuids.length
      ? await Orders.find(
          { Order_uuid: { $in: linkedOrderUuids } },
          { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, stage: 1, orderNote: 1, Amount: 1 }
        ).lean()
      : [];
    const orderMap = {};
    orders.forEach((o) => { orderMap[o.Order_uuid] = o; });

    const enriched = allFiles.map((file) => {
      const link = linkMap[file.fileId];
      const order = link ? orderMap[link.orderUuid] : null;
      return {
        ...file,
        linked: !!link,
        linkId: link?._id || null,
        orderUuid: link?.orderUuid || null,
        orderNumber: order?.Order_Number || link?.orderNumber || null,
        customerName: link?.customerName || null,
        orderStage: order?.stage || null,
        printFileCount: link?.printFileCount || null,
      };
    });

    return res.json({ success: true, files: enriched, total: enriched.length });
  } catch (err) {
    logger.error({ err }, 'design-files/scan error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/unlinked ─────────────────────────────────────────
// Return only files that have no order linked yet.
router.get('/unlinked', async (_req, res) => {
  try {
    const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;
    if (!dailyFolderId) {
      return res.status(400).json({ success: false, message: 'DRIVE_DAILY_FOLDER_ID not configured in .env' });
    }

    const drive = await getAuthorizedDriveClient();

    const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
    const numbered = allFolders
      .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
      .filter((f) => f.stageNumber !== null)
      .sort((a, b) => a.stageNumber - b.stageNumber);

    const folderScans = await Promise.all(
      numbered.map(async (folder) => {
        const files = await listChildren(drive, folder.id);
        return files.map((file) => ({
          fileId: file.id,
          fileName: file.name,
          modifiedTime: file.modifiedTime,
          stageNumber: folder.stageNumber,
          stageLabel: stageLabel(folder.stageNumber),
        }));
      })
    );

    const allFiles = folderScans.flat();
    const fileIds = allFiles.map((f) => f.fileId);
    const existingLinks = await DesignFileLink.find({ driveFileId: { $in: fileIds } }, { driveFileId: 1 }).lean();
    const linkedSet = new Set(existingLinks.map((l) => l.driveFileId));

    const unlinked = allFiles.filter((f) => !linkedSet.has(f.fileId));
    return res.json({ success: true, files: unlinked, count: unlinked.length });
  } catch (err) {
    logger.error({ err }, 'design-files/unlinked error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/design-files/link ────────────────────────────────────────────
// Link a Drive file to an MIS order. Body: { driveFileId, fileName, stageNumber, stageLabel, orderUuid }
router.post('/link', async (req, res) => {
  try {
    const { driveFileId, fileName, stageNumber, stageLabel: stageLabelVal, orderUuid } = req.body;
    if (!driveFileId || !orderUuid) {
      return res.status(400).json({ success: false, message: 'driveFileId and orderUuid are required' });
    }

    const order = await Orders.findOne({ Order_uuid: orderUuid }, { Order_Number: 1, Customer_uuid: 1 }).lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Upsert — one file can only be linked to one order
    const link = await DesignFileLink.findOneAndUpdate(
      { driveFileId },
      {
        driveFileId,
        fileName,
        stageNumber: stageNumber || null,
        stageLabel: stageLabelVal || null,
        orderUuid,
        orderNumber: order.Order_Number,
        customerName: req.body.customerName || null,
        linkedBy: req.user?.id || null,
        linkedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, link });
  } catch (err) {
    logger.error({ err }, 'design-files/link error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /api/design-files/order/:orderUuid ─────────────────────────────────
// All Drive files linked to one order, with their current folder/stage re-checked.
router.get('/order/:orderUuid', async (req, res) => {
  try {
    const { orderUuid } = req.params;
    const links = await DesignFileLink.find({ orderUuid }).lean();
    if (!links.length) return res.json({ success: true, files: [] });

    // Try to refresh stage from Drive (best-effort)
    let enriched = links;
    try {
      const drive = await getAuthorizedDriveClient();
      const dailyFolderId = process.env.DRIVE_DAILY_FOLDER_ID;

      if (dailyFolderId) {
        const allFolders = await listChildren(drive, dailyFolderId, 'application/vnd.google-apps.folder');
        const numbered = allFolders
          .map((f) => ({ ...f, stageNumber: folderStageNumber(f.name) }))
          .filter((f) => f.stageNumber !== null);

        // Build fileId → folder map
        const fileToFolder = {};
        await Promise.all(
          numbered.map(async (folder) => {
            const files = await listChildren(drive, folder.id);
            files.forEach((f) => {
              fileToFolder[f.id] = { stageNumber: folder.stageNumber, stageLabel: stageLabel(folder.stageNumber), folderName: folder.name };
            });
          })
        );

        enriched = links.map((link) => {
          const current = fileToFolder[link.driveFileId];
          return {
            ...link,
            currentStageNumber: current?.stageNumber ?? null,
            currentStageLabel: current?.stageLabel ?? 'Not found in Daily folder',
            currentFolderName: current?.folderName ?? null,
            foundInDrive: !!current,
          };
        });
      }
    } catch (driveErr) {
      logger.warn({ driveErr }, 'Could not refresh stage from Drive for order files');
    }

    return res.json({ success: true, files: enriched });
  } catch (err) {
    logger.error({ err }, 'design-files/order error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── DELETE /api/design-files/link/:fileId ──────────────────────────────────
router.delete('/link/:fileId', async (req, res) => {
  try {
    await DesignFileLink.deleteOne({ driveFileId: req.params.fileId });
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'design-files/unlink error');
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
