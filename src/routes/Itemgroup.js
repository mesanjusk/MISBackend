const express = require("express");
const router = express.Router();
const Itemgroup = require("../repositories/itemgroup");
const { v4: uuid } = require("uuid");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

router.post(
  "/addItemgroup",
  asyncHandler(async (req, res) => {
    const { Item_group } = req.body;

    const existingGroup = await Itemgroup.findOne({ Item_group });
    if (existingGroup) {
      return res.json("exist");
    }

    const newGroup = new Itemgroup({
      Item_group,
      Item_group_uuid: uuid(),
    });

    await newGroup.save();
    res.json("notexist");
  })
);

router.get(
  "/GetItemgroupList",
  asyncHandler(async (_req, res) => {
    const data = await Itemgroup.find({});

    if (!data.length) {
      throw new AppError("Item Group Not found", 200);
    }

    res.json({ success: true, result: data.filter((a) => a.Item_group) });
  })
);

module.exports = router;
