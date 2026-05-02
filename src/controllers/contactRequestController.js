const mongoose = require('mongoose');
const ContactRequest = require('../models/ContactRequest');
const DonorProfile = require('../models/DonorProfile');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const notify = require('../utils/notify');

// ─── POST /api/v1/contact-requests ───────────────────────────────────────────
// Seeker initiates a contact request for an approved donor (CONTACT01-04).
exports.createContactRequest = catchAsync(async (req, res, next) => {
  const { donorId, bloodGroupNeeded, message } = req.body;

  if (!donorId || !bloodGroupNeeded) {
    return next(new ApiError(400, 'donorId and bloodGroupNeeded are required.'));
  }

  if (!mongoose.isValidObjectId(donorId)) {
    return next(new ApiError(400, 'Invalid donor ID.'));
  }

  // donorId is the DonorProfile._id; resolve the owner user ID
  const donorProfile = await DonorProfile.findById(donorId);
  if (!donorProfile || donorProfile.approvalStatus !== 'approved') {
    return next(new ApiError(404, 'Donor not found or not yet approved.'));
  }

  const donorUserId = donorProfile.user;

  // Cannot request yourself
  if (donorUserId.toString() === req.user._id.toString()) {
    return next(new ApiError(400, 'You cannot send a contact request to yourself.'));
  }

  // Prevent duplicate pending requests for the same seeker–donor pair (CONTACT06)
  const duplicate = await ContactRequest.findOne({
    seeker: req.user._id,
    donor: donorUserId,
    status: 'pending',
  });
  if (duplicate) {
    return next(new ApiError(409, 'You already have a pending request for this donor.'));
  }

  const contactRequest = await ContactRequest.create({
    seeker: req.user._id,
    donor: donorUserId,
    bloodGroupNeeded,
    message,
    status: 'pending',
  });

  // Notify the donor in-app (CONTACT04, NOTIF01)
  const seekerName = req.user.fullName || 'A seeker';
  await notify({
    userId: donorUserId,
    type: 'contact_request_received',
    message: `${seekerName} has sent you a contact request for ${bloodGroupNeeded} blood.`,
    relatedId: contactRequest._id,
  });

  // Immediately reveal phone if donor has already accepted a prior request
  // (edge-case: seeker sends second request after a previous one was accepted)
  const populated = await contactRequest.populate([
    { path: 'donor', select: 'fullName city profilePhoto' },
    { path: 'seeker', select: 'fullName city profilePhoto' },
  ]);

  res.status(201).json({ status: 'success', data: { contactRequest: populated } });
});

// ─── GET /api/v1/contact-requests/mine ───────────────────────────────────────
// Returns all requests where the current user is the seeker OR the donor.
// Donor's phone is included only on accepted requests where the caller is the seeker.
// (DONOR08, CONTACT06)
exports.getMyContactRequests = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const requests = await ContactRequest.find({
    $or: [{ seeker: userId }, { donor: userId }],
  })
    .populate('seeker', 'fullName city profilePhoto')
    .populate('donor', 'fullName city profilePhoto phone')
    .sort({ createdAt: -1 });

  // NFR07: strip donor phone unless this user is the seeker AND request is accepted
  const results = requests.map((r) => {
    const obj = r.toObject();
    const isSeekerView =
      obj.seeker && obj.seeker._id.toString() === userId.toString();
    const isAccepted = obj.status === 'accepted';

    if (!isSeekerView || !isAccepted) {
      if (obj.donor) delete obj.donor.phone;
    }
    return obj;
  });

  console.log('My contact requests:', results);

  res.status(200).json({
    status: 'success',
    results: results.length,
    data: { contactRequests: results },
  });
});

// ─── PATCH /api/v1/contact-requests/:id ──────────────────────────────────────
// Donor accepts or declines a pending request (CONTACT05).
// Notifies the seeker of the outcome (NOTIF03).
exports.respondToContactRequest = catchAsync(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return next(new ApiError(400, 'Invalid contact request ID.'));
  }

  const { status } = req.body;
  if (!['accepted', 'declined'].includes(status)) {
    return next(new ApiError(400, "status must be 'accepted' or 'declined'."));
  }

  const contactRequest = await ContactRequest.findById(req.params.id);
  if (!contactRequest) {
    return next(new ApiError(404, 'Contact request not found.'));
  }

  // Only the donor this request is addressed to may respond
  if (contactRequest.donor.toString() !== req.user._id.toString()) {
    return next(new ApiError(403, 'You are not the donor for this request.'));
  }

  if (contactRequest.status !== 'pending') {
    return next(new ApiError(400, 'This request has already been responded to.'));
  }

  contactRequest.status = status;
  contactRequest.respondedAt = new Date();
  await contactRequest.save();

  // Notify the seeker (NOTIF03)
  const donorName = req.user.fullName || 'The donor';
  const outcome = status === 'accepted' ? 'accepted' : 'declined';
  await notify({
    userId: contactRequest.seeker,
    type: status === 'accepted' ? 'contact_request_accepted' : 'contact_request_declined',
    message: `${donorName} has ${outcome} your contact request.`,
    relatedId: contactRequest._id,
  });

  const populated = await contactRequest.populate([
    { path: 'seeker', select: 'fullName city profilePhoto' },
    {
      path: 'donor',
      select: status === 'accepted' ? 'fullName city profilePhoto phone' : 'fullName city profilePhoto',
    },
  ]);

  res.status(200).json({ status: 'success', data: { contactRequest: populated } });
});
