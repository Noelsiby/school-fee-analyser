const router = require('express').Router();
const ctrl = require('../controllers/classTeacherController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ClassTeacher'));

// Fetch the students in the class managed by the teacher
router.get('/my-students', ctrl.getMyStudents);

// Fetch exams for classes the teacher manages
router.get('/exams', ctrl.getExams);

// Aggregated view of all subjects and submission statuses for a specific exam
router.get('/exams/:id/review', ctrl.getExamReview);

// Fetch full marksheet for a class
router.get('/exams/:id/full-marksheet', ctrl.getFullMarksheet);

// Edit a specific mark
router.put('/marks/edit', ctrl.editMark);

// Approve a subject's marks
router.put('/marks/approve', ctrl.approveMarks);

// Reject a subject's marks
router.put('/marks/reject', ctrl.rejectMarks);

// Finalize the exam for the class once all subjects are approved
router.put('/exams/:id/finalize', ctrl.finalizeExam);

module.exports = router;
