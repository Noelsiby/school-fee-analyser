import MyDay from '../../components/timetable/MyDay';
import '../admin/admin.css';

/** Menu → 🗓️ My timetable (class and subject teachers): today's periods and the whole week. */
export default function MyTimetablePage({ attendancePath }) {
  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🗓️ My timetable</h1>
          <p className="page-sub">Your periods today and this week, including substitutions.</p>
        </div>
      </div>
      <MyDay attendancePath={attendancePath} defaultWeek />
    </div>
  );
}
