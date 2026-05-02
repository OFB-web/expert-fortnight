const express = require('express');
const bloodRequestController = require('../controllers/bloodRequestController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All blood request routes require authentication (AUTH06, REQ02)
router.use(protect);

// POST /api/v1/requests       — seeker posts a blood request (REQ01)
// GET  /api/v1/requests       — list active blood requests with filters (REQ02)
router
  .route('/')
  .post(bloodRequestController.createBloodRequest)
  .get(bloodRequestController.listBloodRequests);

// GET    /api/v1/requests/:id — get a specific request (REQ02)
// PATCH  /api/v1/requests/:id — update or close (owner only) (REQ03)
// DELETE /api/v1/requests/:id — delete (owner or admin) (REQ04)
router
  .route('/:id')
  .get(bloodRequestController.getBloodRequest)
  .patch(bloodRequestController.updateBloodRequest)
  .delete(bloodRequestController.deleteBloodRequest);

module.exports = router;
