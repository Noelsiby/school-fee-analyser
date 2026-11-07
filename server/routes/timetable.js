const router = require('express').Router();
const ctrl = require('../controllers/timetableController');
const { authenticate, authorize } = require('../middleware/auth');

// Timetable. Admin sets periods and timetables; every teacher can see their own day and week.
router.use(authenticate);
const admin = authorize('Admin');

router.get   ('/periods',                     ctrl.getPeriods);
router.put   ('/periods',                     admin, ctrl.savePeriods);
router.get   ('/overview',                    admin, ctrl.overview);
router.post  ('/copy',                        admin, ctrl.copyTimetable);
router.get   ('/classes/:classId',            ctrl.getClassTimetable);
router.put   ('/classes/:classId',            admin, ctrl.saveClassTimetable);
router.get   ('/teachers/:id',                ctrl.teacherWeek);
router.get   ('/my-day',                      ctrl.myDay);

router.get   ('/substitutions',               admin, ctrl.listSubstitutions);
router.get   ('/substitutions/plan',          admin, ctrl.planSubstitutions);
router.post  ('/substitutions',               admin, ctrl.saveSubstitution);
router.delete('/substitutions/:id',           admin, ctrl.deleteSubstitution);

module.exports = router;
