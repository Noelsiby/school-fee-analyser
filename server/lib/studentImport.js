/**
 * studentImport.js — read the students CSV (with optional profile columns).
 *
 * Header names are matched loosely ("Father Name", "father_name", "fatherName" all work).
 * Required: name, roll number. Everything else optional:
 *   father/guardian name, section, admission no, admission date, date of birth (dd-mm-yyyy
 *   or yyyy-mm-dd), blood group, identification mark 1/2 (or "moles 1/2"), address,
 *   aadhaar no, apaar no, residence phone, parent phone / cell / whatsapp.
 */

const { normalizePhone } = require('./whatsapp');

/** RFC-4180-style CSV parse: handles quoted fields with commas, quotes ("") and newlines. */
function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, ''); // Excel's BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

// normalised header → student field
const HEADER_MAP = {
  name: 'name', studentname: 'name',
  rollnumber: 'rollNumber', rollno: 'rollNumber', roll: 'rollNumber',
  fathername: 'fatherName', guardianname: 'fatherName', fatherguardianname: 'fatherName', parentname: 'fatherName',
  section: 'section',
  admissionno: 'admissionNo', admissionnumber: 'admissionNo', admnno: 'admissionNo',
  admissiondate: 'admissionDate', admndate: 'admissionDate',
  dateofbirth: 'dateOfBirth', dob: 'dateOfBirth', birthdate: 'dateOfBirth',
  bloodgroup: 'bloodGroup',
  identificationmark1: 'idMark1', idmark1: 'idMark1', moles1: 'idMark1', mole1: 'idMark1',
  identificationmark2: 'idMark2', idmark2: 'idMark2', moles2: 'idMark2', mole2: 'idMark2',
  address: 'address',
  aadhaarno: 'aadhaarNo', aadharno: 'aadhaarNo', aadhaar: 'aadhaarNo', aadhar: 'aadhaarNo',
  apaarno: 'apaarNo', apaar: 'apaarNo',
  phoneres: 'phoneRes', residencephone: 'phoneRes', resphone: 'phoneRes', landline: 'phoneRes',
  parentphone: 'parentPhone', cell: 'parentPhone', mobile: 'parentPhone', whatsapp: 'parentPhone', phonecell: 'parentPhone', phone: 'parentPhone',
};
const fieldFor = (header) => HEADER_MAP[header.toLowerCase().replace(/[^a-z0-9]/g, '')] || null;

/** "15-06-2015", "15/06/2015" or "2015-06-15" → Date (UTC midnight), else undefined. */
function parseDate(v) {
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return undefined;
}

/**
 * Turn CSV text into { rows: [{ line, data, warnings }] } where data holds Student fields.
 * Throws if the file has no name / roll number columns.
 */
function readStudentsCSV(text) {
  const [header, ...body] = parseCSVRows(text);
  if (!header) throw new Error('CSV is empty.');
  const fields = header.map(fieldFor);
  if (!fields.includes('name') || !fields.includes('rollNumber')) {
    throw new Error('CSV needs "name" and "rollNumber" columns.');
  }
  return body.map((cells, i) => {
    const data = {};
    const warnings = [];
    fields.forEach((f, col) => {
      const v = (cells[col] ?? '').trim();
      if (!f || !v) return;
      if (f === 'admissionDate' || f === 'dateOfBirth') {
        const d = parseDate(v);
        if (d) data[f] = d; else warnings.push(`unreadable date "${v}"`);
      } else if (f === 'parentPhone') {
        const p = normalizePhone(v);
        if (p) data[f] = p.slice(2); else warnings.push(`invalid parent phone "${v}"`);
      } else {
        data[f] = v.slice(0, 500);
      }
    });
    return { line: i + 2, data, warnings };
  });
}

/**
 * Import a students CSV into one class. New roll numbers are created; existing roll
 * numbers get their name/profile updated with the non-empty cells (nothing is cleared).
 */
async function importStudentsCSV(prisma, classId, text) {
  const rows = readStudentsCSV(text);
  if (!rows.length) throw new Error('CSV has no data rows.');
  const existing = await prisma.student.findMany({ where: { classId }, select: { id: true, rollNumber: true } });
  const byRoll = new Map(existing.map((s) => [s.rollNumber.trim().toLowerCase(), s.id]));

  const result = { created: 0, updated: 0, skipped: 0, errors: [], warnings: [] };
  for (const { line, data, warnings } of rows) {
    warnings.forEach((w) => result.warnings.push({ line, message: w }));
    if (!data.name || !data.rollNumber) {
      result.skipped++;
      result.errors.push({ line, reason: 'Missing name or roll number' });
      continue;
    }
    const id = byRoll.get(data.rollNumber.toLowerCase());
    try {
      if (id) {
        await prisma.student.update({ where: { id }, data });
        result.updated++;
      } else {
        const created = await prisma.student.create({ data: { ...data, classId } });
        byRoll.set(data.rollNumber.toLowerCase(), created.id);
        result.created++;
      }
    } catch (e) {
      result.skipped++;
      result.errors.push({ line, reason: e.message.slice(0, 200) });
    }
  }
  return result;
}

module.exports = { parseCSVRows, readStudentsCSV, importStudentsCSV };
