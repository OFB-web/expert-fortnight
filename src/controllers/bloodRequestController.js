const mongoose = require('mongoose');
const BloodRequest = require('../models/BloodRequest');
const DonorProfile = require('../models/DonorProfile');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const notify = require('../utils/notify');

// ─── POST /api/v1/requests ────────────────────────────────────────────────────
// Seeker posts a new blood request (REQ01, REQ07).
// Notifies matching donors (REQ06).
exports.createBloodRequest = catchAsync(async (req, res, next) => {
  const { bloodGroup, city, urgency, message } = req.body;

  if (!bloodGroup || !city) {
    return next(new ApiError(400, 'bloodGroup and city are required.'));
  }

  const bloodRequest = await BloodRequest.create({
    seeker: req.user._id,
    bloodGroup,
    city,
    urgency: urgency || 'normal',
    message,
    status: 'open',
  });

  // Notify approved, available donors whose blood group matches (REQ06)
  // Fire-and-forget — does not block the response
  notifyMatchingDonors(bloodRequest, req.user.fullName).catch(() => {});

  res.status(201).json({ status: 'success', data: { bloodRequest } });
});

async function notifyMatchingDonors(bloodRequest, seekerName) {
  const matchingDonors = await DonorProfile.find({
    bloodGroup: bloodRequest.bloodGroup,
    approvalStatus: 'approved',
    availabilityStatus: true,
  }).select('user');

  const notifications = matchingDonors.map((d) =>
    notify({
      userId: d.user,
      type: 'blood_request_match',
      message: `${seekerName || 'Someone'} in ${bloodRequest.city} urgently needs ${bloodRequest.bloodGroup} blood (${bloodRequest.urgency}).`,
      relatedId: bloodRequest._id,
    })
  );

  await Promise.allSettled(notifications);
}

// ─── GET /api/v1/requests ─────────────────────────────────────────────────────
// List all open blood requests. Supports filters and pagination (REQ02).
exports.listBloodRequests = catchAsync(async (req, res) => {
  const { blood_group, city, urgency, status = 'open', page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (blood_group) filter.bloodGroup = blood_group;
  if (city) filter.city = { $regex: city, $options: 'i' };
  if (urgency) filter.urgency = urgency;

  const skip = (Number(page) - 1) * Number(limit);
  const total = await BloodRequest.countDocuments(filter);

  const requests = await BloodRequest.find(filter)
    .populate('seeker', 'fullName city profilePhoto')
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

// ─── GET /api/v1/requests/:id ─────────────────────────────────────────────────
// Get a single blood request (REQ02).
exports.getBloodRequest = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid request ID.'));
  }

  const bloodRequest = await BloodRequest.findById(req.params.id).populate(
    'seeker',
    'fullName city profilePhoto'
  );

  if (!bloodRequest) return next(new ApiError(404, 'Blood request not found.'));

  res.status(200).json({ status: 'success', data: { bloodRequest } });
});

// ─── PATCH /api/v1/requests/:id ───────────────────────────────────────────────
// Owner updates or closes their blood request (REQ03).
exports.updateBloodRequest = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid request ID.'));
  }

  const bloodRequest = await BloodRequest.findById(req.params.id);
  if (!bloodRequest) return next(new ApiError(404, 'Blood request not found.'));

  if (bloodRequest.seeker.toString() !== req.user._id.toString()) {
    return next(new ApiError(403, 'You can only update your own blood requests.'));
  }

  const allowed = ['bloodGroup', 'city', 'urgency', 'message', 'status'];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) bloodRequest[field] = req.body[field];
  });

  await bloodRequest.save();

  res.status(200).json({ status: 'success', data: { bloodRequest } });
});

// ─── DELETE /api/v1/requests/:id ─────────────────────────────────────────────
// Owner or admin deletes a blood request (REQ04).
exports.deleteBloodRequest = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid request ID.'));
  }

  const bloodRequest = await BloodRequest.findById(req.params.id);
  if (!bloodRequest) return next(new ApiError(404, 'Blood request not found.'));

  const isOwner = bloodRequest.seeker.toString() === req.user._id.toString();
  const isAdmin = req.user.roles.includes('admin');

  if (!isOwner && !isAdmin) {
    return next(new ApiError(403, 'You do not have permission to delete this request.'));
  }

  await bloodRequest.deleteOne();

  res.status(204).send();
});
