const mongoose = require('mongoose');
const DonorProfile = require('../models/DonorProfile');
const ContactRequest = require('../models/ContactRequest');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a list of donor user IDs, returns a Set of those IDs where the
 * current user has an accepted contact request.
 */
async function getUnlockedDonorIds(seekerId, donorUserIds) {
  if (!donorUserIds.length) return new Set();

  const accepted = await ContactRequest.find({
    seeker: seekerId,
    donor: { $in: donorUserIds },
    status: 'accepted',
  }).select('donor');

  return new Set(accepted.map((r) => r.donor.toString()));
}

/**
 * Strip phone from a plain donor object unless the donorUserId is in unlockedSet.
 */
function applyPhoneVisibility(donorObj, donorUserId, unlockedSet) {
  if (!unlockedSet.has(donorUserId.toString())) {
    if (donorObj.user) delete donorObj.user.phone;
  }
  return donorObj;
}

// ─── GET /api/v1/donors ───────────────────────────────────────────────────────
// Search donors with optional filters. Phone hidden unless contact unlocked.
exports.searchDonors = catchAsync(async (req, res) => {
  const { blood_group, city, available, name, page = 1, limit = 20 } = req.query;

  const filter = { approvalStatus: 'approved' };

  if (blood_group) filter.bloodGroup = blood_group;
  if (available !== undefined) filter.availabilityStatus = available === 'true';

  // city / name free-text is applied on the populated User fields — build user filter
  const userFilter = {};
  if (city) userFilter.city = { $regex: city, $options: 'i' };
  if (name) userFilter.fullName = { $regex: name, $options: 'i' };

  // If user-level filters exist, resolve matching user IDs first
  if (Object.keys(userFilter).length) {
    const matchedUsers = await User.find(userFilter).select('_id');
    filter.user = { $in: matchedUsers.map((u) => u._id) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await DonorProfile.countDocuments(filter);

  const donors = await DonorProfile.find(filter)
    .populate('user', 'fullName city profilePhoto phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  // Determine which donors have unlocked phone for the current user
  const donorUserIds = donors.map((d) => d.user._id);
  const unlockedSet = await getUnlockedDonorIds(req.user._id, donorUserIds);

  const results = donors.map((d) => { 
    const obj = d.toObject();
    applyPhoneVisibility(obj, d.user._id, unlockedSet);
    return obj;
  });

  console.log("donors>>>>>>>> ", results)

  res.status(200).json({
    status: 'success',
    results: results.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    data: { donors: results },
  });
});

// ─── GET /api/v1/donors/:id ───────────────────────────────────────────────────
// Get a single donor profile. Phone hidden unless contact unlocked.
exports.getDonor = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id).populate(
    'user',
    'fullName city profilePhoto phone'
  );

  if (!donor) return next(new ApiError(404, 'Donor not found.'));

  // Non-admins can only view approved profiles (unless it's their own)
  const isOwner = donor.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.roles.includes('admin');

  if (!isOwner && !isAdmin && donor.approvalStatus !== 'approved') {
    return next(new ApiError(404, 'Donor not found.'));
  }

  const unlockedSet = await getUnlockedDonorIds(req.user._id, [donor.user._id]);
  const obj = donor.toObject();
  applyPhoneVisibility(obj, donor.user._id, unlockedSet);

  res.status(200).json({ status: 'success', data: { donor: obj } });
});

// ─── POST /api/v1/donors/apply ────────────────────────────────────────────────
// Submit a donor application. Adds 'donor' role to user if missing.
// Profile starts as isApproved:false / approvalStatus:'pending' until admin acts.
exports.applyToBeDonor = catchAsync(async (req, res, next) => {
  // One application per user
  const existing = await DonorProfile.findOne({ user: req.user._id });
  if (existing) {
    return next(new ApiError(409, 'You already have a donor application.'));
  }

  const {
    bloodGroup,
    availabilityStatus,
    lastDonatedDate,
    donationCount,
    donationType,
    donationAmount,
    donationCapacity,
  } = req.body;

  if (!bloodGroup) return next(new ApiError(400, 'Blood group is required.'));

  const profile = await DonorProfile.create({
    user: req.user._id,
    bloodGroup,
    availabilityStatus: availabilityStatus !== undefined ? availabilityStatus : true,
    lastDonatedDate,
    donationCount,
    donationType,
    donationAmount,
    donationCapacity,
    registeredBy: req.user._id,
    isApproved: false,
    approvalStatus: 'pending',
  });

  // Ensure the user has the 'donor' role
  if (!req.user.roles.includes('donor')) {
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { roles: 'donor' },
    });
  }

  res.status(201).json({ status: 'success', data: { donor: profile } });
});

// ─── PUT /api/v1/donors/:id ───────────────────────────────────────────────────
// Update donor profile. Owner or admin only.
exports.updateDonorProfile = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id);
  if (!donor) return next(new ApiError(404, 'Donor not found.'));

  const isOwner = donor.user.toString() === req.user._id.toString();
  const isAdmin = req.user.roles.includes('admin');

  if (!isOwner && !isAdmin) {
    return next(new ApiError(403, 'You are not allowed to update this profile.'));
  }

  // Fields owners may update
  const allowed = [
    'bloodGroup',
    'availabilityStatus',
    'lastDonatedDate',
    'donationCount',
    'donationType',
    'donationAmount',
    'donationCapacity',
  ];

  allowed.forEach((field) => {
    if (req.body[field] !== undefined) donor[field] = req.body[field];
  });

  await donor.save();

  res.status(200).json({ status: 'success', data: { donor } });
});

// ─── PATCH /api/v1/donors/:id/availability ────────────────────────────────────
// Toggle availability. Owner only.
exports.toggleAvailability = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid donor ID.'));
  }

  const donor = await DonorProfile.findById(req.params.id);
  if (!donor) return next(new ApiError(404, 'Donor not found.'));

  if (donor.user.toString() !== req.user._id.toString()) {
    return next(new ApiError(403, 'You can only update your own availability.'));
  }

  // Accept explicit value or just flip current
  donor.availabilityStatus =
    req.body.availabilityStatus !== undefined
      ? Boolean(req.body.availabilityStatus)
      : !donor.availabilityStatus;

  await donor.save();

  res.status(200).json({
    status: 'success',
    data: { availabilityStatus: donor.availabilityStatus },
  });
});
