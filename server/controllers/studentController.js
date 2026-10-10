/**
 * studentController.js — student profiles ("Bio Data"), photos and progress reports.
 * Used by the Admin (any class) and by a Class Teacher (their own class only).
 */

const { PrismaClient } = require('@prisma/client');
const { buildClassReport, PROFILE_FIELDS } = require('../lib/reportData');
const { normalizePhone } = require('../lib/whatsapp');
const { importStudentsCSV } = require('../lib/studentImport');
const { byRoll } = require('../lib/rollOrder');
const prisma = new PrismaClient();

const isAdmin = (user) => (user.roles || []).includes('Admin');

/** Admin: any class. Class Teacher: only the class they manage. */
async function canAccessClass(user, classId) {
  if (isAdmin(user)) return true;
  if (!(user.roles || []).includes('ClassTeacher')) return false;
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { classTeacherId: true } });
  return cls?.classTeacherId === user.userId;
}

/** Load a student and check the caller may see them. Sends the error response itself. */
async function loadStudent(req, res) {
  const id = Number(req.params.id);
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      class: { select: { id: true, name: true, classTeacher: { select: { id: true, name: true } } } },
      photo: { select: { updatedAt: true } },
    },
  });
  if (!student) { res.status(404).json({ error: 'Student not found.' }); return null; }
  if (!(await canAccessClass(req.user, student.classId))) {
    res.status(403).json({ error: 'You can only view students of your own class.' });
    return null;
  }
  return student;
}

const toPublic = (s) => {
  const { photo, ...rest } = s;
  return { ...rest, hasPhoto: !!photo, photoUpdatedAt: photo?.updatedAt || null };
};

// ── GET /api/students/class/:classId — the class list (alphabetical) ──
exports.getClassStudents = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true } });
    if (!cls) return res.status(404).json({ error: 'Class not found.' });
    const students = await prisma.student.findMany({
      where: { classId },
      include: { photo: { select: { updatedAt: true } } },
    });
    res.json({ class: cls, students: students.sort(byRoll).map(toPublic) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/students/:id — profile + a summary of every exam's result ──
exports.getStudent = async (req, res) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;

    const exams = await prisma.exam.findMany({
      where: {
        status: { in: ['Open', 'Closed'] },
        OR: [{ classId: student.classId }, { enrollments: { some: { classId: student.classId } } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const reports = [];
    for (const exam of exams) {
      const report = await buildClassReport(prisma, exam.id, student.classId, { studentId: student.id });
      const r = report?.results[0];
      if (!report || !r) continue;
      reports.push({
        exam: report.exam,
        subjects: report.subjects,
        highestGpa: report.highestGpa,
        result: r,
      });
    }

    res.json({ student: toPublic(student), reports, canEditName: isAdmin(req.user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/students/:id/profile ──
exports.updateProfile = async (req, res) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;

    const data = {};
    for (const f of PROFILE_FIELDS) {
      if (!(f in req.body)) continue;
      const raw = req.body[f];
      const val = typeof raw === 'string' ? raw.trim() : raw;
      if (f === 'admissionDate' || f === 'dateOfBirth') {
        if (!val) { data[f] = null; continue; }
        const d = new Date(`${String(val).slice(0, 10)}T00:00:00.000Z`);
        if (isNaN(d)) return res.status(400).json({ error: `${f === 'dateOfBirth' ? 'Date of birth' : 'Admission date'} is not a valid date.` });
        data[f] = d;
      } else if (f === 'parentPhone') {
        if (!val) { data[f] = null; continue; }
        const phone = normalizePhone(val);
        if (!phone) return res.status(400).json({ error: 'Parent cell number must be a valid 10-digit Indian mobile number.' });
        data[f] = phone.slice(2); // stored as 10 digits
      } else {
        data[f] = val ? String(val).slice(0, 500) : null;
      }
    }
    // Name and roll number: Admin only (they identify the student everywhere).
    if (isAdmin(req.user)) {
      if (typeof req.body.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();
      if (typeof req.body.rollNumber === 'string' && req.body.rollNumber.trim()) data.rollNumber = req.body.rollNumber.trim();
    }

    const updated = await prisma.student.update({
      where: { id: student.id },
      data,
      include: {
        class: { select: { id: true, name: true, classTeacher: { select: { id: true, name: true } } } },
        photo: { select: { updatedAt: true } },
      },
    });
    res.json({ student: toPublic(updated) });
  } catch (err) {
    if (err?.code === 'P2002') return res.status(409).json({ error: 'Another student in this class already has that roll number.' });
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/students/:id/photo ──
exports.getPhoto = async (req, res) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    const photo = await prisma.studentPhoto.findUnique({ where: { studentId: student.id } });
    if (!photo) return res.status(404).json({ error: 'No photo.' });
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(photo.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/students/:id/photo (multipart "photo") ──
exports.uploadPhoto = async (req, res) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    if (!req.file) return res.status(400).json({ error: 'Choose a photo to upload.' });
    await prisma.studentPhoto.upsert({
      where: { studentId: student.id },
      update: { data: req.file.buffer, mimeType: req.file.mimetype },
      create: { studentId: student.id, data: req.file.buffer, mimeType: req.file.mimetype },
    });
    res.json({ message: 'Photo saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/students/:id/photo ──
exports.deletePhoto = async (req, res) => {
  try {
    const student = await loadStudent(req, res);
    if (!student) return;
    await prisma.studentPhoto.deleteMany({ where: { studentId: student.id } });
    res.json({ message: 'Photo removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/students/class/:classId/exams — exams this class is in (for the report picker) ──
exports.getClassExams = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const exams = await prisma.exam.findMany({
      where: {
        status: { in: ['Open', 'Closed'] },
        OR: [{ classId }, { enrollments: { some: { classId } } }],
      },
      select: { id: true, name: true, status: true, isPublished: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/students/reports/exams/:examId/classes/:classId[?studentId=&photos=1] ──
exports.getReport = async (req, res) => {
  const examId = Number(req.params.examId);
  const classId = Number(req.params.classId);
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    const report = await buildClassReport(prisma, examId, classId, {
      studentId: req.query.studentId ? Number(req.query.studentId) : undefined,
      withPhotos: req.query.photos === '1',
    });
    if (!report) return res.status(404).json({ error: 'This class is not part of that exam.' });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/students/class/:classId/import (multipart "csv") — add / update students ──
exports.importCSV = async (req, res) => {
  const classId = Number(req.params.classId);
  try {
    if (!(await canAccessClass(req.user, classId))) return res.status(403).json({ error: 'Not your class.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
    const results = await importStudentsCSV(prisma, classId, req.file.buffer.toString('utf8'));
    res.json({
      message: `Import complete: ${results.created} added, ${results.updated} updated, ${results.skipped} skipped.`,
      ...results,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.canAccessClass = canAccessClass;
