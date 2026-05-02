const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema(
  {
    seeker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    urgency: {
      type: String,
      enum: ['normal', 'urgent', 'critical'],
      default: 'normal',
    },
    message: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['open', 'fulfilled', 'expired'],
      default: 'open',
    },
  },
  { timestamps: true }
);

bloodRequestSchema.index({ bloodGroup: 1, city: 1, status: 1 });

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);
