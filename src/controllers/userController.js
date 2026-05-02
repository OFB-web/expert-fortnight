const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const ContactRequest = require('../models/ContactRequest');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

// ─── GET /api/v1/users/me ─────────────────────────────────────────────────────
// Return the current user's profile (PROFILE-01).
exports.getMe = catchAsync(async (req, res) => {
  // req.user is already loaded by protect middleware.
  // Re-fetch to ensure fresh data and to include notificationPreferences.
  const user = await User.findById(req.user._id);

  console.log('Fetched user profile for', user.email);

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── PUT /api/v1/users/me ─────────────────────────────────────────────────────
// Update own profile info and/or notification preferences (PROFILE-01, NOTIF05).
// Profile photo is accepted as a URL string here; a multipart upload middleware
// (e.g. multer + Cloudinary) can be slotted in front of this handler later (PROFILE-04).
exports.updateMe = catchAsync(async (req, res, next) => {
  // Guard: password changes must go through /me/password
  if (req.body.password || req.body.passwordConfirm) {
    return next(new ApiError(400, 'Use PUT /api/v1/users/me/password to change your password.'));
  }

  const allowed = ['fullName', 'phone', 'city', 'profilePhoto'];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  // Notification preferences — accept nested object or flat keys
  if (req.body.notificationPreferences) {
    const prefs = req.body.notificationPreferences;
    if (prefs.email !== undefined) updates['notificationPreferences.email'] = Boolean(prefs.email);
    if (prefs.sms !== undefined) updates['notificationPreferences.sms'] = Boolean(prefs.sms);
    if (prefs.inApp !== undefined) updates['notificationPreferences.inApp'] = Boolean(prefs.inApp);
  }

  if (Object.keys(updates).length === 0) {
    return next(new ApiError(400, 'No valid fields provided for update.'));
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  // console.log()

  res.status(200).json({ status: 'success', data: { user } });
});

// ─── PUT /api/v1/users/me/password ───────────────────────────────────────────
// Change own password (PROFILE-03). Requires current password for verification.
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ApiError(400, 'currentPassword and newPassword are required.'));
  }

  if (newPassword.length < 8) {
    return next(new ApiError(400, 'New password must be at least 8 characters.'));
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    return next(new ApiError(401, 'Current password is incorrect.'));
  }

  user.password = newPassword;
  // Invalidate existing refresh token so other sessions are logged out
  user.refreshToken = null;
  await user.save();

  res.status(200).json({ status: 'success', message: 'Password updated successfully.' });
});

// ─── DELETE /api/v1/users/me ──────────────────────────────────────────────────
// Soft-delete own account (PROFILE-05).
// Sets isActive = false and strips PII rather than dropping the document,
// preserving referential integrity for contact request history.
exports.deleteMe = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Anonymise the user record (soft delete)
  await User.findByIdAndUpdate(userId, {
    isActive: false,
    fullName: 'Deleted User',
    email: `deleted_${userId}@bloodlink.invalid`,
    phone: null,
    profilePhoto: null,
    city: null,
    refreshToken: null,
  });

  // Remove their donor profile from search results
  await DonorProfile.findOneAndUpdate(
    { user: userId },
    { approvalStatus: 'rejected', availabilityStatus: false }
  );

  res.status(204).send();
});

// ─── GET /api/v1/users/me/notifications ──────────────────────────────────────
// Fetch the current user's in-app notifications, newest first (NOTIF02).
exports.getMyNotifications = catchAsync(async (req, res) => {
  const { unread } = req.query;
  const filter = { user: req.user._id, channel: 'in-app' };
  if (unread === 'true') filter.isRead = false;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    data: { notifications },
  });
});

// ─── PATCH /api/v1/users/me/notifications/read ───────────────────────────────
// Mark all (or specific) in-app notifications as read.
exports.markNotificationsRead = catchAsync(async (req, res) => {
  const { ids } = req.body; // optional array of specific notification IDs

  const filter = { user: req.user._id, isRead: false };
  if (ids && Array.isArray(ids) && ids.length) {
    filter._id = { $in: ids };
  }

  await Notification.updateMany(filter, { isRead: true });

  res.status(200).json({ status: 'success', message: 'Notifications marked as read.' });
});
