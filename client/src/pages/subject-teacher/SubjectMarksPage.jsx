import SubjectMarksList from './SubjectMarksList';
import '../admin/admin.css';

/** Menu → ✍️ Enter marks */
export default function SubjectMarksPage() {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">✍️ Enter marks</h1>
          <p className="page-sub">Click a subject to enter its marks. Marks save by themselves; submit to the class teacher when everyone is done.</p>
        </div>
      </div>
      <SubjectMarksList />
    </div>
  );
}
