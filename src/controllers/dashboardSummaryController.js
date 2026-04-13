const Orders = require('../repositories/order');
const Transaction = require('../repositories/transaction');
const Attendance = require('../repositories/attendance');
const Users = require('../repositories/users');
const Usertasks = require('../repositories/usertask');
const { getPendingOrdersForUser } = require('../services/orderTaskService');

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const toLower = (value = '') => String(value || '').trim().toLowerCase();

const normalizeDateValue = (value) => {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const normalizeTaskStatus = (task) =>
  toLower(task?.TaskStatus || task?.Status || task?.status || task?.Task_Status || 'pending');

const isPendingUsertask = (task) => !['completed', 'done'].includes(normalizeTaskStatus(task));

const getLatestStatusTask = (order) =>
  Array.isArray(order?.Status) && order.Status.length ? order.Status[order.Status.length - 1] : null;

const isEnquiryLike = (order) => {
  const currentTask = String(getLatestStatusTask(order)?.Task || order?.stage || '').trim().toLowerCase();
  return ['enquiry', 'enquiries', 'inquiry', 'lead'].includes(currentTask);
};

const matchUsertaskToUser = (task, user) => {
  const taskUser = String(task?.User || task?.AssignedTo || task?.Assigned || '').trim();
  const userName = String(user?.User_name || '').trim();
  const mobile = String(user?.Mobile_number || '').replace(/\D/g, '');

  if (!taskUser) return false;
  if (taskUser === userName) return true;
  if (taskUser.replace(/\D/g, '') && taskUser.replace(/\D/g, '') === mobile) return true;
  return false;
};

const buildOrderTaskRow = (order, userName = '') => {
  const latestStatusTask = getLatestStatusTask(order);
  const dueDate = order?.dueDate || latestStatusTask?.Delivery_Date || null;
  const normalizedDueDate = normalizeDateValue(dueDate);
  return {
    id: String(order?._id || order?.Order_uuid || order?.Order_Number || ''),
    source: 'order',
    title: `Order #${order?.Order_Number || '-'}`,
    subtitle: order?.Customer_name || order?.customerName || '',
    taskName: latestStatusTask?.Task || order?.stage || 'Design',
    assignedTo:
      order?.assignedToName ||
      latestStatusTask?.Assigned ||
      userName ||
      '',
    status: latestStatusTask?.Task || order?.stage || 'pending',
    dueDate: normalizedDueDate,
    overdue: Boolean(normalizedDueDate && normalizedDueDate.getTime() < Date.now()),
    orderNumber: order?.Order_Number || null,
    remark: order?.Remark || order?.orderNote || '',
    raw: order,
  };
};

const buildUsertaskRow = (task, resolvedUserName = '') => ({
  id: String(task?._id || task?.Usertask_uuid || task?.Usertask_Number || ''),
  source: 'usertask',
  title: task?.Usertask_name || 'Untitled Task',
  subtitle: task?.Remark || '',
  taskName: task?.Usertask_name || 'Task',
  assignedTo: resolvedUserName || String(task?.User || task?.AssignedTo || task?.Assigned || '').trim(),
  status: task?.Status || task?.TaskStatus || 'Pending',
  dueDate: normalizeDateValue(task?.Deadline),
  overdue: Boolean(normalizeDateValue(task?.Deadline) && normalizeDateValue(task?.Deadline).getTime() < Date.now()),
  orderNumber: null,
  remark: task?.Remark || '',
  raw: task,
});

const buildUserWiseAssignedTasks = ({ users = [], orderRowsByUser = new Map(), usertaskRows = [] }) => {
  const bucket = new Map();

  users.forEach((user) => {
    const userName = String(user?.User_name || '').trim();
    if (!userName) return;
    bucket.set(userName, {
      user: userName,
      group: user?.User_group || '',
      orderTasks: 0,
      userTasks: 0,
      total: 0,
      pending: 0,
      inProgress: 0,
    });
  });

  for (const [userName, rows] of orderRowsByUser.entries()) {
    if (!bucket.has(userName)) {
      bucket.set(userName, {
        user: userName,
        group: '',
        orderTasks: 0,
        userTasks: 0,
        total: 0,
        pending: 0,
        inProgress: 0,
      });
    }
    const row = bucket.get(userName);
    row.orderTasks += rows.length;
    row.total += rows.length;
    row.pending += rows.length;
  }

  usertaskRows.forEach((task) => {
    const assigned = String(task?.resolvedUserName || task?.User || task?.AssignedTo || task?.Assigned || '').trim() || 'Unassigned';
    if (!bucket.has(assigned)) {
      bucket.set(assigned, {
        user: assigned,
        group: '',
        orderTasks: 0,
        userTasks: 0,
        total: 0,
        pending: 0,
        inProgress: 0,
      });
    }
    const row = bucket.get(assigned);
    row.userTasks += 1;
    row.total += 1;

    const status = normalizeTaskStatus(task);
    if (['in_progress', 'progress', 'ongoing', 'working'].includes(status)) row.inProgress += 1;
    else row.pending += 1;
  });

  return Array.from(bucket.values()).sort((a, b) => b.total - a.total || a.user.localeCompare(b.user));
};

const getDashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const from = startOfDay(now);
    const to = endOfDay(now);

    const requestedUserName = String(req.query?.userName || '').trim();
    const isAdmin =
      String(req.query?.isAdmin || '').trim().toLowerCase() === 'true' ||
      String(req.query?.role || '').trim().toLowerCase() === 'admin';

    const [orderAgg, revenueAgg, pendingPaymentAgg, attendanceAgg, urgentOrders, users, allUsertasks, todayDeliveredOrders, allOrders] =
      await Promise.all([
        Orders.aggregate([
          {
            $facet: {
              todayOrders: [{ $match: { createdAt: { $gte: from, $lte: to } } }, { $count: 'count' }],
              pendingOrders: [{ $match: { stage: { $nin: ['delivered', 'paid'] } } }, { $count: 'count' }],
            },
          },
        ]),
        Transaction.aggregate([
          { $match: { Transaction_date: { $gte: from, $lte: to } } },
          { $group: { _id: null, revenue: { $sum: { $ifNull: ['$Total_Debit', 0] } } } },
        ]),
        Orders.aggregate([
          { $match: { billStatus: { $ne: 'paid' } } },
          { $group: { _id: null, pendingPayments: { $sum: { $ifNull: ['$Amount', 0] } } } },
        ]),
        Attendance.aggregate([
          { $match: { Date: { $gte: from, $lte: to } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ]),
        Orders.find({
          dueDate: { $lt: now, $ne: null },
          stage: { $nin: ['delivered', 'paid'] },
        })
          .sort({ dueDate: 1 })
          .limit(100)
          .lean(),
        Users.find({}).lean(),
        Usertasks.find({}).lean(),
        Orders.find({
          updatedAt: { $gte: from, $lte: to },
          Status: { $elemMatch: { Task: 'Delivered' } },
        }).lean(),
        Orders.find({}).lean(),
      ]);

    const todayOrdersCount = orderAgg?.[0]?.todayOrders?.[0]?.count || 0;
    const pendingOrdersCount = orderAgg?.[0]?.pendingOrders?.[0]?.count || 0;
    const todayRevenue = revenueAgg?.[0]?.revenue || 0;
    const pendingPayments = pendingPaymentAgg?.[0]?.pendingPayments || 0;
    const todayAttendance = attendanceAgg?.[0]?.count || 0;
    const todayDelivery = Array.isArray(todayDeliveredOrders) ? todayDeliveredOrders.length : 0;

    const todayEnquiry = (allOrders || []).filter((order) => {
      const createdAt = normalizeDateValue(order?.createdAt);
      if (!createdAt || createdAt < from || createdAt > to) return false;
      return isEnquiryLike(order);
    }).length;

    const orderRowsByUser = new Map();
    for (const user of users) {
      const userName = String(user?.User_name || '').trim();
      if (!userName) continue;
      try {
        const assigned = await getPendingOrdersForUser(userName);
        const rows = Array.isArray(assigned?.orders)
          ? assigned.orders.map((order) => buildOrderTaskRow(order, userName))
          : [];
        orderRowsByUser.set(userName, rows);
      } catch {
        orderRowsByUser.set(userName, []);
      }
    }

    const pendingUsertasks = (allUsertasks || []).filter(isPendingUsertask);
    const usertaskRows = pendingUsertasks.map((task) => {
      const matchedUser = users.find((user) => matchUsertaskToUser(task, user));
      return {
        ...task,
        resolvedUserName: matchedUser?.User_name || String(task?.User || task?.AssignedTo || task?.Assigned || '').trim(),
      };
    });

    let myAssignedTasks = [];
    if (requestedUserName) {
      const myOrderRows = orderRowsByUser.get(requestedUserName) || [];
      const myUsertaskRows = usertaskRows
        .filter((task) => String(task?.resolvedUserName || '').trim() === requestedUserName)
        .map((task) => buildUsertaskRow(task, requestedUserName));

      myAssignedTasks = [...myOrderRows, ...myUsertaskRows].sort((a, b) => {
        const dateA = normalizeDateValue(a?.dueDate)?.getTime() || 0;
        const dateB = normalizeDateValue(b?.dueDate)?.getTime() || 0;
        return dateA - dateB;
      });
    }

    const allAssignedTasksForAdmin = [];
    if (isAdmin) {
      for (const rows of orderRowsByUser.values()) {
        allAssignedTasksForAdmin.push(...rows);
      }
      allAssignedTasksForAdmin.push(
        ...usertaskRows.map((task) => buildUsertaskRow(task, task?.resolvedUserName || ''))
      );
      allAssignedTasksForAdmin.sort((a, b) => {
        const dateA = normalizeDateValue(a?.dueDate)?.getTime() || 0;
        const dateB = normalizeDateValue(b?.dueDate)?.getTime() || 0;
        return dateA - dateB;
      });
    }

    const userWiseAssignedTasks = buildUserWiseAssignedTasks({
      users,
      orderRowsByUser,
      usertaskRows,
    });

    return res.status(200).json({
      success: true,
      result: {
        todayOrdersCount,
        pendingOrdersCount,
        urgentOrders,
        todayRevenue,
        pendingPayments,
        todayAttendance,
        todayDelivery,
        todayEnquiry,

        // aliases for current frontend
        todayOrders: todayOrdersCount,
        pendingOrders: pendingOrdersCount,
        paymentReceivableToday: pendingPayments,
        todayRevenueAmount: todayRevenue,

        assignedTasks: isAdmin ? allAssignedTasksForAdmin : myAssignedTasks,
        myAssignedTasks,
        userWiseAssignedTasks,
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary' });
  }
};

module.exports = { getDashboardSummary };