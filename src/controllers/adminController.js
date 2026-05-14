const mongoose = require('mongoose');
const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const ContactRequest = require('../models/ContactRequest');
const BloodRequest = require('../models/BloodRequest');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const notify = require('../utils/notify');

// ─── GET /api/v1/admin/users ──────────────────────────────────────────────────
// List all users with optional role filter and pagination (ADMIN01).
exports.listUsers = catchAsync(async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (role) filter.roles = role; // e.g. ?role=donor

  const skip = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: { users },
  });
});

// ─── PATCH /api/v1/admin/donors/:id/approve ───────────────────────────────────
// Approve a pending donor profile (ADMIN02). Notifies the donor (NOTIF04).
exports.approveDonor = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor profile ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id);
  if (!donor) return next(new ApiError(404, 'Donor profile not found.'));

  if (donor.approvalStatus === 'approved') {
    return next(new ApiError(400, 'Donor profile is already approved.'));
  }

  donor.isApproved = true;
  donor.approvalStatus = 'approved';
  donor.approvedBy = req.user._id;
  donor.approvedAt = new Date();
  await donor.save();

  // Notify the donor (NOTIF04)
  await notify({
    userId: donor.user,
    type: 'donor_approved',
    message: 'Your donor profile has been approved. You are now visible in search results.',
    relatedId: donor._id,
  });

  res.status(200).json({ status: 'success', data: { donor } });
});

// ─── PATCH /api/v1/admin/donors/:id/reject ────────────────────────────────────
// Reject a donor profile (ADMIN02). Notifies the donor (NOTIF04).
exports.rejectDonor = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor profile ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id);
  if (!donor) return next(new ApiError(404, 'Donor profile not found.'));

  if (donor.approvalStatus === 'rejected') {
    return next(new ApiError(400, 'Donor profile is already rejected.'));
  }

  const { reason } = req.body;

  donor.isApproved = false;
  donor.approvalStatus = 'rejected';
  await donor.save();

  // Notify the donor (NOTIF04)
  const reasonText = reason ? ` Reason: ${reason}` : '';
  await notify({
    userId: donor.user,
    type: 'donor_rejected',
    message: `After reviewing your application, we regret to inform you that you do not currently meet the medical requirements to donate blood at this time.${reasonText} You may reapply once the condition has been addressed.`,
    relatedId: donor._id,
  });

  res.status(200).json({ status: 'success', data: { donor } });
});

// ─── DELETE /api/v1/admin/users/:id ──────────────────────────────────────────
// Deactivate (soft-delete) any user account (ADMIN03).
// Passing ?permanent=true hard-deletes — admin-only, irreversible.
exports.removeUser = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid user ID.'));
  }

  // Prevent admin from deleting themselves
  if (req.params.id === req.user._id.toString()) {
    return next(new ApiError(400, 'You cannot delete your own account via the admin panel.'));
  }

  const user = await User.findById(req.params.id);
  if (!user) return next(new ApiError(404, 'User not found.'));

  if (req.query.permanent === 'true') {
    // Hard delete — also remove donor profile
    await DonorProfile.findOneAndDelete({ user: user._id });
    await User.findByIdAndDelete(user._id);
    return res.status(204).send();
  }

  // Soft deactivate
  await User.findByIdAndUpdate(user._id, {
    isActive: false,
    refreshToken: null,
  });

  // Remove donor from search results
  await DonorProfile.findOneAndUpdate(
    { user: user._id },
    { approvalStatus: 'rejected', availabilityStatus: false }
  );

  res.status(200).json({ status: 'success', message: 'User account deactivated.' });
});

// ─── GET /api/v1/admin/contact-requests ──────────────────────────────────────
// View all contact requests across the platform (ADMIN04).
exports.listAllContactRequests = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await ContactRequest.countDocuments(filter);

  const requests = await ContactRequest.find(filter)
    .populate('seeker', 'fullName email city')
    .populate('donor', 'fullName email city')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: { contactRequests: requests },
  });
});

// ─── GET /api/v1/admin/analytics ─────────────────────────────────────────────
// Platform-wide statistics (ADMIN05).
exports.getAnalytics = catchAsync(async (req, res) => {
  const [
    totalUsers,
    totalDonors,
    totalSeekers,
    totalContactRequests,
    totalBloodRequests,
    pendingDonorApprovals,
    donorsByBloodGroup,
    contactRequestsByStatus,
    bloodRequestsByStatus,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ roles: 'donor', isActive: true }),
    User.countDocuments({ roles: 'seeker', isActive: true }),
    ContactRequest.countDocuments(),
    BloodRequest.countDocuments(),
    DonorProfile.countDocuments({ approvalStatus: 'pending' }),

    // Approved donors grouped by blood group
    DonorProfile.aggregate([
      { $match: { approvalStatus: 'approved' } },
      { $group: { _id: '$bloodGroup', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),

    // Contact requests by status
    ContactRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Blood requests by status
    BloodRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // Reshape aggregations into plain objects for readability
  const byBloodGroup = Object.fromEntries(
    donorsByBloodGroup.map(({ _id, count }) => [_id, count])
  );
  const contactByStatus = Object.fromEntries(
    contactRequestsByStatus.map(({ _id, count }) => [_id, count])
  );
  const bloodByStatus = Object.fromEntries(
    bloodRequestsByStatus.map(({ _id, count }) => [_id, count])
  );

  res.status(200).json({
    status: 'success',
    data: {
      users: {
        total: totalUsers,
        donors: totalDonors,
        seekers: totalSeekers,
      },
      donors: {
        pendingApprovals: pendingDonorApprovals,
        byBloodGroup,
      },
      contactRequests: {
        total: totalContactRequests,
        byStatus: contactByStatus,
      },
      bloodRequests: {
        total: totalBloodRequests,
        byStatus: bloodByStatus,
      },
    },
  });
});

// ─── GET /api/v1/admin/donors ─────────────────────────────────────────────────
// List donor applications with optional approvalStatus filter (ADMIN06).
exports.listDonorApplications = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.approvalStatus = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await DonorProfile.countDocuments(filter);

  const donors = await DonorProfile.find(filter)
    .populate('user', 'fullName email phone city profilePhoto')
    .populate('approvedBy', 'fullName email')
    .select('-medicalDocData')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: { donors },
  });
});

// ─── GET /api/v1/admin/donors/:id ────────────────────────────────────────────
// Full donor profile for admin review — includes medicalDocData (ADMIN06b).
exports.getDonorApplication = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor profile ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id)
    .populate('user', 'fullName email phone city profilePhoto')
    .populate('approvedBy', 'fullName email');

  if (!donor) return next(new ApiError(404, 'Donor profile not found.'));

  res.status(200).json({ status: 'success', data: { donor } });
});

// ─── GET /api/v1/admin/requests ───────────────────────────────────────────────
// Admin view of all blood requests (REQ04).
exports.listAllBloodRequests = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await BloodRequest.countDocuments(filter);

  const requests = await BloodRequest.find(filter)
    .populate('seeker', 'fullName email city phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.status(200).json({
    status: 'success',
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: { bloodRequests: requests },
  });
});
