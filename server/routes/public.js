const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/classes', publicController.getPublicClasses);
router.get('/classes/:classId/results', publicController.getPublicResults);

module.exports = router;
