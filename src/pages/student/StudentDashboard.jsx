import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { onValue, ref as dbRef } from 'firebase/database';
import { FiBook, FiVideo, FiPlay, FiClock, FiStar, FiTrendingUp, FiSearch } from 'react-icons/fi';
import { db, rtdb } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import './StudentDashboard.css';

const StudentDashboard = () => {
  const { currentUser, userProfile } = useAuth();
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    watchLiveSessions();
  }, [currentUser]);

  const fetchData = async () => {
    if (!userProfile?.enrolledCourses?.length) { setLoading(false); return; }
    try {
      const courses = [];
      for (const courseId of userProfile.enrolledCourses) {
        const snap = await getDoc(doc(db, 'courses', courseId));
        if (snap.exists()) courses.push({ id: snap.id, ...snap.data() });
      }
      setEnrolledCourses(courses);
    } catch (err) {
      console.error('Error fetching enrolled courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const watchLiveSessions = () => {
    // Watch all live sessions
    onValue(dbRef(rtdb, 'liveSessions'), snap => {
      const data = snap.val();
      if (!data) { setLiveSessions([]); return; }
      const live = Object.entries(data)
        .filter(([, s]) => s.isLive)
        .map(([id, s]) => ({ id, ...s }));
      setLiveSessions(live);
    });
  };

  const relevantLive = liveSessions.filter(session =>
    userProfile?.enrolledCourses?.includes(session.courseId)
  );

  return (
    <div className="student-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Welcome back, {userProfile?.displayName?.split(' ')[0]}! 📚</h1>
          <p className="text-muted">Continue your learning journey</p>
        </div>
        <Link to="/student/courses" className="btn btn-primary">
          <FiSearch size={16} /> Explore Courses
        </Link>
      </div>

      {/* Live Now Banner */}
      {relevantLive.length > 0 && (
        <div className="live-banner">
          <div className="live-banner-left">
            <div className="live-dot" />
            <div>
              <h3>Live Class in Progress!</h3>
              <p>{relevantLive[0].teacherName} is teaching now</p>
            </div>
          </div>
          <Link to={`/live/${relevantLive[0].courseId}/${relevantLive[0].id}`} className="btn btn-danger">
            <FiPlay size={16} /> Join Now
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="student-stats">
        <div className="stat-mini card">
          <FiBook size={20} className="text-primary" />
          <div>
            <span className="stat-value">{enrolledCourses.length}</span>
            <span className="stat-label">Enrolled</span>
          </div>
        </div>
        <div className="stat-mini card">
          <FiPlay size={20} style={{ color: '#22c55e' }} />
          <div>
            <span className="stat-value">{enrolledCourses.reduce((a, c) => a + (c.contentCount || 0), 0)}</span>
            <span className="stat-label">Lessons</span>
          </div>
        </div>
        <div className="stat-mini card">
          <FiVideo size={20} style={{ color: '#ef4444' }} />
          <div>
            <span className="stat-value">{relevantLive.length}</span>
            <span className="stat-label">Live Now</span>
          </div>
        </div>
      </div>

      {/* Enrolled Courses */}
      <div className="section-header">
        <h2>My Courses</h2>
        <Link to="/student/enrolled" className="btn btn-outline btn-sm">View All</Link>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner spinner-lg" />
          <p>Loading your courses...</p>
        </div>
      ) : enrolledCourses.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🎓</div>
          <h3>No courses yet</h3>
          <p>Explore and enroll in courses to start learning!</p>
          <Link to="/student/courses" className="btn btn-primary">Browse Courses</Link>
        </div>
      ) : (
        <div className="courses-grid">
          {enrolledCourses.map(course => (
            <StudentCourseCard key={course.id} course={course} liveSessions={liveSessions} />
          ))}
        </div>
      )}
    </div>
  );
};

const StudentCourseCard = ({ course, liveSessions }) => {
  const isLive = liveSessions.some(s => s.courseId === course.id && s.isLive);
  const liveSession = liveSessions.find(s => s.courseId === course.id && s.isLive);

  return (
    <Link to={`/student/courses/${course.id}`} className="course-card card">
      <div className="course-thumb">
        {isLive && <div className="live-overlay"><div className="live-dot" /> LIVE NOW</div>}
        {course.thumbnail
          ? <img src={course.thumbnail} alt={course.title} />
          : <div className="thumb-placeholder">{course.title[0]}</div>}
      </div>
      <div className="course-info">
        <div className="flex items-center gap-2" style={{ marginBottom: '0.25rem' }}>
          <span className="badge badge-primary text-xs">{course.category}</span>
          {isLive && <span className="badge badge-live">LIVE</span>}
        </div>
        <h3 className="course-title truncate">{course.title}</h3>
        <p className="text-muted text-sm" style={{ marginBottom: '0.5rem' }}>by {course.teacherName}</p>
        <div className="course-meta">
          <span><FiVideo size={13} /> {course.contentCount || 0} lessons</span>
          <span><FiClock size={13} /> {course.duration || 'N/A'}</span>
        </div>
        {isLive && (
          <div className="course-live-cta">
            <FiPlay size={14} /> Join Live Class
          </div>
        )}
      </div>
    </Link>
  );
};

export default StudentDashboard;
