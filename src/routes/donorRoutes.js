const express = require('express');
const donorController = require('../controllers/donorController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All donor routes require authentication (AUTH06, SEARCH03)
router.use(protect);

// GET  /api/v1/donors          — search donors with filters (SEARCH01-06)
router.get('/', donorController.searchDonors);

// POST /api/v1/donors/apply    — submit donor application (DONOR01-06)
router.post('/apply', donorController.applyToBeDonor);

// PATCH /api/v1/donors/:id/availability — toggle availability (DONOR07)
router.patch('/:id/availability', donorController.toggleAvailability);

// GET /api/v1/donors/:id     — get single donor profile (SEARCH04-05)
// PUT /api/v1/donors/:id     — update donor profile (PROFILE02, DONOR02-04)
router
  .route('/:id')
  .get(donorController.getDonor)
  .put(donorController.updateDonorProfile);

module.exports = router;
