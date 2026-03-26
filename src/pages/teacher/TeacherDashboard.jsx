import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, where, getDocs, orderBy
} from 'firebase/firestore';
import {
  FiBook, FiVideo, FiUsers, FiPlus, FiTrendingUp,
  FiPlay, FiClock, FiStar
} from 'react-icons/fi';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import './TeacherDashboard.css';

const TeacherDashboard = () => {
  const { currentUser, userProfile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState({ courses: 0, students: 0, videos: 0, liveClasses: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [currentUser]);

  const fetchDashboardData = async () => {
    try {
      const q = query(
        collection(db, 'courses'),
        where('teacherId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const courseData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCourses(courseData);

      const totalStudents = courseData.reduce((acc, c) => acc + (c.enrolledCount || 0), 0);
      const totalVideos = courseData.reduce((acc, c) => acc + (c.contentCount || 0), 0);
      const totalLive = courseData.reduce((acc, c) => acc + (c.liveSessionCount || 0), 0);

      setStats({
        courses: courseData.length,
        students: totalStudents,
        videos: totalVideos,
        liveClasses: totalLive
      });
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { icon: <FiBook size={24} />, label: 'Total Courses', value: stats.courses, color: '#6c63ff' },
    { icon: <FiUsers size={24} />, label: 'Total Students', value: stats.students, color: '#22c55e' },
    { icon: <FiVideo size={24} />, label: 'Video Lessons', value: stats.videos, color: '#f59e0b' },
    { icon: <FiPlay size={24} />, label: 'Live Sessions', value: stats.liveClasses, color: '#ef4444' }
  ];

  return (
    <div className="teacher-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Welcome back, {userProfile?.displayName?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Here's what's happening with your courses</p>
        </div>
        <div className="dashboard-header-actions">
          <Link to="/teacher/courses/new" className="btn btn-primary">
            <FiPlus size={16} /> New Course
          </Link>
          <Link to="/teacher/live" className="btn btn-danger">
            <FiVideo size={16} /> Go Live
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map((s, i) => (
          <div key={i} className="stat-card card">
            <div className="stat-icon" style={{ background: s.color + '20', color: s.color }}>
              {s.icon}
            </div>
            <div className="stat-info">
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
            </div>
            <FiTrendingUp className="stat-trend" />
          </div>
        ))}
      </div>

      {/* Courses */}
      <div className="section-header">
        <h2>Your Courses</h2>
        <Link to="/teacher/courses" className="btn btn-outline btn-sm">View All</Link>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner spinner-lg" />
          <p>Loading your courses...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📚</div>
          <h3>No courses yet</h3>
          <p>Create your first course and start teaching!</p>
          <Link to="/teacher/courses/new" className="btn btn-primary">
            <FiPlus size={16} /> Create Course
          </Link>
        </div>
      ) : (
        <div className="courses-grid">
          {courses.slice(0, 6).map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
};

const CourseCard = ({ course }) => (
  <Link to={`/teacher/courses/${course.id}`} className="course-card card">
    <div className="course-thumb">
      {course.thumbnail
        ? <img src={course.thumbnail} alt={course.title} />
        : <div className="thumb-placeholder">{course.title[0]}</div>}
    </div>
    <div className="course-info">
      <div className="course-category badge badge-primary">{course.category || 'General'}</div>
      <h3 className="course-title truncate">{course.title}</h3>
      <p className="course-desc text-muted text-sm">{course.description?.slice(0, 80)}...</p>
      <div className="course-meta">
        <span><FiUsers size={13} /> {course.enrolledCount || 0} students</span>
        <span><FiVideo size={13} /> {course.contentCount || 0} lessons</span>
        <span><FiClock size={13} /> {course.duration || 'N/A'}</span>
      </div>
      <div className="course-status">
        <span className={`badge ${course.isPublished ? 'badge-success' : 'badge-warning'}`}>
          {course.isPublished ? 'Published' : 'Draft'}
        </span>
        {course.price === 0 || !course.price
          ? <span className="badge badge-primary">Free</span>
          : <span className="price">₹{course.price}</span>}
      </div>
    </div>
  </Link>
);

export default TeacherDashboard;
