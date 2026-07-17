const router   = require('express').Router();
const ctrl     = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadProfile, uploadCSV } = require('../middleware/upload');

// All admin routes require authentication + Admin role
router.use(authenticate, authorize('Admin'));

// ── Stats ────────────────────────────────────────────────────
router.get('/stats', ctrl.getStats);

// ── Classes ──────────────────────────────────────────────────
router.get   ('/classes',                          ctrl.getClasses);
router.post  ('/classes',                          ctrl.createClass);
router.put   ('/classes/:id',                      ctrl.updateClass);
router.delete('/classes/:id',                      ctrl.deleteClass);
router.get   ('/classes/:id',                      ctrl.getClassDetail);
router.put   ('/classes/:id/assign-class-teacher', ctrl.assignClassTeacher);

// ── Subjects ─────────────────────────────────────────────────
router.get   ('/subjects',     ctrl.getSubjects);
router.post  ('/subjects',     ctrl.createSubject);
router.put   ('/subjects/:id', ctrl.updateSubject);
router.delete('/subjects/:id', ctrl.deleteSubject);

// ── Teachers ─────────────────────────────────────────────────
// Returns ALL teaching-role users (ClassTeacher + SubjectTeacher) for dropdowns
router.get   ('/teachers',     ctrl.getTeachers);
router.post  ('/teachers',     uploadProfile.single('profilePic'), ctrl.createTeacher);
router.put   ('/teachers/:id', uploadProfile.single('profilePic'), ctrl.updateTeacher);
router.delete('/teachers/:id', ctrl.deleteTeacher);

// ── Teacher-Subject Assignments ───────────────────────────────
router.get   ('/teacher-assignments',     ctrl.getAssignments);
router.post  ('/teacher-assignments',     ctrl.createAssignment);
router.delete('/teacher-assignments/:id', ctrl.deleteAssignment);

// ── Students ─────────────────────────────────────────────────
router.get   ('/students',              ctrl.getStudents);
router.post  ('/students',              ctrl.createStudent);
router.put   ('/students/:id',          ctrl.updateStudent);
router.delete('/students/:id',          ctrl.deleteStudent);
router.post  ('/students/bulk-import',  uploadCSV.single('csv'), ctrl.bulkImportStudents);

// ── Exams (Phase 1) ──────────────────────────────────────────
router.get   ('/exams',                      ctrl.getExams);
router.post  ('/exams',                      ctrl.createExam);
router.put   ('/exams/:id',                  ctrl.updateExam);
router.post  ('/exams/:id/subject-config',   ctrl.configExamSubjects);
router.put   ('/exams/:id/publish',          ctrl.publishExam);
router.delete('/exams/:id',                  ctrl.deleteExam);

// Get final compiled results for an exam
router.get('/exams/:id/results', ctrl.getExamResults);

// Unlock a finalized exam
router.put('/exams/:id/unlock', ctrl.unlockExam);

// Export exam results as CSV
router.get('/exams/:id/export', ctrl.exportExamResults);

// Export exam results as Excel
router.get('/exams/:id/export/excel', ctrl.exportExamResultsExcel);

// Export exam results as Word
router.get('/exams/:id/export/word', ctrl.exportExamResultsWord);

// Publish results to public portal
router.put('/exams/:id/publish-results', ctrl.publishPublicResults);
router.put('/exams/:id/unpublish-results', ctrl.unpublishPublicResults);

module.exports = router;
