import ClassExamsList from './ClassExamsList';
import '../admin/admin.css';

/** Menu → 📝 Exams & marks */
export default function ClassExamsPage() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📝 Exams & marks</h1>
          <p className="page-sub">Check the marks each subject teacher submits, approve them, then finalize. Report-card attendance is here too.</p>
        </div>
      </div>
      <ClassExamsList />
    </div>
  );
}
