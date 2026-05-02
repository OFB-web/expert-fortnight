/**
 * BloodLink — Database Seed Script
 *
 * Populates the database with:
 *  - 1 admin account
 *  - 5 donor accounts (with approved DonorProfiles)
 *  - 3 seeker accounts
 *  - Sample ContactRequests
 *  - Sample BloodRequests
 *  - Sample Notifications
 *
 * Usage:
 *   node src/scripts/seed.js          — seed (skips if data already exists)
 *   node src/scripts/seed.js --force  — wipe collections and re-seed
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const DonorProfile = require('../models/DonorProfile');
const ContactRequest = require('../models/ContactRequest');
const BloodRequest = require('../models/BloodRequest');
const Notification = require('../models/Notification');

const FORCE = process.argv.includes('--force');

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const CITIES = ['Banjul', 'Serrekunda', 'Brikama', 'Farafenni', 'Basse'];

// ─── Seed data ────────────────────────────────────────────────────────────────

const adminData = {
  fullName: 'BloodLink Admin',
  email: 'admin@bloodlink.gm',
  password: 'Admin@1234',
  roles: ['admin'],
  city: 'Banjul',
  phone: '+2201000000',
};

const donorsData = [
  {
    fullName: 'Amadou Jallow',
    email: 'amadou.jallow@example.gm',
    password: 'Donor@1234',
    roles: ['donor'],
    city: 'Banjul',
    phone: '+2207100001',
    bloodGroup: 'O+',
    donationType: 'free',
    donationCount: 5,
    lastDonatedDate: new Date('2025-11-10'),
  },
  {
    fullName: 'Fatou Ceesay',
    email: 'fatou.ceesay@example.gm',
    password: 'Donor@1234',
    roles: ['donor'],
    city: 'Serrekunda',
    phone: '+2207100002',
    bloodGroup: 'A+',
    donationType: 'free',
    donationCount: 3,
    lastDonatedDate: new Date('2025-12-01'),
  },
  {
    fullName: 'Lamin Touray',
    email: 'lamin.touray@example.gm',
    password: 'Donor@1234',
    roles: ['donor'],
    city: 'Brikama',
    phone: '+2207100003',
    bloodGroup: 'B+',
    donationType: 'paid',
    donationAmount: 500,
    donationCount: 2,
    lastDonatedDate: new Date('2026-01-15'),
  },
  {
    fullName: 'Mariama Njie',
    email: 'mariama.njie@example.gm',
    password: 'Donor@1234',
    roles: ['donor', 'seeker'],
    city: 'Banjul',
    phone: '+2207100004',
    bloodGroup: 'AB-',
    donationType: 'free',
    donationCount: 8,
    lastDonatedDate: new Date('2026-02-20'),
  },
  {
    fullName: 'Ousman Baldeh',
    email: 'ousman.baldeh@example.gm',
    password: 'Donor@1234',
    roles: ['donor'],
    city: 'Farafenni',
    phone: '+2207100005',
    bloodGroup: 'O-',
    donationType: 'free',
    donationCount: 1,
    lastDonatedDate: null,
  },
];

const seekersData = [
  {
    fullName: 'Isatou Sanneh',
    email: 'isatou.sanneh@example.gm',
    password: 'Seeker@1234',
    roles: ['seeker'],
    city: 'Banjul',
    phone: '+2207200001',
  },
  {
    fullName: 'Kebba Drammeh',
    email: 'kebba.drammeh@example.gm',
    password: 'Seeker@1234',
    roles: ['seeker'],
    city: 'Serrekunda',
    phone: '+2207200002',
  },
  {
    fullName: 'Adama Barrow',
    email: 'adama.barrow@example.gm',
    password: 'Seeker@1234',
    roles: ['seeker'],
    city: 'Brikama',
    phone: '+2207200003',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function clearCollections() {
  console.log('Wiping existing data...');
  await Promise.all([
    User.deleteMany({}),
    DonorProfile.deleteMany({}),
    ContactRequest.deleteMany({}),
    BloodRequest.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log('Collections cleared.');
}

async function createUsers() {
  // Admin
  const admin = await User.create(adminData);
  console.log(`  Admin created: ${admin.email}`);

  // Donors
  const donors = [];
  for (const d of donorsData) {
    const { bloodGroup, donationType, donationAmount, donationCount, lastDonatedDate, ...userData } = d;
    const user = await User.create(userData);
    const profile = await DonorProfile.create({
      user: user._id,
      bloodGroup,
      donationType,
      donationAmount: donationAmount || 0,
      donationCount: donationCount || 0,
      lastDonatedDate: lastDonatedDate || undefined,
      availabilityStatus: true,
      approvalStatus: 'approved',
      approvedBy: admin._id,
      approvedAt: new Date(),
      registeredBy: user._id,
    });
    donors.push({ user, profile });
    console.log(`  Donor created: ${user.email} [${bloodGroup}]`);
  }

  // Seekers
  const seekers = [];
  for (const s of seekersData) {
    const user = await User.create(s);
    seekers.push(user);
    console.log(`  Seeker created: ${user.email}`);
  }

  return { admin, donors, seekers };
}

async function createContactRequests(donors, seekers, admin) {
  const requests = [
    {
      seeker: seekers[0]._id,
      donor: donors[0].user._id,
      bloodGroupNeeded: 'O+',
      message: 'Urgently need O+ blood for surgery tomorrow.',
      status: 'accepted',
      respondedAt: new Date(),
    },
    {
      seeker: seekers[1]._id,
      donor: donors[1].user._id,
      bloodGroupNeeded: 'A+',
      message: 'My mother needs A+ blood. Please help.',
      status: 'pending',
    },
    {
      seeker: seekers[2]._id,
      donor: donors[2].user._id,
      bloodGroupNeeded: 'B+',
      message: 'Looking for B+ donor in Brikama area.',
      status: 'declined',
      respondedAt: new Date(),
    },
  ];

  const created = await ContactRequest.insertMany(requests);
  console.log(`  ${created.length} contact requests created.`);
  return created;
}

async function createBloodRequests(seekers) {
  const requests = [
    {
      seeker: seekers[0]._id,
      bloodGroup: 'O+',
      city: 'Banjul',
      urgency: 'critical',
      message: 'Need O+ blood immediately for emergency surgery at RVTH.',
      status: 'open',
    },
    {
      seeker: seekers[1]._id,
      bloodGroup: 'A+',
      city: 'Serrekunda',
      urgency: 'urgent',
      message: 'Patient in hospital needs A+ blood transfusion.',
      status: 'open',
    },
    {
      seeker: seekers[2]._id,
      bloodGroup: 'B+',
      city: 'Brikama',
      urgency: 'normal',
      message: 'Scheduled operation next week, need B+ donors.',
      status: 'fulfilled',
    },
  ];

  const created = await BloodRequest.insertMany(requests);
  console.log(`  ${created.length} blood requests created.`);
  return created;
}

async function createNotifications(donors, seekers, contactRequests) {
  const notifications = [
    {
      user: donors[0].user._id,
      type: 'contact_request_received',
      message: `${seekers[0].fullName} has sent you a contact request for O+ blood.`,
      channel: 'in-app',
      isRead: true,
      relatedId: contactRequests[0]._id,
    },
    {
      user: seekers[0]._id,
      type: 'contact_request_accepted',
      message: `${donors[0].user.fullName} has accepted your contact request.`,
      channel: 'in-app',
      isRead: false,
      relatedId: contactRequests[0]._id,
    },
    {
      user: donors[0].user._id,
      type: 'donor_approved',
      message: 'Your donor profile has been approved. You are now visible in search results.',
      channel: 'in-app',
      isRead: true,
    },
    {
      user: seekers[2]._id,
      type: 'contact_request_declined',
      message: `${donors[2].user.fullName} has declined your contact request.`,
      channel: 'in-app',
      isRead: false,
      relatedId: contactRequests[2]._id,
    },
  ];

  const created = await Notification.insertMany(notifications);
  console.log(`  ${created.length} notifications created.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  if (FORCE) {
    await clearCollections();
  } else {
    const count = await User.countDocuments();
    if (count > 0) {
      console.log(`Database already has ${count} user(s). Use --force to re-seed.`);
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  console.log('Seeding users...');
  const { admin, donors, seekers } = await createUsers();

  console.log('Seeding contact requests...');
  const contactRequests = await createContactRequests(donors, seekers, admin);

  console.log('Seeding blood requests...');
  await createBloodRequests(seekers);

  console.log('Seeding notifications...');
  await createNotifications(donors, seekers, contactRequests);

  console.log('\nSeed complete.\n');
  console.log('─── Credentials ───────────────────────────────────────');
  console.log('  Admin:   admin@bloodlink.gm        / Admin@1234');
  console.log('  Donors:  amadou.jallow@example.gm  / Donor@1234');
  console.log('           fatou.ceesay@example.gm   / Donor@1234');
  console.log('           lamin.touray@example.gm   / Donor@1234');
  console.log('           mariama.njie@example.gm   / Donor@1234');
  console.log('           ousman.baldeh@example.gm  / Donor@1234');
  console.log('  Seekers: isatou.sanneh@example.gm  / Seeker@1234');
  console.log('           kebba.drammeh@example.gm  / Seeker@1234');
  console.log('           adama.barrow@example.gm   / Seeker@1234');
  console.log('───────────────────────────────────────────────────────');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
