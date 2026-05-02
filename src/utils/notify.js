const Notification = require('../models/Notification');

/**
 * Create an in-app notification for a user.
 * Silently swallows errors so a notification failure never breaks the main flow.
 *
 * @param {object} opts
 * @param {ObjectId|string} opts.userId   - recipient
 * @param {string}          opts.type     - Notification.type enum value
 * @param {string}          opts.message  - human-readable message
 * @param {ObjectId|string} [opts.relatedId] - optional reference ID (e.g. contactRequest._id)
 */
async function notify({ userId, type, message, relatedId }) {
  try {
    await Notification.create({
      user: userId,
      type,
      message,
      channel: 'in-app',
      relatedId,
    });
  } catch {
    // Notification failure must never break the calling request
  }
}

module.exports = notify;
