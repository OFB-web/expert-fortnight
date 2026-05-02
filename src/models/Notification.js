const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'contact_request_received',
        'contact_request_accepted',
        'contact_request_declined',
        'donor_approved',
        'donor_rejected',
        'blood_request_match',
      ],
    },
    message: {
      type: String,
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'in-app'],
      default: 'in-app',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
