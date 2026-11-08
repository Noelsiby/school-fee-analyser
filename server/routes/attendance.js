const router = require('express').Router();
const ctrl = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

// Attendance. Who may mark or see each class is checked in the controller.
router.use(authenticate);
const admin = authorize('Admin');

router.get   ('/settings',                    ctrl.getSettings);
router.put   ('/settings',                    admin, ctrl.updateSettings);
router.post  ('/holidays',                    admin, ctrl.addHoliday);
router.delete('/holidays/:id',                admin, ctrl.deleteHoliday);

router.get   ('/classes',                     ctrl.myClasses);
router.get   ('/classes/:classId',            ctrl.getRegister);
router.put   ('/classes/:classId',            ctrl.saveRegister);
router.delete('/classes/:classId',            authorize('Admin'), ctrl.deleteRegister);
router.get   ('/classes/:classId/summary',    ctrl.classSummary);
router.get   ('/today',                       authorize('Admin', 'ClassTeacher'), ctrl.dayOverview);
router.get   ('/students/:id',                ctrl.studentCalendar);
router.post  ('/alerts',                      authorize('Admin'), ctrl.sendAlerts); // WhatsApp to parents: admin only

module.exports = router;
