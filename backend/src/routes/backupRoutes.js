const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { protect } = require('../middleware/authMiddleware');

// Only authenticated users can POST to /backup/start
router.post('/start', protect, backupController.startBackup);

// Import all emails
router.post('/import', protect, backupController.importEmails);

// Restore backed up emails to Gmail
router.post('/restore', protect, backupController.restoreEmails);

// List backed-up emails for the authenticated user
router.get('/emails', protect, backupController.getInbox);

// Get signed attachment URLs for a specific email
router.get('/emails/:id/attachments', protect, backupController.getEmailAttachments);

// Dashboard stats for the authenticated user
router.get('/stats', protect, backupController.getDashboardStats);

module.exports = router;