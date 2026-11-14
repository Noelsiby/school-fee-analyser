const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const ctrl = require('../controllers/appController');
const { authenticateParent } = require('../lib/parentAuth');

// Student App (parents). Uses its own login; staff logins don't work here and vice versa.
const prisma = new PrismaClient();

router.post('/activate', ctrl.activate);
router.post('/login',    ctrl.login);

router.use(authenticateParent(prisma));
router.get('/me', ctrl.me);

const child = ['/children/:childId', ctrl.ownChild];
router.get(`${child[0]}/home`,       child[1], ctrl.home);
router.get(`${child[0]}/results`,    child[1], ctrl.results);
router.get(`${child[0]}/progress`,   child[1], ctrl.progress);
router.get(`${child[0]}/attendance`, child[1], ctrl.attendance);
router.get(`${child[0]}/timetable`,  child[1], ctrl.timetable);
router.get(`${child[0]}/notices`,    child[1], ctrl.notices);
router.get(`${child[0]}/profile`,    child[1], ctrl.profile);
router.get(`${child[0]}/photo`,      child[1], ctrl.photo);

module.exports = router;
