const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication AND the admin role (NFR01, AUTH07)
router.use(protect, restrictTo('admin'));

// Users
router.get('/users', adminController.listUsers);                         // ADMIN01
router.delete('/users/:id', adminController.removeUser);                 // ADMIN03

// Donor applications
router.get('/donors', adminController.listDonorApplications);            // ADMIN06
router.patch('/donors/:id/approve', adminController.approveDonor);       // ADMIN02
router.patch('/donors/:id/reject', adminController.rejectDonor);         // ADMIN02

// Platform oversight
router.get('/contact-requests', adminController.listAllContactRequests); // ADMIN04
router.get('/analytics', adminController.getAnalytics);                  // ADMIN05
router.get('/requests', adminController.listAllBloodRequests);           // REQ04

module.exports = router;
