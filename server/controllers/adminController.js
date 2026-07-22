/**
 * adminController.js
 * Full CRUD for: Classes, Subjects, Teachers, TeacherAssignments, Students
 * All routes are Admin-only (enforced by the router middleware).
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt           = require('bcryptjs');
const fs               = require('fs');
const path             = require('path');
const ExcelJS          = require('exceljs');
const prisma           = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────

/** Strip passwordHash from a user object */
const safeUser = (u) => {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
};

/** Build the public URL for an uploaded profile picture */
const profileUrl = (filename) =>
  filename ? `/uploads/profiles/${filename}` : null;

/** Delete an old profile picture file from disk */
const deleteFile = (filePath) => {
  if (!filePath) return;
  const abs = path.join(__dirname, '..', filePath.replace(/^\//, ''));
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
};

/** Handle Prisma unique-constraint error */
const isDupError = (err) => err?.code === 'P2002';

/** Parse a CSV text string → array of objects (uses first row as headers) */
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim());
    return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] ?? '' }), {});
  });
}

// ════════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════════
exports.getStats = async (req, res) => {
  try {
    const [teachers, classes, students, subjects] = await Promise.all([
      prisma.user.count({ where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } } }),
      prisma.class.count(),
      prisma.student.count(),
      prisma.subject.count(),
    ]);
    res.json({ teachers, classes, students, subjects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// CLASSES
// ════════════════════════════════════════════════════════════════
exports.getClasses = async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        classTeacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true, subjects: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getClassDetail = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        classTeacher: { select: { id: true, name: true, email: true, profilePicUrl: true, roles: true } },
        students: { orderBy: { rollNumber: 'asc' } },
        subjects: {
          orderBy: { name: 'asc' },
          include: {
            teacherAssignments: {
              select: {
                id: true,
                teacher: { select: { id: true, name: true, email: true, roles: true } },
              },
            },
          },
        },
        teacherAssignments: {
          include: {
            teacher: { select: { id: true, name: true, email: true, roles: true } },
            subject: { select: { id: true, name: true } },
          },
          orderBy: { subject: { name: 'asc' } },
        },
      },
    });
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    res.json({ class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createClass = async (req, res) => {
  const { name, classTeacherId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Class name is required.' });
  try {
    const cls = await prisma.class.create({
      data: {
        name: name.trim(),
        ...(classTeacherId ? { classTeacherId: Number(classTeacherId) } : {}),
      },
      include: {
        classTeacher: { select: { id: true, name: true } },
        _count: { select: { students: true, subjects: true } },
      },
    });
    res.status(201).json({ class: cls });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'A class with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
};

exports.updateClass = async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Class name is required.' });
  try {
    const cls = await prisma.class.update({
      where: { id },
      data: { name: name.trim() },
      include: {
        classTeacher: { select: { id: true, name: true } },
        _count: { select: { students: true, subjects: true } },
      },
    });
    res.json({ class: cls });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'A class with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.class.delete({ where: { id } });
    res.json({ message: 'Class deleted.' });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Class not found.' });
    res.status(500).json({ error: err.message });
  }
};

exports.assignClassTeacher = async (req, res) => {
  const id             = Number(req.params.id);
  const { classTeacherId } = req.body;
  try {
    const cls = await prisma.class.update({
      where: { id },
      data:  { classTeacherId: classTeacherId ? Number(classTeacherId) : null },
      include: {
        classTeacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true, subjects: true } },
      },
    });
    res.json({ class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// SUBJECTS
// ════════════════════════════════════════════════════════════════
exports.getSubjects = async (req, res) => {
  const { classId } = req.query;
  try {
    const subjects = await prisma.subject.findMany({
      where: classId ? { classId: Number(classId) } : undefined,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }],
    });
    res.json({ subjects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSubject = async (req, res) => {
  const { name, classId } = req.body;
  if (!name?.trim())  return res.status(400).json({ error: 'Subject name is required.' });
  if (!classId)       return res.status(400).json({ error: 'Class is required.' });
  try {
    const subject = await prisma.subject.create({
      data: { name: name.trim(), classId: Number(classId) },
      include: { class: { select: { id: true, name: true } } },
    });
    res.status(201).json({ subject });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'This subject already exists in the selected class.' });
    res.status(500).json({ error: err.message });
  }
};

exports.updateSubject = async (req, res) => {
  const id = Number(req.params.id);
  const { name, classId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required.' });
  try {
    const subject = await prisma.subject.update({
      where: { id },
      data: {
        name: name.trim(),
        ...(classId ? { classId: Number(classId) } : {}),
      },
      include: { class: { select: { id: true, name: true } } },
    });
    res.json({ subject });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'This subject already exists in the selected class.' });
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    await prisma.subject.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Subject deleted.' });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Subject not found.' });
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// TEACHERS (Users with teacher roles)
// ════════════════════════════════════════════════════════════════
exports.getTeachers = async (req, res) => {
  try {
    const teachers = await prisma.user.findMany({
      where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } },
      select: {
        id: true, name: true, email: true, profilePicUrl: true, createdAt: true,
        roles: true,
        subjectAssignments: {
          select: {
            id: true,
            subject: { select: { id: true, name: true } },
            class:   { select: { id: true, name: true } },
          },
        },
        classesManaged: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ teachers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createTeacher = async (req, res) => {
  const { name, email, password, roles } = req.body;
  // roles comes as JSON string or array from multipart form
  let parsedRoles = roles;
  if (typeof roles === 'string') {
    try { parsedRoles = JSON.parse(roles); } catch { parsedRoles = [roles]; }
  }

  // Validation
  if (!name?.trim())     return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim())    return res.status(400).json({ error: 'Email is required.' });
  if (!password)         return res.status(400).json({ error: 'Password is required.' });
  if (!parsedRoles?.length) return res.status(400).json({ error: 'At least one role is required.' });

  const validRoles = ['ClassTeacher', 'SubjectTeacher'];
  const invalid = parsedRoles.filter((r) => !validRoles.includes(r));
  if (invalid.length) return res.status(400).json({ error: `Invalid role(s): ${invalid.join(', ')}` });

  try {
    const passwordHash   = await bcrypt.hash(password, 12);
    const profilePicUrl  = req.file ? profileUrl(req.file.filename) : null;

    const teacher = await prisma.user.create({
      data: {
        name:        name.trim(),
        email:       email.trim().toLowerCase(),
        passwordHash,
        profilePicUrl,
        roles:       parsedRoles,
      },
      select: {
        id: true, name: true, email: true, profilePicUrl: true, createdAt: true,
        roles: true,
        subjectAssignments: true,
        classesManaged: { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ teacher });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: err.message });
  }
};

exports.updateTeacher = async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, roles } = req.body;
  let parsedRoles = roles;
  if (typeof roles === 'string') {
    try { parsedRoles = JSON.parse(roles); } catch { parsedRoles = roles ? [roles] : []; }
  }

  if (!name?.trim())  return res.status(400).json({ error: 'Name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required.' });

  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Teacher not found.' });

    // Handle new profile picture
    let profilePicUrl = existing.profilePicUrl;
    if (req.file) {
      if (existing.profilePicUrl) deleteFile(existing.profilePicUrl);
      profilePicUrl = profileUrl(req.file.filename);
    }

    const data = {
      name:  name.trim(),
      email: email.trim().toLowerCase(),
      profilePicUrl,
    };
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

    const teacher = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(parsedRoles?.length ? { roles: parsedRoles } : {}),
      },
      select: {
        id: true, name: true, email: true, profilePicUrl: true, createdAt: true,
        roles: true,
        subjectAssignments: {
          select: {
            id: true,
            subject: { select: { id: true, name: true } },
            class:   { select: { id: true, name: true } },
          },
        },
        classesManaged: { select: { id: true, name: true } },
      },
    });
    res.json({ teacher });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'This email is already in use.' });
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTeacher = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Teacher not found.' });
    if (user.profilePicUrl) deleteFile(user.profilePicUrl);
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Teacher deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// TEACHER-SUBJECT ASSIGNMENTS
// ════════════════════════════════════════════════════════════════
exports.getAssignments = async (req, res) => {
  const { teacherId } = req.query;
  try {
    const assignments = await prisma.teacherSubjectAssignment.findMany({
      where: teacherId ? { teacherId: Number(teacherId) } : undefined,
      include: {
        teacher: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        class:   { select: { id: true, name: true } },
      },
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createAssignment = async (req, res) => {
  const { teacherId, subjectId, classId } = req.body;
  if (!teacherId || !subjectId || !classId)
    return res.status(400).json({ error: 'teacherId, subjectId, and classId are all required.' });

  try {
    // Verify the subject belongs to the class
    const subject = await prisma.subject.findUnique({ where: { id: Number(subjectId) } });
    if (!subject || subject.classId !== Number(classId))
      return res.status(400).json({ error: 'Subject does not belong to the specified class.' });

    const assignment = await prisma.teacherSubjectAssignment.create({
      data: {
        teacherId: Number(teacherId),
        subjectId: Number(subjectId),
        classId:   Number(classId),
      },
      include: {
        teacher: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        class:   { select: { id: true, name: true } },
      },
    });
    res.status(201).json({ assignment });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'This assignment already exists.' });
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAssignment = async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.teacherSubjectAssignment.delete({ where: { id } });
    res.json({ message: 'Assignment removed.' });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Assignment not found.' });
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// STUDENTS
// ════════════════════════════════════════════════════════════════
exports.getStudents = async (req, res) => {
  const { classId } = req.query;
  try {
    const students = await prisma.student.findMany({
      where: classId ? { classId: Number(classId) } : undefined,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { rollNumber: 'asc' }],
    });
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createStudent = async (req, res) => {
  const { name, rollNumber, classId } = req.body;
  if (!name?.trim())       return res.status(400).json({ error: 'Student name is required.' });
  if (!rollNumber?.trim()) return res.status(400).json({ error: 'Roll number is required.' });
  if (!classId)            return res.status(400).json({ error: 'Class is required.' });
  try {
    const student = await prisma.student.create({
      data: { name: name.trim(), rollNumber: rollNumber.trim(), classId: Number(classId) },
      include: { class: { select: { id: true, name: true } } },
    });
    res.status(201).json({ student });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'A student with this roll number already exists in this class.' });
    res.status(500).json({ error: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  const id = Number(req.params.id);
  const { name, rollNumber, classId } = req.body;
  if (!name?.trim())       return res.status(400).json({ error: 'Student name is required.' });
  if (!rollNumber?.trim()) return res.status(400).json({ error: 'Roll number is required.' });
  try {
    const student = await prisma.student.update({
      where: { id },
      data: {
        name:       name.trim(),
        rollNumber: rollNumber.trim(),
        ...(classId ? { classId: Number(classId) } : {}),
      },
      include: { class: { select: { id: true, name: true } } },
    });
    res.json({ student });
  } catch (err) {
    if (isDupError(err)) return res.status(409).json({ error: 'Roll number already exists in this class.' });
    res.status(500).json({ error: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    await prisma.student.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Student deleted.' });
  } catch (err) {
    if (err?.code === 'P2025') return res.status(404).json({ error: 'Student not found.' });
    res.status(500).json({ error: err.message });
  }
};

exports.bulkImportStudents = async (req, res) => {
  const { classId } = req.body;
  if (!classId)    return res.status(400).json({ error: 'classId is required for bulk import.' });
  if (!req.file)   return res.status(400).json({ error: 'CSV file is required.' });

  try {
    const text = fs.readFileSync(req.file.path, 'utf8');
    const rows = parseCSV(text);

    if (!rows.length) return res.status(400).json({ error: 'CSV is empty or has no data rows.' });

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      const name       = row.name?.trim();
      const rollNumber = (row.rollnumber || row['roll number'] || row.roll_number || row.rollno)?.trim();

      if (!name || !rollNumber) {
        results.errors.push({ row, reason: 'Missing name or rollNumber' });
        results.skipped++;
        continue;
      }

      try {
        await prisma.student.create({
          data: { name, rollNumber, classId: Number(classId) },
        });
        results.created++;
      } catch (e) {
        const reason = isDupError(e) ? 'Duplicate roll number in this class' : e.message;
        results.errors.push({ row, reason });
        results.skipped++;
      }
    }

    // Clean up uploaded CSV file
    fs.unlinkSync(req.file.path);

    res.json({
      message: `Import complete: ${results.created} created, ${results.skipped} skipped.`,
      ...results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// EXAMS (Phase 1)
// ════════════════════════════════════════════════════════════════

exports.getExams = async (req, res) => {
  try {
    const exams = await prisma.exam.findMany({
      include: {
        class: { select: { id: true, name: true, _count: { select: { students: true } }, classTeacher: { select: { id: true, name: true } } } },
        enrollments: { include: { class: { select: { id: true, name: true, _count: { select: { students: true } }, classTeacher: { select: { id: true, name: true } } } } } },
        subjectConfigs: { include: { subject: true } },
        _count: { select: { marks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createExam = async (req, res) => {
  const { name, examType, classId, classIds, deadline } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  try {
    if (examType === 'INTERNAL_EXAM') {
      if (!Array.isArray(classIds) || classIds.length === 0) {
        return res.status(400).json({ error: 'At least one class is required for Internal Exams.' });
      }
      const exam = await prisma.exam.create({
        data: {
          name: name.trim(),
          examType: 'INTERNAL_EXAM',
          deadline: deadline ? new Date(deadline) : null,
          status: 'Draft',
          enrollments: {
            create: classIds.map(id => ({ classId: Number(id) }))
          }
        },
        include: { enrollments: { include: { class: true } } }
      });
      return res.status(201).json({ exam });
    } else {
      if (!classId) return res.status(400).json({ error: 'classId is required for Class Exams.' });
      const exam = await prisma.exam.create({
        data: {
          name: name.trim(),
          examType: 'CLASS_EXAM',
          classId: Number(classId),
          deadline: deadline ? new Date(deadline) : null,
          status: 'Draft',
        },
        include: { class: true }
      });
      return res.status(201).json({ exam });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const marks = await prisma.mark.findMany({ where: { examId }, select: { id: true } });
    const markIds = marks.map(m => String(m.id));

    if (markIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          tableName: 'marks',
          recordId: { in: markIds }
        }
      });
    }

    await prisma.mark.deleteMany({ where: { examId } });
    await prisma.notification.deleteMany({ where: { message: { contains: `"${exam.name}"` } } });
    await prisma.examSubjectConfig.deleteMany({ where: { examId } });
    await prisma.examClassEnrollment.deleteMany({ where: { examId } });
    
    await prisma.exam.delete({ where: { id: examId } });
    res.json({ message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const examId = Number(req.params.id);
    const { name, deadline } = req.body;
    
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        enrollments: { include: { class: { include: { classTeacher: true, teacherAssignments: { include: { teacher: true } } } } } },
        class: { include: { classTeacher: true, teacherAssignments: { include: { teacher: true } } } },
        subjectConfigs: true
      }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const updated = await prisma.exam.update({
      where: { id: examId },
      data: { 
        name: name?.trim() || exam.name,
        deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : exam.deadline
      }
    });

    // Notify all affected teachers about the update
    const teachersToNotify = new Set();
    const classes = exam.examType === 'INTERNAL_EXAM'
      ? exam.enrollments.map(e => e.class)
      : [exam.class];
    const configuredSubjectIds = new Set(exam.subjectConfigs.map(c => c.subjectId));

    classes.forEach(cls => {
      if (!cls) return;
      if (cls.classTeacherId) teachersToNotify.add(cls.classTeacherId);
      for (const assignment of (cls.teacherAssignments || [])) {
        if (configuredSubjectIds.has(assignment.subjectId)) {
          teachersToNotify.add(assignment.teacherId);
        }
      }
    });

    if (teachersToNotify.size > 0 && exam.status !== 'Draft') {
      await prisma.notification.createMany({
        data: Array.from(teachersToNotify).map(userId => ({
          userId,
          message: `⚠️ "${updated.name}" exam has been updated by Admin. Please check the latest exam details.`,
          type: 'Warning'
        }))
      });
    }

    res.json({ exam: updated, notifiedCount: teachersToNotify.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a class to an existing exam
exports.addExamClass = async (req, res) => {
  const examId = Number(req.params.id);
  const { classId } = req.body;
  if (!classId) return res.status(400).json({ error: 'classId is required.' });

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        enrollments: { include: { class: true } },
        subjectConfigs: { include: { subject: true } }
      }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.examType !== 'INTERNAL_EXAM') {
      return res.status(400).json({ error: 'Can only add classes to Internal Exams.' });
    }

    const alreadyEnrolled = exam.enrollments.some(e => e.classId === Number(classId));
    if (alreadyEnrolled) return res.status(409).json({ error: 'Class is already enrolled in this exam.' });

    // Add the enrollment
    const enrollment = await prisma.examClassEnrollment.create({
      data: { examId, classId: Number(classId) },
      include: { class: { include: { classTeacher: true, teacherAssignments: { include: { teacher: true } } } } }
    });

    // Notify Class Teacher and subject teachers of the newly added class
    const cls = enrollment.class;
    const teachersToNotify = new Set();
    const configuredSubjectIds = new Set(exam.subjectConfigs.map(c => c.subjectId));

    if (cls.classTeacherId) teachersToNotify.add(cls.classTeacherId);
    for (const assignment of (cls.teacherAssignments || [])) {
      if (configuredSubjectIds.has(assignment.subjectId)) {
        teachersToNotify.add(assignment.teacherId);
      }
    }

    if (teachersToNotify.size > 0) {
      const deadlineStr = exam.deadline ? ` before ${new Date(exam.deadline).toLocaleDateString('en-IN')}` : '';
      await prisma.notification.createMany({
        data: Array.from(teachersToNotify).map(userId => ({
          userId,
          message: `📋 ${cls.name} has been added to the exam "${exam.name}". Please enter marks${deadlineStr}.`,
          type: 'Info'
        }))
      });
    }

    res.json({ enrollment, notifiedCount: teachersToNotify.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Remove a class from an existing exam
exports.removeExamClass = async (req, res) => {
  const examId = Number(req.params.id);
  const classId = Number(req.params.classId);

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        enrollments: { include: { class: { include: { classTeacher: true } } } }
      }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const enrollment = exam.enrollments.find(e => e.classId === classId);
    if (!enrollment) return res.status(404).json({ error: 'Class is not enrolled in this exam.' });

    // Check if any marks have been submitted for this class
    const marksExist = await prisma.mark.count({
      where: {
        examId,
        student: { classId }
      }
    });

    if (marksExist > 0) {
      return res.status(400).json({
        error: `Cannot remove ${enrollment.class.name} — ${marksExist} mark(s) already submitted by teachers. Delete the marks first.`
      });
    }

    // Safe to remove — delete the enrollment and any subject configs for subjects belonging to this class
    await prisma.examClassEnrollment.delete({
      where: { examId_classId: { examId, classId } }
    });

    // Notify Class Teacher
    const cls = enrollment.class;
    if (cls.classTeacherId) {
      await prisma.notification.create({
        data: {
          userId: cls.classTeacherId,
          message: `⚠️ ${cls.name} has been removed from the exam "${exam.name}" by Admin.`,
          type: 'Warning'
        }
      });
    }

    res.json({ message: `${cls.name} removed from exam successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin update max marks (works on any exam status, not just Draft)
exports.adminUpdateMaxMarks = async (req, res) => {
  const examId = Number(req.params.id);
  const { configs } = req.body; // Array of { subjectId, maxMarks }

  if (!Array.isArray(configs)) {
    return res.status(400).json({ error: 'configs array is required.' });
  }

  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    // Upsert configs (no status check — Admin can update at any time)
    const upserts = configs.map(c =>
      prisma.examSubjectConfig.upsert({
        where: { examId_subjectId: { examId, subjectId: Number(c.subjectId) } },
        update: { maxMarks: Number(c.maxMarks) },
        create: { examId, subjectId: Number(c.subjectId), maxMarks: Number(c.maxMarks) },
      })
    );

    await prisma.$transaction(upserts);

    const updated = await prisma.exam.findUnique({
      where: { id: examId },
      include: { subjectConfigs: { include: { subject: true } } },
    });

    res.json({ exam: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.configExamSubjects = async (req, res) => {
  const examId = Number(req.params.id);
  const { configs } = req.body; // Array of { subjectId, maxMarks }
  
  if (!Array.isArray(configs)) {
    return res.status(400).json({ error: 'configs array is required.' });
  }

  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'Draft') {
      return res.status(400).json({ error: 'Can only configure subjects while exam is in Draft status.' });
    }

    // Upsert configs in a transaction
    const upserts = configs.map(c => 
      prisma.examSubjectConfig.upsert({
        where: { examId_subjectId: { examId, subjectId: Number(c.subjectId) } },
        update: { maxMarks: Number(c.maxMarks) },
        create: { examId, subjectId: Number(c.subjectId), maxMarks: Number(c.maxMarks) },
      })
    );
    
    await prisma.$transaction(upserts);
    
    const updated = await prisma.exam.findUnique({
      where: { id: examId },
      include: { subjectConfigs: { include: { subject: true } } },
    });
    
    res.json({ exam: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.publishExam = async (req, res) => {
  const examId = Number(req.params.id);
  
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        class: {
          include: {
            classTeacher: true,
            teacherAssignments: { include: { teacher: true } }
          }
        },
        enrollments: {
          include: {
            class: {
              include: {
                classTeacher: true,
                teacherAssignments: { include: { teacher: true } }
              }
            }
          }
        },
        subjectConfigs: {
          include: { subject: true }
        }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'Draft') {
      return res.status(400).json({ error: 'Exam is already published.' });
    }
    if (exam.subjectConfigs.length === 0) {
      return res.status(400).json({ error: 'Cannot publish exam without configuring subject max marks.' });
    }

    // Change status to Open
    const updatedExam = await prisma.exam.update({
      where: { id: examId },
      data: { status: 'Open' }
    });

    // Notify Class Teacher and Subject Teachers
    const teachersToNotify = new Set();
    const configuredSubjectIds = new Set(exam.subjectConfigs.map(c => c.subjectId));
    
    // Collect all classes involved
    const classes = exam.examType === 'INTERNAL_EXAM' 
      ? exam.enrollments.map(e => e.class)
      : [exam.class];

    classes.forEach(cls => {
      if (!cls) return;
      if (cls.classTeacherId) {
        teachersToNotify.add(cls.classTeacherId);
      }
      for (const assignment of cls.teacherAssignments) {
        if (configuredSubjectIds.has(assignment.subjectId)) {
          teachersToNotify.add(assignment.teacherId);
        }
      }
    });

    if (teachersToNotify.size > 0) {
      const classNames = classes.map(c => c?.name).join(', ');
      const notifications = Array.from(teachersToNotify).map(userId => ({
        userId,
        message: `A new exam "${exam.name}" for ${classNames} has been published and is open for marks entry.`,
        type: 'Info'
      }));

      await prisma.notification.createMany({
        data: notifications
      });
    }

    res.json({ exam: updatedExam, notifiedCount: teachersToNotify.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════════
// PHASE 4: FINALIZATION & EXPORT
// ════════════════════════════════════════════════════════════════

exports.getExamResults = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        class: {
          include: { students: { orderBy: { rollNumber: 'asc' } } }
        },
        enrollments: {
          include: {
            class: {
              include: { students: { orderBy: { rollNumber: 'asc' } } }
            }
          }
        },
        subjectConfigs: {
          include: { subject: { include: { class: true } } }
        }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const marks = await prisma.mark.findMany({
      where: { examId: id }
    });

    const classes = exam.examType === 'INTERNAL_EXAM' 
      ? exam.enrollments.map(e => e.class)
      : [exam.class];

    // Compile result matrix grouped by class
    let classResults = [];
    
    classes.forEach(cls => {
      if (!cls) return;
      
      const classSubjects = exam.subjectConfigs
        .filter(c => c.subject.classId === cls.id)
        .map(c => ({
          id: c.subjectId,
          name: c.subject.name,
          maxMarks: c.maxMarks
        }));

      const results = cls.students.map(student => {
        const studentMarks = marks.filter(m => m.studentId === student.id);
        let totalMarks = 0;
        let totalMaxMarks = 0;
        const subjectsMap = {};

        classSubjects.forEach(sub => {
          const markRecord = studentMarks.find(m => m.subjectId === sub.id);
          const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
          subjectsMap[sub.id] = obtained;
          
          totalMarks += obtained;
          totalMaxMarks += sub.maxMarks;
        });

        const percentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : 0;
        
        let grade = 'F';
        if (percentage >= 90) grade = 'A+';
        else if (percentage >= 80) grade = 'A';
        else if (percentage >= 70) grade = 'B';
        else if (percentage >= 60) grade = 'C';
        else if (percentage >= 50) grade = 'D';

        return {
          student,
          subjects: subjectsMap,
          totalMarks,
          totalMaxMarks,
          percentage: Number(percentage),
          grade
        };
      });

      results.sort((a, b) => b.percentage - a.percentage);

      const enrollment = exam.examType === 'INTERNAL_EXAM' 
        ? exam.enrollments.find(e => e.classId === cls.id)
        : null;
      const status = exam.examType === 'CLASS_EXAM' 
        ? (exam.status === 'Closed' ? 'Finalized' : 'Pending')
        : (enrollment ? enrollment.status : 'Pending');

      classResults.push({
        classId: cls.id,
        className: cls.name,
        studentCount: cls.students.length,
        status,
        subjects: classSubjects,
        results
      });
    });

    res.json({
      exam,
      classResults
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unlockExam = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({ where: { id }, include: { class: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'Draft') return res.status(400).json({ error: 'Cannot unlock a Draft exam.' });

    // Revert exam to Open and unlock
    await prisma.exam.update({
      where: { id },
      data: {
        status: 'Open',
        isLocked: false
      }
    });

    // Also change all Approved marks to SubmittedToClassTeacher so they can be reviewed again
    await prisma.mark.updateMany({
      where: { examId: id, status: 'Approved' },
      data: { status: 'SubmittedToClassTeacher' }
    });

    // Notify Class Teacher
    if (exam.class.classTeacherId) {
      await prisma.notification.create({
        data: {
          userId: exam.class.classTeacherId,
          message: `Admin has UNLOCKED the exam "${exam.name}". You can now revoke approvals and request changes again.`,
          type: 'Warning'
        }
      });
    }

    res.json({ message: 'Exam unlocked successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportExamResults = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        class: {
          include: { students: { orderBy: { rollNumber: 'asc' } } }
        },
        subjectConfigs: {
          include: { subject: true }
        }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const marks = await prisma.mark.findMany({
      where: { examId: id }
    });

    const classes = exam.examType === 'INTERNAL_EXAM' 
      ? exam.enrollments.map(e => e.class)
      : [exam.class];

    const rows = [];
    const isMultiClass = exam.examType === 'INTERNAL_EXAM';

    if (isMultiClass) {
      // First, create a Combined view for multi-class
      // We need to list all unique subjects across all classes
      const allSubjects = exam.subjectConfigs.map(c => ({
        id: c.subjectId,
        name: c.subject.name,
        maxMarks: c.maxMarks
      }));

      const header = ['Class', 'Roll No', 'Student Name'];
      allSubjects.forEach(s => header.push(`${s.name} (/${s.maxMarks})`));
      header.push('Total Marks', 'Max Marks', 'Percentage');
      rows.push(header.join(','));

      classes.forEach(cls => {
        if (!cls) return;
        cls.students.forEach(student => {
          const studentMarks = marks.filter(m => m.studentId === student.id);
          const row = [`"${cls.name}"`, student.rollNumber, `"${student.name}"`];
          
          let totalMarks = 0;
          let totalMaxMarks = 0;

          allSubjects.forEach(subject => {
            // Check if this subject belongs to this class
            const config = exam.subjectConfigs.find(c => c.subjectId === subject.id);
            if (config && config.subject.classId === cls.id) {
              const markRecord = studentMarks.find(m => m.subjectId === subject.id);
              const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
              row.push(obtained);
              totalMarks += obtained;
              totalMaxMarks += subject.maxMarks;
            } else {
              row.push('N/A');
            }
          });

          const percentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : 0;
          row.push(totalMarks, totalMaxMarks, `${percentage}%`);
          rows.push(row.join(','));
        });
      });
    } else {
      // Single class CSV
      const cls = classes[0];
      const subjects = exam.subjectConfigs.map(c => ({
        id: c.subjectId,
        name: c.subject.name,
        maxMarks: c.maxMarks
      }));

      const header = ['Roll No', 'Student Name'];
      subjects.forEach(s => header.push(`${s.name} (/${s.maxMarks})`));
      header.push('Total Marks', 'Max Marks', 'Percentage');
      rows.push(header.join(','));

      cls.students.forEach(student => {
        const studentMarks = marks.filter(m => m.studentId === student.id);
        const row = [student.rollNumber, `"${student.name}"`];
        
        let totalMarks = 0;
        let totalMaxMarks = 0;

        subjects.forEach(subject => {
          const markRecord = studentMarks.find(m => m.subjectId === subject.id);
          const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
          row.push(obtained);
          totalMarks += obtained;
          totalMaxMarks += subject.maxMarks;
        });

        const percentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(2) : 0;
        row.push(totalMarks, totalMaxMarks, `${percentage}%`);
        rows.push(row.join(','));
      });
    }

    const csvData = rows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.name}_Results.csv"`);
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportExamResultsExcel = async (req, res) => {
  const id = Number(req.params.id);
  const filterClassId = req.query.classId ? Number(req.query.classId) : null;
  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        class: { include: { students: { orderBy: { rollNumber: 'asc' } } } },
        enrollments: {
          include: { class: { include: { students: { orderBy: { rollNumber: 'asc' } } } } }
        },
        subjectConfigs: { include: { subject: true } }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    const marks = await prisma.mark.findMany({ where: { examId: id } });

    let allClasses = exam.examType === 'INTERNAL_EXAM'
      ? (exam.enrollments || []).map(e => e.class).filter(Boolean)
      : [exam.class].filter(Boolean);

    // Apply class filter if specified
    const classes = filterClassId
      ? allClasses.filter(c => c.id === filterClassId)
      : allClasses;

    const workbook = new ExcelJS.Workbook();
    const examNameSafe = exam.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
    const isMultiClass = exam.examType === 'INTERNAL_EXAM' && !filterClassId;

    const computeGrade = (pct) => {
      if (pct >= 90) return 'A+';
      if (pct >= 80) return 'A';
      if (pct >= 70) return 'B';
      if (pct >= 60) return 'C';
      if (pct >= 50) return 'D';
      return 'F';
    };

    if (isMultiClass) {
      const combinedSheet = workbook.addWorksheet('All Classes');
      const allSubjects = exam.subjectConfigs.map(c => ({
        id: c.subjectId,
        name: c.subject.name,
        maxMarks: c.maxMarks,
        classId: c.subject.classId
      }));

      const header = ['Class', 'Roll No', 'Student Name'];
      allSubjects.forEach(s => header.push(`${s.name} (/${s.maxMarks})`));
      header.push('Total Marks', 'Max Marks', 'Percentage', 'Grade');
      const headerRow = combinedSheet.addRow(header);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };

      classes.forEach(cls => {
        if (!cls) return;
        (cls.students || []).forEach(student => {
          const studentMarks = marks.filter(m => m.studentId === student.id);
          const row = [cls.name, student.rollNumber, student.name];
          
          let totalMarks = 0;
          let totalMaxMarks = 0;

          allSubjects.forEach(subject => {
            const config = exam.subjectConfigs.find(c => c.subjectId === subject.id);
            if (config && config.subject.classId === cls.id) {
              const markRecord = studentMarks.find(m => m.subjectId === subject.id);
              const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
              row.push(obtained);
              totalMarks += obtained;
              totalMaxMarks += subject.maxMarks;
            } else {
              row.push('N/A');
            }
          });

          const percentage = totalMaxMarks > 0 ? parseFloat(((totalMarks / totalMaxMarks) * 100).toFixed(2)) : 0;
          row.push(totalMarks, totalMaxMarks, percentage, computeGrade(percentage));
          combinedSheet.addRow(row);
        });
      });
    }

    // Add individual class sheets
    classes.forEach(cls => {
      if (!cls) return;
      const worksheet = workbook.addWorksheet(cls.name);
      
      const classSubjects = exam.subjectConfigs
        .filter(c => c.subject.classId === cls.id)
        .map(c => ({ id: c.subjectId, name: c.subject.name, maxMarks: c.maxMarks }));

      const header = ['Roll No', 'Student Name'];
      classSubjects.forEach(s => header.push(`${s.name} (/${s.maxMarks})`));
      header.push('Total Marks', 'Max Marks', 'Percentage', 'Grade');
      const headerRow = worksheet.addRow(header);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };

      (cls.students || []).forEach(student => {
        const studentMarks = marks.filter(m => m.studentId === student.id);
        const row = [student.rollNumber, student.name];
        
        let totalMarks = 0;
        let totalMaxMarks = 0;

        classSubjects.forEach(subject => {
          const markRecord = studentMarks.find(m => m.subjectId === subject.id);
          const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
          row.push(obtained);
          totalMarks += obtained;
          totalMaxMarks += subject.maxMarks;
        });

        const percentage = totalMaxMarks > 0 ? parseFloat(((totalMarks / totalMaxMarks) * 100).toFixed(2)) : 0;
        row.push(totalMarks, totalMaxMarks, percentage, computeGrade(percentage));
        worksheet.addRow(row);
      });

      // Auto-fit columns
      worksheet.columns.forEach(col => {
        col.width = Math.max(10, (col.header || '').length + 4);
      });
    });

    const filenameCls = filterClassId ? `Class_${filterClassId}_` : 'ALL_CLASSES_';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameCls}${examNameSafe}_Results.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.exportExamResultsWord = async (req, res) => {
  const id = Number(req.params.id);
  const filterClassId = req.query.classId ? Number(req.query.classId) : null;
  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        class: { include: { students: { orderBy: { rollNumber: 'asc' } } } },
        enrollments: {
          include: { class: { include: { students: { orderBy: { rollNumber: 'asc' } } } } }
        },
        subjectConfigs: { include: { subject: true } }
      }
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    const marks = await prisma.mark.findMany({ where: { examId: id } });

    let allClasses = exam.examType === 'INTERNAL_EXAM'
      ? (exam.enrollments || []).map(e => e.class).filter(Boolean)
      : [exam.class].filter(Boolean);

    const classes = filterClassId
      ? allClasses.filter(c => c && c.id === filterClassId)
      : allClasses;

    const computeGrade = (pct) => {
      if (pct >= 90) return 'A+';
      if (pct >= 80) return 'A';
      if (pct >= 70) return 'B';
      if (pct >= 60) return 'C';
      if (pct >= 50) return 'D';
      return 'F';
    };

    const schoolHeader = `
      <div class="school-header">
        <h1>Matha English Medium School</h1>
        <h2>${exam.name} Results</h2>
        <p>Academic Year 2026-27</p>
      </div>`;

    // Generate HTML for Word
    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>`;
    html += `<head><meta charset='utf-8'><title>${exam.name} Results</title>`;
    html += `<style>
      body { font-family: Arial, sans-serif; font-size: 9pt; }
      h1 { font-size: 14pt; text-align: center; margin-bottom: 2px; }
      h2 { font-size: 12pt; text-align: center; margin-bottom: 2px; color: #333; }
      h3 { font-size: 11pt; margin-top: 16px; margin-bottom: 6px; }
      p { text-align: center; font-size: 9pt; color: #555; margin: 2px 0; }
      table { border-collapse: collapse; width: 100%; font-size: 8pt; }
      th { background-color: #1E3A8A; color: white; padding: 4px 5px; text-align: center; border: 1px solid #999; }
      td { padding: 3px 5px; border: 1px solid #ccc; text-align: center; }
      .name-col { text-align: left !important; }
      .school-header { text-align: center; margin-bottom: 12px; }
    </style>`;
    html += `</head><body>`;
    html += schoolHeader;

    classes.forEach((cls, index) => {
      if (!cls) return;

      if (index > 0) {
        html += `<div style="page-break-before: always;"></div>`;
        html += schoolHeader;
      }

      const classSubjects = exam.subjectConfigs
        .filter(c => c.subject.classId === cls.id)
        .map(c => ({ id: c.subjectId, name: c.subject.name, maxMarks: c.maxMarks }));

      const students = cls.students || [];

      html += `<h3>${cls.name} &mdash; ${students.length} Students</h3>`;
      html += `<table>`;

      // Header row
      html += `<tr><th>Roll No</th><th>Student Name</th>`;
      classSubjects.forEach(s => { html += `<th>${s.name}<br>/${s.maxMarks}</th>`; });
      html += `<th>Total</th><th>%</th><th>Grade</th></tr>`;

      // Data rows
      students.forEach(student => {
        const studentMarks = marks.filter(m => m.studentId === student.id);
        html += `<tr><td>${student.rollNumber}</td><td class="name-col">${student.name}</td>`;

        let totalMarks = 0;
        let totalMaxMarks = 0;

        classSubjects.forEach(subject => {
          const markRecord = studentMarks.find(m => m.subjectId === subject.id);
          const obtained = markRecord && markRecord.marksObtained !== null ? markRecord.marksObtained : 0;
          html += `<td>${obtained}</td>`;
          totalMarks += obtained;
          totalMaxMarks += subject.maxMarks;
        });

        const percentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : '0.0';
        const grade = computeGrade(Number(percentage));
        html += `<td><strong>${totalMarks}/${totalMaxMarks}</strong></td><td>${percentage}%</td><td>${grade}</td></tr>`;
      });
      html += `</table>`;
    });

    html += `</body></html>`;

    const filenameCls = filterClassId ? `Class_${filterClassId}_` : 'ALL_CLASSES_';
    const examNameSafe = exam.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameCls}${examNameSafe}_Results.doc"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.publishPublicResults = async (req, res) => {
  const examId = Number(req.params.id);
  
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Unpublish any other exam
    await prisma.exam.updateMany({
      where: { isPublished: true },
      data: { isPublished: false, publishedAt: null }
    });

    // Publish this one
    await prisma.exam.update({
      where: { id: examId },
      data: { isPublished: true, publishedAt: new Date() }
    });

    // Notify all teachers
    const teachers = await prisma.user.findMany({
      where: { roles: { hasSome: ['ClassTeacher', 'SubjectTeacher'] } }
    });

    if (teachers.length > 0) {
      await prisma.notification.createMany({
        data: teachers.map(t => ({
          userId: t.id,
          message: `Results for ${exam.name} have been published and are now visible to parents`,
          type: 'Info'
        }))
      });
    }

    res.json({ message: 'Results published successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.unpublishPublicResults = async (req, res) => {
  const examId = Number(req.params.id);
  try {
    await prisma.exam.update({
      where: { id: examId },
      data: { isPublished: false, publishedAt: null }
    });
    res.json({ message: 'Results unpublished successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
