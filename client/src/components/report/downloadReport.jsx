/**
 * Build progress-report PDFs in the browser, then download or print them.
 * The PDF library is loaded only when a report is made.
 */

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');

/** Paper choices for the report screens (keys match PAPER_SIZES in ReportDocument). */
export const PAPER_OPTIONS = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
  { value: 'A5', label: 'A5' },
  { value: 'LETTER', label: 'Letter' },
  { value: 'LEGAL', label: 'Legal' },
];

async function buildPdf(apiCall, { examId, classId, studentId, paper = 'A4' }) {
  const query = new URLSearchParams({ photos: '1', ...(studentId ? { studentId } : {}) });
  const [report, { pdf }, { default: ReportDocument }] = await Promise.all([
    apiCall(`/api/students/reports/exams/${examId}/classes/${classId}?${query}`),
    import('@react-pdf/renderer'),
    import('./ReportDocument'),
  ]);
  if (!report.results.length) throw new Error('No students found for this report.');

  const blob = await pdf(<ReportDocument report={report} paper={paper} />).toBlob();
  const who = studentId ? safe(report.results[0].student.name) : `${safe(report.class.name)}_all_students`;
  const size = paper === 'A4' ? '' : `_${paper}`;
  return { blob, report, fileName: `${who}_${safe(report.exam.name)}_Progress_Report${size}.pdf` };
}

/**
 * Download reports for a class or one student.
 * @param apiCall  useApi().apiCall
 * @param {{ examId, classId, studentId?, paper? }} what  paper: A4 (default), A3, A5, LETTER, LEGAL
 * @returns the number of pages (students) in the PDF
 */
export async function downloadReports(apiCall, what) {
  const { blob, report, fileName } = await buildPdf(apiCall, what);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return report.results.length;
}

/**
 * Open the browser's print dialog for the reports (same arguments as downloadReports).
 * Choose the same paper size in the print dialog, with scale "Actual size" / 100%.
 */
export async function printReports(apiCall, what) {
  const { blob, report } = await buildPdf(apiCall, what);
  const url = URL.createObjectURL(blob);
  const frame = Object.assign(document.createElement('iframe'), { src: url, title: 'Print progress report' });
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  const cleanup = () => { frame.remove(); URL.revokeObjectURL(url); };
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(url, '_blank'); // the browser can't print from a frame: open the PDF so it can be printed from there
    }
    setTimeout(cleanup, 60000);
  };
  document.body.appendChild(frame);
  return report.results.length;
}
