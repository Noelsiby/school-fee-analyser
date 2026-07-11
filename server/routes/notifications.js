const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

// All notification routes require authentication
router.use(authenticate);

router.get('/', ctrl.getNotifications);
router.put('/:id/read', ctrl.markAsRead);

module.exports = router;
