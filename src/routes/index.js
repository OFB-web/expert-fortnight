const express = require('express');
const authRoutes = require('./authRoutes');
const donorRoutes = require('./donorRoutes');
const contactRequestRoutes = require('./contactRequestRoutes');
const userRoutes = require('./userRoutes');
const bloodRequestRoutes = require('./bloodRequestRoutes');
const adminRoutes = require('./adminRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/donors', donorRoutes);
router.use('/contact-requests', contactRequestRoutes);
router.use('/users', userRoutes);
router.use('/requests', bloodRequestRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
