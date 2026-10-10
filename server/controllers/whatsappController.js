/**
 * whatsappController.js — send exam results to parents on WhatsApp (Admin only).
 * Messages are queued, then sent one by one in the background so the request
 * returns immediately; the admin watches progress via /status.
 */

const { PrismaClient } = require('@prisma/client');
const { buildClassReport, marksLine } = require('../lib/reportData');
const wa = require('../lib/whatsapp');
const prisma = new PrismaClient();

const SEND_GAP_MS = 400; // gentle pace for the provider
// A message still "queued" after this long was interrupted (e.g. server restart) and may be sent again.
const STALE_QUEUED_MS = 10 * 60 * 1000;

/** Latest message per student for one exam. */
async function latestByStudent(examId, studentIds) {
  const rows = await prisma.whatsAppMessage.findMany({
    where: { examId, studentId: { in: studentIds } },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map();
  for (const r of rows) if (!latest.has(r.studentId)) latest.set(r.studentId, r);
  return latest;
}

// ── GET /api/admin/whatsapp/status?examId=&classId= ──
exports.getStatus = async (req, res) => {
  const examId = Number(req.query.examId);
  const classId = Number(req.query.classId);
  try {
    const students = await prisma.student.findMany({ where: { classId }, select: { id: true } });
    const latest = await latestByStudent(examId, students.map((s) => s.id));
    res.json({
      configured: wa.isConfigured(),
      messages: Object.fromEntries([...latest].map(([id, r]) => [id, {
        status: r.status, error: r.error, phone: r.phone, updatedAt: r.updatedAt,
      }])),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/whatsapp/send  { examId, classId, studentIds?, resend? } ──
exports.send = async (req, res) => {
  const examId = Number(req.body.examId);
  const classId = Number(req.body.classId);
  const only = Array.isArray(req.body.studentIds) ? new Set(req.body.studentIds.map(Number)) : null;
  const resend = !!req.body.resend;

  if (!wa.isConfigured()) {
    return res.status(503).json({ error: 'WhatsApp is not set up yet. Add RICHAUTOMATE_API_KEY in Render → Environment.' });
  }

  try {
    const report = await buildClassReport(prisma, examId, classId);
    if (!report) return res.status(404).json({ error: 'This class is not part of that exam.' });

    const targets = report.results.filter((r) => !only || only.has(r.student.id));
    const latest = await latestByStudent(examId, targets.map((r) => r.student.id));

    const skipped = [];
    const queued = [];
    for (const r of targets) {
      const prev = latest.get(r.student.id);
      const phone = wa.normalizePhone(r.student.parentPhone);
      let reason = null;
      if (!r.student.parentPhone) reason = 'No parent number';
      else if (!phone) reason = 'Invalid parent number';
      else if (!r.complete) reason = 'Marks not complete';
      else if (prev?.status === 'queued' && Date.now() - new Date(prev.updatedAt) < STALE_QUEUED_MS) reason = 'Already sending';
      else if (!resend && prev && wa.SENT_STATUSES.includes(prev.status)) reason = 'Already sent';
      if (reason) { skipped.push({ studentId: r.student.id, name: r.student.name, reason }); continue; }

      const row = await prisma.whatsAppMessage.create({
        data: { examId, studentId: r.student.id, phone, status: 'queued', sentById: req.user.userId },
      });
      queued.push({ row, result: r });
    }

    res.json({ queued: queued.length, skipped });

    // Send in the background, one at a time.
    (async () => {
      for (const { row, result } of queued) {
        const variables = [
          result.student.name,
          report.class.name,
          result.student.rollNumber,
          report.exam.name,
          marksLine(report, result),
          `${result.total}/${result.maxTotal}`,
          `${result.percentage}%`,
          result.grade,
        ];
        try {
          const providerMessageId = await wa.sendResultTemplate(row.phone, variables);
          await prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status: 'sent', providerMessageId } });
        } catch (e) {
          await prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status: 'failed', error: e.message.slice(0, 500) } });
        }
        await new Promise((r) => setTimeout(r, SEND_GAP_MS));
      }
    })().catch((e) => console.error('[whatsapp] send loop', e));
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};

// ── POST /api/admin/whatsapp/refresh  { examId, classId } — ask the provider for delivery updates ──
exports.refresh = async (req, res) => {
  const examId = Number(req.body.examId);
  const classId = Number(req.body.classId);
  if (!wa.isConfigured()) return res.json({ updated: 0 });
  try {
    const rows = await prisma.whatsAppMessage.findMany({
      where: { examId, student: { classId }, status: { in: ['sent', 'delivered'] }, providerMessageId: { not: null } },
      take: 100,
    });
    let updated = 0;
    for (const row of rows) {
      try {
        const { status, error } = await wa.fetchStatus(row.providerMessageId);
        if (status && status !== row.status && ['queued', 'sent', 'delivered', 'read', 'failed'].includes(status)) {
          await prisma.whatsAppMessage.update({ where: { id: row.id }, data: { status, error } });
          updated++;
        }
      } catch { /* leave as is; try again next refresh */ }
    }
    res.json({ updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
