const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Run at 08:00 AM every day
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Running daily deadline check...');
  
  try {
    const now = new Date();
    // 2 days from now
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(now.getDate() + 2);

    // Find Open exams with deadline approaching (between now and 2 days from now)
    const examsApproaching = await prisma.exam.findMany({
      where: {
        status: 'Open',
        deadline: {
          gt: now,
          lte: twoDaysFromNow
        }
      },
      include: {
        class: {
          include: {
            classTeacher: true,
            teacherAssignments: true
          }
        },
        subjectConfigs: true
      }
    });

    // Find Open exams with deadline passed
    const examsOverdue = await prisma.exam.findMany({
      where: {
        status: 'Open',
        deadline: {
          lt: now
        }
      },
      include: {
        class: {
          include: {
            classTeacher: true,
            teacherAssignments: true
          }
        },
        subjectConfigs: true
      }
    });

    const notificationsToCreate = [];

    const generateNotifications = (exams, isOverdue) => {
      for (const exam of exams) {
        const teachersToNotify = new Set();
        if (exam.class.classTeacherId) {
          teachersToNotify.add(exam.class.classTeacherId);
        }
        
        const configuredSubjectIds = new Set(exam.subjectConfigs.map(c => c.subjectId));
        
        for (const assignment of exam.class.teacherAssignments) {
          if (configuredSubjectIds.has(assignment.subjectId)) {
            teachersToNotify.add(assignment.teacherId);
          }
        }

        const msg = isOverdue 
          ? `WARNING: Deadline for exam "${exam.name}" (${exam.class.name}) has passed! Please complete marks entry immediately.`
          : `Reminder: Deadline for exam "${exam.name}" (${exam.class.name}) is approaching in less than 2 days.`;
        
        const type = isOverdue ? 'Warning' : 'Info';

        for (const userId of teachersToNotify) {
          notificationsToCreate.push({ userId, message: msg, type });
        }
      }
    };

    generateNotifications(examsApproaching, false);
    generateNotifications(examsOverdue, true);

    if (notificationsToCreate.length > 0) {
      await prisma.notification.createMany({
        data: notificationsToCreate
      });
      console.log(`[Cron] Generated ${notificationsToCreate.length} notifications.`);
    } else {
      console.log('[Cron] No notifications needed today.');
    }
  } catch (err) {
    console.error('[Cron] Error running daily check:', err);
  }
});
