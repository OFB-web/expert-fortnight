const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All user routes require authentication (AUTH06, NFR01)
router.use(protect);

// GET  /api/v1/users/me            — get own profile (PROFILE-01)
// PUT  /api/v1/users/me            — update profile & notification prefs (PROFILE-01, NOTIF05)
// DELETE /api/v1/users/me          — delete own account (PROFILE-05)
router
  .route('/me')
  .get(userController.getMe)
  .put(userController.updateMe)
  .delete(userController.deleteMe);

// PUT /api/v1/users/me/password    — change password (PROFILE-03)
router.put('/me/password', userController.changePassword);

// GET   /api/v1/users/me/notifications       — list in-app notifications (NOTIF02)
// PATCH /api/v1/users/me/notifications/read  — mark as read
router.get('/me/notifications', userController.getMyNotifications);
router.patch('/me/notifications/read', userController.markNotificationsRead);

module.exports = router;
