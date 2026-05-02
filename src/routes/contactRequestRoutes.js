const express = require('express');
const contactRequestController = require('../controllers/contactRequestController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All contact-request routes require authentication (AUTH06)
router.use(protect);

// POST /api/v1/contact-requests       — seeker initiates request (CONTACT01)
// GET  /api/v1/contact-requests/mine  — own requests as seeker or donor (CONTACT06, DONOR08)
router.post('/', contactRequestController.createContactRequest);
router.get('/mine', contactRequestController.getMyContactRequests);

// PATCH /api/v1/contact-requests/:id  — donor accepts or declines (CONTACT05)
router.patch('/:id', contactRequestController.respondToContactRequest);

module.exports = router;
