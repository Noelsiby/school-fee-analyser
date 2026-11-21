import MyStudentsList from './MyStudentsList';
import '../admin/admin.css';

/** Menu → 👦 My class: every student, with search; click a name for the profile and reports. */
export default function MyClassPage() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">👦 My class</h1>
          <p className="page-sub">Click a student to see their profile, marks, attendance and report cards, or to edit their details and photo.</p>
        </div>
      </div>
      <MyStudentsList alwaysOpen />
    </div>
  );
}
