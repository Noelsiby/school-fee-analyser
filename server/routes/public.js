const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/classes', publicController.getPublicClasses);
router.get('/classes/:classId/results', publicController.getPublicResults);
router.get('/grade-scale', require('../controllers/gradeScaleController').getGradeScale);

module.exports = router;
