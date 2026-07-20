const router = require('express').Router();
const ctrl = require('../controllers/subjectTeacherController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('SubjectTeacher'));

// Fetch Open exams where the teacher has subject assignments
router.get('/exams', ctrl.getExams);

// Fetch the student list and current marks for a specific subject/exam
router.get('/exams/:examId/subjects/:subjectId/students', ctrl.getStudentsAndMarks);

// Bulk upsert marks (always allowed while exam is Open and not globally locked)
router.post('/marks', ctrl.saveMarks);

// Submit marks to Class Teacher (first submission)
router.put('/marks/submit', ctrl.submitMarks);

// Resubmit marks after editing — resets subject status and notifies Class Teacher
router.put('/marks/resubmit', ctrl.resubmitMarks);

// Update max marks for a subject config (only before submission)
router.put('/exam-config/:configId/max-marks', ctrl.updateMaxMarks);

module.exports = router;
