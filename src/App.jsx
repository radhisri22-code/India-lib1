import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/shared/Toast';
import Header from './components/shared/Header';
import Login from './pages/auth/Login';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherCourseManage from './pages/teacher/TeacherCourseManage';
import CreateCourse from './pages/teacher/CreateCourse';
import StudentDashboard from './pages/student/StudentDashboard';
import CourseBrowser from './pages/student/CourseBrowser';
import CourseDetail from './pages/CourseDetail';
import LiveClassroom from './pages/teacher/LiveClassroom';
import SetupCheck from './pages/SetupCheck';
import AdminSetup from './pages/admin/AdminSetup';
import LiveNotification from './components/shared/LiveNotification';
import { db } from './firebase/config';
import {
  FiBook, FiVideo, FiClock, FiUsers, FiPlay, FiMonitor
} from 'react-icons/fi';
import './index.css';

// ─── Route Guards ──────────────────────────────────────────────────────────────

const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" replace />;
};

const TeacherRoute = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userProfile && userProfile.role !== 'teacher') return <Navigate to="/student" replace />;
  return children;
};

const StudentRoute = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userProfile && userProfile.role !== 'student') return <Navigate to="/teacher" replace />;
  return children;
};

const PublicOnlyRoute = ({ children }) => {
  const { currentUser, userProfile } = useAuth();
  if (currentUser) {
    return <Navigate to={userProfile?.role === 'teacher' ? '/teacher' : '/student'} replace />;
  }
  return children;
};

const RootRedirect = () => {
  const { currentUser, userProfile } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={userProfile?.role === 'teacher' ? '/teacher' : '/student'} replace />;
};

// ─── Teacher Courses Page ──────────────────────────────────────────────────────

const TeacherCoursesPage = () => {
  const { currentUser } = useAuth();
  const [courses, setCourses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchCourses = async () => {
      try {
        const q = query(
          collection(db, 'courses'),
          where('teacherId', '==', currentUser.uid)
        );
        const snap = await getDocs(q);
        setCourses(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [currentUser]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gray-900)' }}>My Courses</h1>
        <Link to="/teacher/courses/new" className="btn btn-primary">+ New Course</Link>
      </div>
      {loading ? (
        <div className="loading-state"><div className="spinner spinner-lg" /></div>
      ) : courses.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📚</div>
          <h3>No courses yet</h3>
          <p>Create your first course to start teaching</p>
          <Link to="/teacher/courses/new" className="btn btn-primary">Create Course</Link>
        </div>
      ) : (
        <div className="grid grid-3" style={{ gap: '1.25rem' }}>
          {courses.map(c => (
            <Link
              key={c.id}
              to={`/teacher/courses/${c.id}`}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit', padding: '1.25rem' }}
            >
              {c.thumbnail && (
                <img src={c.thumbnail} alt={c.title}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, marginBottom: '1rem' }} />
              )}
              <h3 style={{ fontWeight: 700, marginBottom: '0.375rem', color: 'var(--gray-900)' }}>{c.title}</h3>
              <p className="text-muted text-sm" style={{ marginBottom: '0.75rem' }}>
                {c.enrolledCount || 0} students · {c.contentCount || 0} lessons
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className={`badge ${c.isPublished ? 'badge-success' : 'badge-warning'}`}>
                  {c.isPublished ? 'Published' : 'Draft'}
                </span>
                <span className="badge badge-primary">{c.category}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Enrolled Courses Page ─────────────────────────────────────────────────────

const EnrolledCoursesPage = () => {
  const { currentUser, userProfile } = useAuth();
  const [courses, setCourses] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchEnrolled = async () => {
      if (!userProfile?.enrolledCourses?.length) { setLoading(false); return; }
      try {
        const list = [];
        for (const id of userProfile.enrolledCourses) {
          const snap = await getDoc(doc(db, 'courses', id));
          if (snap.exists()) list.push({ id: snap.id, ...snap.data() });
        }
        setCourses(list);
      } finally {
        setLoading(false);
      }
    };
    fetchEnrolled();
  }, [userProfile]);

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div className="flex justify-between items-center" style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gray-900)' }}>My Enrolled Courses</h1>
        <Link to="/student/courses" className="btn btn-primary">Browse More</Link>
      </div>
      {loading ? (
        <div className="loading-state"><div className="spinner spinner-lg" /></div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎓</div>
          <h3 style={{ marginBottom: '0.5rem', color: 'var(--gray-900)' }}>No enrolled courses yet</h3>
          <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Explore courses and enroll to start learning</p>
          <Link to="/student/courses" className="btn btn-primary">Browse Courses</Link>
        </div>
      ) : (
        <div className="grid grid-3" style={{ gap: '1.25rem' }}>
          {courses.map(c => (
            <Link key={c.id} to={`/student/courses/${c.id}`} className="card"
              style={{ textDecoration: 'none', color: 'inherit', padding: '0', overflow: 'hidden' }}>
              {c.thumbnail
                ? <img src={c.thumbnail} alt={c.title} style={{ width: '100%', height: 150, objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: 150, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: 'white', fontWeight: 800 }}>
                    {c.title?.[0]}
                  </div>}
              <div style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <span className="badge badge-primary text-xs">{c.category}</span>
                  <span className="badge badge-success text-xs">Enrolled</span>
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.375rem', color: 'var(--gray-900)' }}>{c.title}</h3>
                <p className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>by {c.teacherName}</p>
                <div style={{ display: 'flex', gap: '0.875rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                  <span><FiVideo size={12} /> {c.contentCount || 0} lessons</span>
                  <span><FiClock size={12} /> {c.duration || 'N/A'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Not Found ─────────────────────────────────────────────────────────────────

const NotFound = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '70vh', gap: '1rem', textAlign: 'center', padding: '2rem'
  }}>
    <div style={{ fontSize: '5rem' }}>🔍</div>
    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--gray-900)' }}>Page Not Found</h1>
    <p className="text-muted">The page you're looking for doesn't exist.</p>
    <Link to="/" className="btn btn-primary">Go Home</Link>
  </div>
);

// ─── App Routes ────────────────────────────────────────────────────────────────

const AppRoutes = () => {
  const location = useLocation();
  // Hide header when inside an active live room (has both courseId AND sessionId)
  const isLivePage = /^\/(teacher\/)?live\/[^/]+\/[^/]+/.test(location.pathname);

  return (
    <>
      {!isLivePage && <Header />}
      <LiveNotification />
      <Routes>
        {/* Root */}
        <Route path="/" element={<RootRedirect />} />

        {/* Auth - Google login only, /register redirects to /login */}
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* Teacher */}
        <Route path="/teacher" element={<TeacherRoute><TeacherDashboard /></TeacherRoute>} />
        <Route path="/teacher/courses" element={<TeacherRoute><TeacherCoursesPage /></TeacherRoute>} />
        <Route path="/teacher/courses/new" element={<TeacherRoute><CreateCourse /></TeacherRoute>} />
        <Route path="/teacher/courses/:courseId" element={<TeacherRoute><TeacherCourseManage /></TeacherRoute>} />
        <Route path="/teacher/live" element={<TeacherRoute><LiveClassroom isTeacher={true} /></TeacherRoute>} />
        <Route path="/teacher/live/:courseId" element={<TeacherRoute><LiveClassroom isTeacher={true} /></TeacherRoute>} />
        {/* Teacher live room — always has isTeacher=true so controls always show */}
        <Route path="/teacher/live/:courseId/:sessionId" element={<TeacherRoute><LiveClassroom isTeacher={true} /></TeacherRoute>} />

        {/* Student */}
        <Route path="/student" element={<StudentRoute><StudentDashboard /></StudentRoute>} />
        <Route path="/student/courses" element={<StudentRoute><CourseBrowser /></StudentRoute>} />
        <Route path="/student/courses/:courseId" element={<StudentRoute><CourseDetail /></StudentRoute>} />
        <Route path="/student/enrolled" element={<StudentRoute><EnrolledCoursesPage /></StudentRoute>} />

        {/* Live Class - full screen, no header */}
        <Route path="/live/:courseId/:sessionId" element={<PrivateRoute><LiveClassroom /></PrivateRoute>} />

        {/* Setup Check */}
        <Route path="/setup-check" element={<SetupCheck />} />

        {/* Admin */}
        <Route path="/admin/setup" element={<AdminSetup />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

// ─── App ───────────────────────────────────────────────────────────────────────

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
