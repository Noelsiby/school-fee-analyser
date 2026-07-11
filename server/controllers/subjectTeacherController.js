const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Fetch Open exams where the teacher has subject assignments
exports.getExams = async (req, res) => {
  const teacherId = req.user.userId;
  try {
    // Find all subjects this teacher is assigned to
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: { teacherId },
      include: { class: true, subject: true }
    });

    if (assignments.length === 0) {
      console.log(`[SubjectTeacher] User ${teacherId} has no subject assignments.`);
      return res.json({ exams: [] });
    }

    const classIds = [...new Set(assignments.map(a => a.classId))];
    console.log(`[SubjectTeacher] User ${teacherId} is assigned to classes:`, classIds);

    // Find all OPEN exams for these classes
    const exams = await prisma.exam.findMany({
      where: {
        OR: [
          { classId: { in: classIds } },
          { enrollments: { some: { classId: { in: classIds } } } }
        ],
        status: { in: ['Open', 'Closed'] } // Can view open and closed
      },
      include: {
        class: true,
        enrollments: { include: { class: true } },
        subjectConfigs: {
          include: { subject: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`[SubjectTeacher] Found ${exams.length} exams.`);

    const relevantExams = [];
    
    for (const exam of exams) {
      // Determine which classes this exam applies to
      const targetClasses = exam.examType === 'INTERNAL_EXAM' 
        ? exam.enrollments.map(e => e.classId)
        : [exam.classId];
        
      // For each class this exam applies to, check if the teacher has matching subjects
      for (const tClassId of targetClasses) {
        if (!classIds.includes(tClassId)) continue; // Teacher not assigned to this class
        
        // Get the teacher's assignments for this specific class
        const teacherClassAssignments = assignments.filter(a => a.classId === tClassId);
        const assignedSubjectIds = new Set(teacherClassAssignments.map(a => a.subjectId));
        
        // Check which of these assigned subjects are configured in this exam
        const examConfiguredSubjects = exam.subjectConfigs.filter(c => assignedSubjectIds.has(c.subjectId));
        
        if (examConfiguredSubjects.length > 0) {
          // This teacher has configured subjects for this exam in this class
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
        subjectConfigs: {
          where: { subjectId: Number(subjectId) }
        }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: {
        class: {
          include: { students: { orderBy: { rollNumber: 'asc' } } }
        }
      }
    });
    
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const maxMarks = exam.subjectConfigs[0]?.maxMarks || 100;

    const marks = await prisma.mark.findMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId)
      }
    });

    // Map students with their marks
    const studentsWithMarks = subject.class.students.map(student => {
      const markRecord = marks.find(m => m.studentId === student.id);
      return {
        ...student,
        markRecord: markRecord || null
      };
    });

    res.json({ 
      exam: { id: exam.id, name: exam.name, status: exam.status, isLocked: exam.isLocked },
      class: { id: subject.class.id, name: subject.class.name },
      maxMarks,
      students: studentsWithMarks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Bulk upsert marks
exports.saveMarks = async (req, res) => {
  const { examId, subjectId, marksData } = req.body;
  // marksData is an array of { studentId, marksObtained (can be null/empty string) }
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

    // Validate marks against maxMarks
    for (const item of marksData) {
      if (item.marksObtained !== null && item.marksObtained !== '') {
        const val = Number(item.marksObtained);
        if (isNaN(val) || val < 0 || val > maxMarks) {
          return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks}` });
        }
      }
    }

    // Get existing marks to know what changed (for audit log)
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
      
      // We only allow editing if status is Pending or Rejected
      if (existing && !['Pending', 'Rejected'].includes(existing.status)) {
        continue; // Skip editing locked records
      }

      const hasChanged = !existing || existing.marksObtained !== val;
      
      if (hasChanged) {
        if (existing) {
          // UPDATE
          upserts.push(prisma.mark.update({
            where: { id: existing.id },
            data: { 
              marksObtained: val, 
              lastEditedById: teacherId,
              // If it was rejected and edited, put it back to Pending
              status: existing.status === 'Rejected' ? 'Pending' : existing.status
            }
          }));

          auditLogs.push({
            tableName: 'marks',
            recordId: String(existing.id),
            action: 'UPDATE',
            oldValue: { marksObtained: existing.marksObtained },
            newValue: { marksObtained: val },
            changedById: teacherId
          });
        } else {
          // CREATE (Prisma $transaction doesn't return created IDs to subsequent ops easily, 
          // so for audit logs of creations, we'll skip or use a generic ID strategy, 
          // but we can just use upsert here without returning ID)
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
          // For creates, we can't get the ID cleanly in bulk, so we skip audit log for initial entry
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

// Submit marks to Class Teacher
exports.submitMarks = async (req, res) => {
  const { examId, subjectId } = req.body;
  const teacherId = req.user.userId;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: Number(examId) }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.isLocked) return res.status(403).json({ error: 'Exam is locked.' });

    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: { class: { include: { students: true } } }
    });

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    // Validate that all students have marks entered
    const marks = await prisma.mark.findMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId)
      }
    });

    const students = subject.class.students;
    if (marks.length < students.length || marks.some(m => m.marksObtained === null)) {
      return res.status(400).json({ error: 'Cannot submit until all students have marks entered.' });
    }

    // Update status to SubmittedToClassTeacher for this subject
    await prisma.mark.updateMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId),
        status: { in: ['Pending', 'Rejected'] }
      },
      data: {
        status: 'SubmittedToClassTeacher'
      }
    });

    // Notify Class Teacher
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
