const router = require('express').Router();
const ctrl = require('../controllers/subjectTeacherController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('SubjectTeacher'));

// Fetch Open exams where the teacher has subject assignments
router.get('/exams', ctrl.getExams);

// Fetch the student list and current marks for a specific subject/exam
router.get('/exams/:examId/subjects/:subjectId/students', ctrl.getStudentsAndMarks);

// Bulk upsert marks
router.post('/marks', ctrl.saveMarks);

// Submit marks to Class Teacher
router.put('/marks/submit', ctrl.submitMarks);

module.exports = router;
