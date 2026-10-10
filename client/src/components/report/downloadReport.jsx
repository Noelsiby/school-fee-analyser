/**
 * Build progress-report PDFs in the browser and download them.
 * The PDF library is loaded only when a report is downloaded.
 */

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');

/**
 * Download reports for a class or one student.
 * @param apiCall  useApi().apiCall
 * @param {{ examId, classId, studentId? }} what
 * @returns the number of pages (students) in the PDF
 */
export async function downloadReports(apiCall, { examId, classId, studentId }) {
  const query = new URLSearchParams({ photos: '1', ...(studentId ? { studentId } : {}) });
  const [report, { pdf }, { default: ReportDocument }] = await Promise.all([
    apiCall(`/api/students/reports/exams/${examId}/classes/${classId}?${query}`),
    import('@react-pdf/renderer'),
    import('./ReportDocument'),
  ]);
  if (!report.results.length) throw new Error('No students found for this report.');

  const blob = await pdf(<ReportDocument report={report} />).toBlob();
  const who = studentId ? safe(report.results[0].student.name) : `${safe(report.class.name)}_all_students`;
  const fileName = `${who}_${safe(report.exam.name)}_Progress_Report.pdf`;

  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return report.results.length;
}
