const router = require('express').Router();
const ctrl = require('../controllers/analysisController');
const { authenticate, authorize } = require('../middleware/auth');

// Performance Analyser. Which classes each user may see is checked in the controller.
router.use(authenticate);

const staff = authorize('Admin', 'ClassTeacher');

router.get   ('/students/:id',                     staff, ctrl.studentPerformance);
router.post  ('/students/:id/notes',               staff, ctrl.addNote);
router.delete('/notes/:noteId',                    staff, ctrl.deleteNote);

router.get   ('/classes/:classId/exams',           ctrl.classExams);
router.get   ('/classes/:classId/exams/:examId',   ctrl.classAnalysis);
router.get   ('/classes/:classId/compare',         ctrl.compare);
router.get   ('/classes/:classId/remedial',        ctrl.listRemedial);
router.post  ('/classes/:classId/remedial',        ctrl.createRemedial);
router.delete('/remedial/:id',                     ctrl.deleteRemedial);

router.get   ('/my-subjects',                      ctrl.mySubjects);
router.get   ('/my-classes',                       ctrl.myClasses);
router.get   ('/subjects-overview',                staff, ctrl.subjectsOverview);
router.get   ('/at-risk',                          authorize('Admin'), ctrl.atRisk);

module.exports = router;
