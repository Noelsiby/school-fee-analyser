const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Fetch exams for classes the teacher manages
exports.getExams = async (req, res) => {
  const teacherId = req.user.userId;
  try {
    const classes = await prisma.class.findMany({
      where: { classTeacherId: teacherId },
      select: { id: true }
    });

    if (classes.length === 0) {
      console.log(`[ClassTeacher] User ${teacherId} has no assigned classes.`);
      return res.json({ exams: [] });
    }

    const classIds = classes.map(c => c.id);
    console.log(`[ClassTeacher] User ${teacherId} assigned to classIds:`, classIds);

    // Get Open and Closed exams for these classes
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
        subjectConfigs: {
          include: { subject: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`[ClassTeacher] Found ${exams.length} exams. Flatting...`);

    const examIds = exams.map(e => e.id);
    const marks = await prisma.mark.findMany({
      where: { examId: { in: examIds } },
      include: { student: true }
    });

    const flattenedExams = [];
    for (const exam of exams) {
      const isInternal = exam.examType === 'INTERNAL_EXAM';
      const relevantClasses = isInternal 
        ? exam.enrollments.filter(e => classIds.includes(e.classId)).map(e => e.class)
        : (classIds.includes(exam.classId) ? [exam.class] : []);

      for (const cls of relevantClasses) {
        const studentsInClass = await prisma.student.findMany({ where: { classId: cls.id } });
        const studentCount = studentsInClass.length;
        const studentIds = studentsInClass.map(s => s.id);
        
        const subjectReviews = exam.subjectConfigs.map(config => {
          const subjectMarks = marks.filter(m => m.examId === exam.id && m.subjectId === config.subjectId && studentIds.includes(m.studentId));
          
          let pendingCount = 0;
          let submittedCount = 0;
          let approvedCount = 0;
          let rejectedCount = 0;

          subjectMarks.forEach(m => {
            if (m.status === 'Pending') pendingCount++;
            else if (m.status === 'SubmittedToClassTeacher') submittedCount++;
            else if (m.status === 'Approved') approvedCount++;
            else if (m.status === 'Rejected') rejectedCount++;
          });

          let status = 'Pending';
          if (subjectMarks.length < studentCount || pendingCount > 0) status = 'Pending';
          else if (rejectedCount > 0) status = 'Rejected';
          else if (approvedCount === studentCount && studentCount > 0) status = 'Approved';
          else if (submittedCount + approvedCount === studentCount && studentCount > 0) status = 'SubmittedToClassTeacher';

          return { subject: config.subject, status };
        });

        flattenedExams.push({ 
          ...exam, 
          class: cls, 
          targetClassId: cls.id,
          subjectReviews 
        });
      }
    }
    
    console.log(`[ClassTeacher] Flattened to ${flattenedExams.length} relevant exams.`);

    res.json({ exams: flattenedExams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Aggregated view of all subjects and submission statuses for a specific exam
exports.getExamReview = async (req, res) => {
  const { id } = req.params;
  const teacherId = req.user.userId;
  // Get classId from query string (sent by frontend when clicking Review)
  const classId = req.query.classId;

  try {
    if (!classId) return res.status(400).json({ error: 'classId is required for multi-class exams.' });

    const exam = await prisma.exam.findUnique({
      where: { id: Number(id) },
      include: {
        subjectConfigs: {
          include: { subject: true }
        }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const examClass = await prisma.class.findUnique({
      where: { id: Number(classId) },
      include: {
        students: true,
        teacherAssignments: { include: { teacher: true } }
      }
    });

    if (!examClass) return res.status(404).json({ error: 'Class not found' });
    if (examClass.classTeacherId !== teacherId) {
      return res.status(403).json({ error: 'Not authorized for this class' });
    }

    // Get all marks for this exam and class
    const marks = await prisma.mark.findMany({
      where: { 
        examId: Number(id),
        student: { classId: Number(classId) }
      }
    });

    const studentCount = examClass.students.length;

    // Aggregate status per subject
    const subjectReviews = exam.subjectConfigs.map(config => {
      const subjectId = config.subjectId;
      const subjectMarks = marks.filter(m => m.subjectId === subjectId);
      
      const assignment = examClass.teacherAssignments.find(a => a.subjectId === subjectId);
      const subjectTeacher = assignment ? assignment.teacher : null;

      let status = 'Pending';
      let pendingCount = 0;
      let submittedCount = 0;
      let approvedCount = 0;
      let rejectedCount = 0;

      subjectMarks.forEach(m => {
        if (m.status === 'Pending') pendingCount++;
        else if (m.status === 'SubmittedToClassTeacher') submittedCount++;
        else if (m.status === 'Approved') approvedCount++;
        else if (m.status === 'Rejected') rejectedCount++;
      });

      const totalMarks = subjectMarks.length;

      if (totalMarks < studentCount || pendingCount > 0) {
        status = 'Pending';
      } else if (rejectedCount > 0) {
        status = 'Rejected';
      } else if (approvedCount === studentCount && studentCount > 0) {
        status = 'Approved';
      } else if (submittedCount + approvedCount === studentCount && studentCount > 0) {
        status = 'SubmittedToClassTeacher';
      }

      return {
        subject: config.subject,
        maxMarks: config.maxMarks,
        subjectTeacher,
        status,
        stats: {
          totalStudents: studentCount,
          enteredMarks: totalMarks,
          pending: pendingCount,
          submitted: submittedCount,
          approved: approvedCount,
          rejected: rejectedCount
        }
      };
    });

    res.json({
      exam: {
        id: exam.id,
        name: exam.name,
        status: exam.status,
        isLocked: exam.isLocked
      },
      class: {
        id: examClass.id,
        name: examClass.name
      },
      subjectReviews
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch marks for a specific subject
exports.getSubjectMarks = async (req, res) => {
  const { id, subjectId } = req.params;
  const classId = req.query.classId;

  try {
    const examClass = await prisma.class.findUnique({
      where: { id: Number(classId) }
    });

    if (!examClass || examClass.classTeacherId !== req.user.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const students = await prisma.student.findMany({
      where: { classId: Number(classId) },
      orderBy: { rollNumber: 'asc' }
    });

    const marks = await prisma.mark.findMany({
      where: {
        examId: Number(id),
        subjectId: Number(subjectId),
        student: { classId: Number(classId) }
      }
    });

    const config = await prisma.examSubjectConfig.findUnique({
      where: { examId_subjectId: { examId: Number(id), subjectId: Number(subjectId) } },
      include: { subject: true }
    });

    if (!config) return res.status(404).json({ error: 'Subject config not found' });

    let highest = -1;
    let lowest = 999999;
    let sum = 0;
    let enteredCount = 0;

    const results = students.map(student => {
      const mark = marks.find(m => m.studentId === student.id);
      if (mark && mark.marksObtained !== null) {
        if (mark.marksObtained > highest) highest = mark.marksObtained;
        if (mark.marksObtained < lowest) lowest = mark.marksObtained;
        sum += mark.marksObtained;
        enteredCount++;
      }
      return {
        student,
        markRecord: mark || null,
        marksObtained: mark ? mark.marksObtained : null
      };
    });

    res.json({
      subject: config.subject,
      maxMarks: config.maxMarks,
      results,
      stats: {
        highest: enteredCount > 0 ? highest : null,
        lowest: enteredCount > 0 ? lowest : null,
        average: enteredCount > 0 ? Number((sum / enteredCount).toFixed(2)) : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch full marksheet for a class
exports.getFullMarksheet = async (req, res) => {
  const { id } = req.params;
  const classId = req.query.classId;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: Number(id) },
      include: {
        subjectConfigs: { include: { subject: true } }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const students = await prisma.student.findMany({
      where: { classId: Number(classId) },
      orderBy: { rollNumber: 'asc' }
    });

    const marks = await prisma.mark.findMany({
      where: { 
        examId: Number(id),
        student: { classId: Number(classId) }
      },
      include: { subject: true }
    });

    // Compile results
    const results = students.map(student => {
      const studentMarks = marks.filter(m => m.studentId === student.id);
      let totalMarks = 0;
      let totalMax = 0;
      let allEntered = true;

      const marksBySubject = {};
      exam.subjectConfigs.forEach(config => {
        const markRecord = studentMarks.find(m => m.subjectId === config.subjectId);
        marksBySubject[config.subjectId] = markRecord || null;
        
        if (markRecord && markRecord.marksObtained !== null) {
          totalMarks += markRecord.marksObtained;
          totalMax += config.maxMarks;
        } else {
          allEntered = false;
        }
      });

      let percentage = 0;
      let grade = '—';
      if (allEntered && totalMax > 0) {
        percentage = Number(((totalMarks / totalMax) * 100).toFixed(2));
        if (percentage >= 90) grade = 'A+';
        else if (percentage >= 80) grade = 'A';
        else if (percentage >= 70) grade = 'B';
        else if (percentage >= 60) grade = 'C';
        else if (percentage >= 50) grade = 'D';
        else grade = 'F';
      }

      return {
        student,
        marksBySubject,
        totalMarks: allEntered ? totalMarks : '—',
        percentage: allEntered ? percentage : '—',
        grade
      };
    });

    res.json({
      exam,
      subjects: exam.subjectConfigs.map(c => c.subject),
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Edit a specific mark
exports.editMark = async (req, res) => {
  const { markId, newMarks } = req.body;
  const teacherId = req.user.userId;

  try {
    const existingMark = await prisma.mark.findUnique({
      where: { id: Number(markId) },
      include: { 
        subject: { include: { class: true } },
        exam: true
      }
    });

    if (!existingMark) return res.status(404).json({ error: 'Mark not found' });
    
    // Security check: Only class teacher can edit marks during review
    if (existingMark.subject.class.classTeacherId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized to edit this mark.' });
    }

    if (existingMark.exam.isLocked) {
      return res.status(400).json({ error: 'Exam is locked.' });
    }

    // Must be in submitted or approved state for class teacher to be looking at it
    if (['Pending', 'Rejected'].includes(existingMark.status)) {
      return res.status(400).json({ error: 'Cannot edit marks that are not yet submitted to you.' });
    }

    const config = await prisma.examSubjectConfig.findUnique({
      where: { examId_subjectId: { examId: existingMark.examId, subjectId: existingMark.subjectId } }
    });

    if (newMarks < 0 || newMarks > config.maxMarks) {
      return res.status(400).json({ error: `Marks must be between 0 and ${config.maxMarks}` });
    }

    const oldVal = existingMark.marksObtained;
    
    if (oldVal !== newMarks) {
      await prisma.$transaction([
        prisma.mark.update({
          where: { id: Number(markId) },
          data: { marksObtained: newMarks }
        }),
        prisma.auditLog.create({
          data: {
            tableName: 'marks',
            recordId: String(markId),
            action: 'UPDATE',
            oldValue: { marksObtained: oldVal },
            newValue: { marksObtained: newMarks },
            changedById: teacherId
          }
        })
      ]);
    }

    res.json({ message: 'Mark updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Approve a subject's marks
exports.approveMarks = async (req, res) => {
  const { examId, subjectId } = req.body;
  const teacherId = req.user.userId;

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: { class: true }
    });

    if (!subject || subject.class.classTeacherId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.mark.updateMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId),
        status: 'SubmittedToClassTeacher'
      },
      data: {
        status: 'Approved',
        rejectionReason: null
      }
    });

    res.json({ message: 'Subject marks approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Reject a subject's marks
exports.rejectMarks = async (req, res) => {
  const { examId, subjectId, reason } = req.body;
  const teacherId = req.user.userId;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: Number(subjectId) },
      include: { class: { include: { teacherAssignments: true } } }
    });

    if (!subject || subject.class.classTeacherId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.mark.updateMany({
      where: {
        examId: Number(examId),
        subjectId: Number(subjectId),
        status: { in: ['SubmittedToClassTeacher', 'Approved'] }
      },
      data: {
        status: 'Rejected',
        rejectionReason: reason
      }
    });

    const exam = await prisma.exam.findUnique({ where: { id: Number(examId) } });

    // Notify Subject Teacher
    const assignment = subject.class.teacherAssignments.find(a => a.subjectId === Number(subjectId));
    if (assignment) {
      await prisma.notification.create({
        data: {
          userId: assignment.teacherId,
          message: `Marks for ${subject.name} in "${exam.name}" were returned by the Class Teacher. Reason: ${reason}`,
          type: 'Warning'
        }
      });
    }

    res.json({ message: 'Subject marks rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Finalize the exam for the class once all subjects are approved
exports.finalizeExam = async (req, res) => {
  const { id } = req.params;
  const teacherId = req.user.userId;
  const classId = req.query.classId;

  try {
    if (!classId) return res.status(400).json({ error: 'classId is required.' });

    const examClass = await prisma.class.findUnique({
      where: { id: Number(classId) },
      include: { students: true }
    });

    if (!examClass || examClass.classTeacherId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: Number(id) },
      include: { subjectConfigs: true }
    });

    // Verify all subjects are fully approved
    const marks = await prisma.mark.findMany({
      where: { 
        examId: Number(id),
        student: { classId: Number(classId) }
      }
    });

    const studentCount = examClass.students.length;
    const requiredMarksCount = studentCount * exam.subjectConfigs.length;

    const approvedCount = marks.filter(m => m.status === 'Approved').length;

    if (approvedCount < requiredMarksCount) {
      return res.status(400).json({ error: 'Cannot finalize until all students have approved marks for all subjects.' });
    }

    // Instead of locking the whole exam, we should theoretically lock the enrollment.
    // However, the current system relies on Exam.status = 'Closed'.
    // If it's a CLASS_EXAM, we close it. If it's INTERNAL_EXAM, we need to close it if all classes are finalized.
    // For now, let's keep the existing behaviour (it closes the whole exam). In a real multi-class system, we'd add an ExamClassEnrollment.isLocked flag.
    
    // For simplicity, we'll mark the whole exam Closed for now. 
    await prisma.exam.update({
      where: { id: Number(id) },
      data: {
        status: 'Closed',
        isLocked: true
      }
    });

    const admins = await prisma.user.findMany({
      where: { roles: { has: 'Admin' } }
    });

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          message: `Class Teacher has finalized exam "${exam.name}" for ${examClass.name}. Ready for report card generation.`,
          type: 'Info'
        }))
      });
    }

    res.json({ message: 'Exam finalized successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch the students belonging to the class teacher's assigned class
exports.getMyStudents = async (req, res) => {
  const teacherId = req.user.userId;
  try {
    const classData = await prisma.class.findFirst({
      where: { classTeacherId: teacherId },
      include: {
        students: {
          orderBy: { rollNumber: 'asc' }
        }
      }
    });

    if (!classData) {
      return res.status(404).json({ error: 'No class assigned to this teacher.' });
    }

    res.json({
      className: classData.name,
      totalStudents: classData.students.length,
      students: classData.students
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
