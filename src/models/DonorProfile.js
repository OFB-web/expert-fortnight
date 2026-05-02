const mongoose = require('mongoose');

const donorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    availabilityStatus: {
      type: Boolean,
      default: true,
    },
    lastDonatedDate: {
      type: Date,
    },
    donationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    donationType: {
      type: String,
      enum: ['free', 'paid'],
      default: 'free',
    },
    donationAmount: {
      type: Number,
      default: 0,
    },
    donationCapacity: {
      type: Number,
      default: 1,
      min: 1,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

donorProfileSchema.index({ bloodGroup: 1, approvalStatus: 1, availabilityStatus: 1 });

module.exports = mongoose.model('DonorProfile', donorProfileSchema);
