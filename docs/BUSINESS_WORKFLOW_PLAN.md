# BUSINESS WORKFLOW PLAN

## 1) Existing files found

### Order
- `src/routes/Order.js`
- `src/repositories/order.js`
- `src/controllers/orderController.js`
- `src/controllers/orderLifecycleController.js`
- `src/services/orderLifecycleService.js`
- `src/services/orderTaskService.js`

### Task
- `src/routes/Task.js`
- `src/repositories/tasks.js`
- `src/services/taskService.js`

### Vendor
- `src/routes/Vendor.js`
- `src/repositories/vendor.js` (legacy)
- `src/repositories/vendorMaster.js`
- `src/repositories/vendorWork.js`

### ProductionJob
- `src/repositories/productionJob.js`
- Related APIs currently live in `src/routes/Vendor.js` (`/production-jobs`)

### VendorLedger
- `src/repositories/vendorLedger.js`
- Related APIs currently live in `src/routes/Vendor.js` (`/ledger`, `/reports/summary`)

### Transaction
- `src/routes/Transaction.js`
- `src/repositories/transaction.js`

### Account
- `src/repositories/accounts.js`
- (No dedicated `Account` route file found in current route set)

### StockMovement
- `src/repositories/stockMovement.js`
- Related APIs currently live in `src/routes/Vendor.js` (`/stock-movements`)

### Dashboard
- `src/routes/Dashboard.js`
- `src/controllers/dashboardSummaryController.js`

### WhatsApp
- `src/routes/WhatsAppCloud.js`
- `src/controllers/whatsappController.js`
- Supporting services:
  - `src/services/whatsappService.js`
  - `src/services/whatsappMessageService.js`
  - `src/services/whatsappMediaService.js`
  - `src/services/whatsappHealthService.js`
  - `src/services/whatsappAttendanceService.js`

### Auth middleware
- `src/middleware/auth.js`

### API mount / compatibility context
- `src/index.js` (mounts `/api/orders`, `/api/tasks`, `/api/vendors`, `/api/transaction`, `/api/dashboard`, `/api/whatsapp`, plus legacy aliases)

---

## 2) Existing APIs that must not break

### Order APIs (`/api/orders` + legacy `/order`)
- Existing order CRUD and lifecycle/status update endpoints in `src/routes/Order.js`.
- Existing stage/task APIs wired through `orderLifecycleController` in the same router.

### Task APIs (`/api/tasks` + legacy `/tasks`)
- `POST /addTask`
- `POST /`
- `GET /GetTaskList`
- `GET /:id`
- `PUT /update/:id`
- `DELETE /Delete/:taskId`

### Vendor APIs (`/api/vendors` + legacy `/vendors`)
- Legacy vendor endpoints (`/addVendor`, `/GetVendorList`, `/:id`)
- Vendor master endpoints (`/masters`, `/masters/:vendorUuid`)
- Vendor ledger endpoints (`/ledger`, `/ledger/:vendorUuid`)
- Production job endpoints (`/production-jobs`)
- Stock movement endpoint (`/stock-movements`)
- Reporting endpoint (`/reports/summary`)
- Attendance settings endpoints under vendor route (`/settings/whatsapp-attendance`)

### Transaction APIs (`/api/transaction` + legacy `/transaction`)
- `POST /addTransaction`
- `GET /`
- `GET /:uuid`
- Existing update/delete/search style endpoints in `src/routes/Transaction.js`

### Dashboard APIs (`/api/dashboard` + legacy `/dashboard`)
- `GET /summary`
- `GET /:period`

### WhatsApp APIs (`/api/whatsapp`)
- Account/status routes
- Send message routes (`/send-text`, `/send-template`, `/send-flow`, `/send-media`, `/send-message`)
- Auto-reply routes
- Templates/messages/analytics routes
- Webhook routes (`GET/POST /webhook`)

### Auth middleware dependency
- Any route currently protected by `requireAuth` from `src/middleware/auth.js` must continue to function with current token behavior.

---

## 3) New files planned to add

> Planning note for next implementation phase (not created in this step):
- `docs/BUSINESS_WORKFLOW_API_MAPPING.md` (detailed endpoint-to-workflow mapping)
- `docs/BUSINESS_WORKFLOW_TEST_CHECKLIST.md` (non-regression checklist for Order → Task → Vendor/Purchase → Ready → Delivery → Payment → Accounting)

---

## 4) Existing files planned to minimally edit

> Planned minimal-touch candidates for next phase (no edits in this step):
- `src/routes/Order.js` (workflow transition hooks / guarded status progression)
- `src/services/orderLifecycleService.js` (centralized stage transition rules)
- `src/services/orderTaskService.js` (task-generation/assignment linkage)
- `src/routes/Vendor.js` (vendor/purchase linkage validations)
- `src/routes/Transaction.js` (payment-to-accounting linkage hardening)
- `src/controllers/dashboardSummaryController.js` (workflow KPI visibility only, if needed)

---

## 5) Risks

- **Route compatibility risk:** Existing frontend may rely on exact response shapes/status codes from mixed legacy + `/api/*` routes.
- **Data model duality risk:** Vendor flow currently spans legacy (`vendor.js`) and newer (`vendorMaster`, `vendorLedger`, `productionJob`) collections.
- **Status semantics risk:** Order progression currently uses both `Status[]` task entries and `stage` enums; careless edits could desync them.
- **Accounting linkage risk:** Transaction writes can auto-update order billing fields; additional accounting logic must remain idempotent.
- **Auth boundary risk:** WhatsApp and analytics endpoints have selective auth; tightening/loosening protection may break existing usage.
- **Operational risk on live DB:** Counter-based IDs and ledger/stock auto-posting logic can create duplicate postings if not guarded.

