const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Fetch Open exams where the teacher has subject assignments
exports.getExams = async (req, res) => {
  const teacherId = req.user.userId;
  try {
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId },
      include: { class: true, subject: true }
    });

    if (assignments.length === 0) {
      return res.json({ exams: [] });
    }

    const classIds = [...new Set(assignments.map(a => a.classId))];

    const exams = await prisma.exam.findMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { enrollments: { some: { classId: { in: classIds } } } }
        ],
        status: { in: ['Open', 'Closed'] }
      },
      include: {
        class: true,
        enrollments: { include: { class: true } },
        subjectConfigs: { include: { subject: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const relevantExams = [];

    for (const exam of exams) {
      const targetClasses = exam.examType === 'INTERNAL_EXAM'
        ? exam.enrollments.map(e => e.classId)
        : [exam.classId];

      for (const tClassId of targetClasses) {
        if (!classIds.includes(tClassId)) continue;
        const teacherClassAssignments = assignments.filter(a => a.classId === tClassId);
        const assignedSubjectIds = new Set(teacherClassAssignments.map(a => a.subjectId));
        const examConfiguredSubjects = exam.subjectConfigs.filter(c => assignedSubjectIds.has(c.subjectId));

        if (examConfiguredSubjects.length > 0) {
          relevantExams.push({
            ...exam,
            class: exam.examType === 'INTERNAL_EXAM'
              ? exam.enrollments.find(e => e.classId === tClassId)?.class
              : exam.class,
            targetClassId: tClassId,
            teacherSubjects: examConfiguredSubjects
          });
        }
      }
    }

    res.json({ exams: relevantExams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch the student list and current marks for a specific subject/exam
exports.getStudentsAndMarks = async (req, res) => {
  const { examId, subjectId } = req.params;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) },
      include: {
        subjectConfigs: { where: { subjectId: Number(subjectId) } }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: {
        class: { include: { students: { orderBy: { rollNumber: 'asc' } } } }
      }
    });

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const config = exam.subjectConfigs[0];
    const maxMarks = config?.maxMarks || 100;
    const configId = config?.id || null;

    const marks = await prisma.mark.findMany({
      where: { examId: Number(examId), subjectId: Number(subjectId) }
    });

    // Check if any marks have been submitted (to determine if maxMarks is locked)
    const anySubmitted = marks.some(m =>
      ['SubmittedToClassTeacher', 'Approved'].includes(m.status)
    );

    const studentsWithMarks = subject.class.students.map(student => {
      const markRecord = marks.find(m => m.studentId === student.id);
      return { ...student, markRecord: markRecord || null };
    });

    res.json({
      exam: { id: exam.id, name: exam.name, status: exam.status, isLocked: exam.isLocked },
      class: { id: subject.class.id, name: subject.class.name },
      maxMarks,
      configId,
      maxMarksLocked: anySubmitted, // true = can't edit max marks anymore
      students: studentsWithMarks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Bulk upsert marks — now allows editing even after submission
exports.saveMarks = async (req, res) => {
  const { examId, subjectId, marksData } = req.body;
  const teacherId = req.user.userId;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) },
      include: { subjectConfigs: { where: { subjectId: Number(subjectId) } } }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.isLocked) return res.status(403).json({ error: 'Exam is locked. Marks cannot be edited.' });
    if (exam.status !== 'Open') return res.status(403).json({ error: 'Exam is not open for editing.' });

    const maxMarks = exam.subjectConfigs[0]?.maxMarks || 100;

    for (const item of marksData) {
      if (item.marksObtained !== null && item.marksObtained !== '') {
        const val = Number(item.marksObtained);
        if (isNaN(val) || val < 0 || val > maxMarks) {
          return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks}` });
        }
      }
    }

    const existingMarks = await prisma.mark.findMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId),
        studentId: { in: marksData.map(m => Number(m.studentId)) }
      }
    });

    const auditLogs = [];
    const upserts = [];

    for (const item of marksData) {
      const studentId = Number(item.studentId);
      const val = (item.marksObtained === null || item.marksObtained === '') ? null : Number(item.marksObtained);
      const existing = existingMarks.find(m => m.studentId === studentId);
      const hasChanged = !existing || existing.marksObtained !== val;

      if (hasChanged) {
        if (existing) {
          // Allow editing regardless of current status
          // If submitted/approved, reset to Pending so Class Teacher re-reviews
          const newStatus = ['SubmittedToClassTeacher', 'Approved'].includes(existing.status)
            ? 'Pending'
            : (existing.status === 'Rejected' ? 'Pending' : existing.status);

          upserts.push(prisma.mark.update({
            where: { id: existing.id },
            data: { marksObtained: val, lastEditedById: teacherId, status: newStatus }
          }));

          auditLogs.push({
            tableName: 'marks',
            recordId: String(existing.id),
            action: 'UPDATE',
            oldValue: { marksObtained: existing.marksObtained, oldStatus: existing.status },
            newValue: { marksObtained: val, newStatus: newStatus },
            changedById: teacherId
          });
        } else {
          upserts.push(prisma.mark.create({
            data: {
              examId: Number(examId),
              subjectId: Number(subjectId),
              studentId,
              marksObtained: val,
              enteredById: teacherId,
              lastEditedById: teacherId,
              status: 'Pending'
            }
          }));
        }
      }
    }

    if (upserts.length > 0) {
      await prisma.$transaction([...upserts]);
      if (auditLogs.length > 0) {
        await prisma.auditLog.createMany({ data: auditLogs });
      }
    }

    res.json({ message: 'Marks saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Submit marks to Class Teacher (first time)
exports.submitMarks = async (req, res) => {
  const { examId, subjectId } = req.body;
  const teacherId = req.user.userId;

  try {
    const exam = await prisma.exam.findUnique({ where: { id: Number(examId) } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.isLocked) return res.status(403).json({ error: 'Exam is locked.' });

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: { class: { include: { students: true } } }
    });

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const marks = await prisma.mark.findMany({
      where: { examId: Number(examId), subjectId: Number(subjectId) }
    });

    const students = subject.class.students;
    if (marks.length < students.length || marks.some(m => m.marksObtained === null)) {
      return res.status(400).json({ error: 'Cannot submit until all students have marks entered.' });
    }

    await prisma.mark.updateMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId),
        status: { in: ['Pending', 'Rejected'] }
      },
      data: { status: 'SubmittedToClassTeacher' }
    });

    if (subject.class.classTeacherId) {
      await prisma.notification.create({
        data: {
          userId: subject.class.classTeacherId,
          message: `${req.user.name} has submitted marks for ${subject.name} in exam "${exam.name}".`,
          type: 'Action'
        }
      });
    }

    res.json({ message: 'Marks submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resubmit marks after editing — resets subject to Pending and notifies Class Teacher
exports.resubmitMarks = async (req, res) => {
  const { examId, subjectId } = req.body;
  const teacherId = req.user.userId;

  try {
    const exam = await prisma.exam.findUnique({ where: { id: Number(examId) } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.isLocked) return res.status(403).json({ error: 'Exam is locked.' });

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: { class: { include: { students: true } } }
    });

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const marks = await prisma.mark.findMany({
      where: { examId: Number(examId), subjectId: Number(subjectId) }
    });

    const students = subject.class.students;
    if (marks.length < students.length || marks.some(m => m.marksObtained === null)) {
      return res.status(400).json({ error: 'Cannot submit until all students have marks entered.' });
    }

    // Set ALL marks for this subject back to SubmittedToClassTeacher
    await prisma.mark.updateMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId)
      },
      data: { status: 'SubmittedToClassTeacher' }
    });

    // Write audit log for the resubmission event
    await prisma.auditLog.create({
      data: {
        tableName: 'marks',
        recordId: `exam:${examId}:subject:${subjectId}`,
        action: 'RESUBMIT',
        oldValue: null,
        newValue: { resubmittedBy: teacherId, examId, subjectId },
        changedById: teacherId
      }
    });

    // Send Warning notification to Class Teacher
    if (subject.class.classTeacherId) {
      await prisma.notification.create({
        data: {
          userId: subject.class.classTeacherId,
          message: `⚠️ ${req.user.name} has updated marks for ${subject.name} in "${exam.name}". Please re-review.`,
          type: 'Warning'
        }
      });
    }

    res.json({ message: 'Marks updated and resubmitted to Class Teacher.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update max marks for a subject config — only allowed before submission
exports.updateMaxMarks = async (req, res) => {
  const { configId } = req.params;
  const { maxMarks } = req.body;
  const teacherId = req.user.userId;

  if (!maxMarks || isNaN(Number(maxMarks)) || Number(maxMarks) <= 0) {
    return res.status(400).json({ error: 'Invalid max marks value.' });
  }

  try {
    const config = await prisma.examSubjectConfig.findUnique({
      where: { id: Number(configId) },
      include: {
        exam: true,
        subject: { include: { class: true } }
      }
    });

    if (!config) return res.status(404).json({ error: 'Config not found' });
    if (config.exam.isLocked) return res.status(403).json({ error: 'Exam is locked.' });
    if (config.exam.status !== 'Open') return res.status(403).json({ error: 'Exam is not open.' });

    // Verify this teacher is assigned to this subject
    const assignment = await prisma.teacherSubjectAssignment.findFirst({
      where: { teacherId, subjectId: config.subjectId }
    });
    if (!assignment) return res.status(403).json({ error: 'You are not assigned to this subject.' });

    // Check no marks have been submitted yet
    const submittedMarks = await prisma.mark.findMany({
      where: {
        examId: config.examId,
        subjectId: config.subjectId,
        status: { in: ['SubmittedToClassTeacher', 'Approved'] }
      }
    });

    if (submittedMarks.length > 0) {
      return res.status(400).json({ error: 'Cannot change max marks after marks have been submitted.' });
    }

    await prisma.examSubjectConfig.update({
      where: { id: Number(configId) },
      data: { maxMarks: Number(maxMarks) }
    });

    res.json({ message: 'Max marks updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
