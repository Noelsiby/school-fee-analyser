// School details printed on progress reports.
export const SCHOOL = {
  name: 'Matha English Medium School',
  place: 'Kaikalur, Andhra Pradesh',
  address: 'Bypass Road, Kaikalur, Eluru District, Andhra Pradesh – 521333',
  phones: ['94413 05445', '81436 07640'],
  academicYear: '2026-27',
};

/** "2015-06-15T00:00:00.000Z" → "15-06-2015" (blank if missing). */
export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

/** Whole years between a date of birth and today (blank if missing). */
export function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return '';
  const dob = new Date(dateOfBirth);
  if (isNaN(dob)) return '';
  const now = new Date();
  let age = now.getFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getMonth() < dob.getUTCMonth()
    || (now.getMonth() === dob.getUTCMonth() && now.getDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age >= 0 ? `${age} yrs` : '';
}
