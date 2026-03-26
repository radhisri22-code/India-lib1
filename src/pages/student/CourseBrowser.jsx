import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { FiSearch, FiFilter, FiStar, FiUsers, FiClock, FiVideo, FiBook } from 'react-icons/fi';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import './CourseBrowser.css';

const CATEGORIES = ['All', 'Programming', 'Design', 'Business', 'Marketing', 'Music', 'Photography', 'Health', 'Language', 'Science', 'Math', 'Other'];
const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];

const CourseBrowser = () => {
  const { userProfile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [level, setLevel] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [courses, search, category, level]);

  const fetchCourses = async () => {
    try {
      const q = query(collection(db, 'courses'), where('isPublished', '==', true), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...courses];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.title?.toLowerCase().includes(s) ||
        c.description?.toLowerCase().includes(s) ||
        c.teacherName?.toLowerCase().includes(s) ||
        c.category?.toLowerCase().includes(s)
      );
    }
    if (category !== 'All') result = result.filter(c => c.category === category);
    if (level !== 'All') result = result.filter(c => c.level === level);
    setFiltered(result);
  };

  const isEnrolled = (courseId) => userProfile?.enrolledCourses?.includes(courseId);

  return (
    <div className="course-browser">
      <div className="browser-header">
        <div>
          <h1>Explore Courses</h1>
          <p className="text-muted">{filtered.length} courses available</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="browser-filters card">
        <div className="search-box">
          <FiSearch size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search courses, topics, teachers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <div className="filter-group">
            <FiFilter size={14} />
            <span className="filter-label">Category:</span>
            <div className="filter-chips">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'active' : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Level:</span>
            <div className="filter-chips">
              {LEVELS.map(l => (
                <button
                  key={l}
                  className={`chip ${level === l ? 'active' : ''}`}
                  onClick={() => setLevel(l)}
                >
                  {l === 'All' ? 'All' : l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Courses Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner spinner-lg" />
          <p>Loading courses...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🔍</div>
          <h3>No courses found</h3>
          <p>Try a different search term or category</p>
        </div>
      ) : (
        <div className="browser-grid">
          {filtered.map(course => (
            <BrowserCourseCard
              key={course.id}
              course={course}
              enrolled={isEnrolled(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const BrowserCourseCard = ({ course, enrolled }) => (
  <Link to={`/student/courses/${course.id}`} className="browser-course-card card">
    <div className="course-thumb">
      {enrolled && <div className="enrolled-badge"><FiBook size={12} /> Enrolled</div>}
      {course.thumbnail
        ? <img src={course.thumbnail} alt={course.title} />
        : <div className="thumb-placeholder">{course.title[0]}</div>}
    </div>
    <div className="course-info">
      <div className="flex items-center gap-2" style={{ marginBottom: '0.375rem' }}>
        <span className="badge badge-primary">{course.category}</span>
        <span className="badge" style={{ background: '#f1f5f9', color: '#475569', textTransform: 'capitalize' }}>
          {course.level}
        </span>
      </div>
      <h3 className="course-title">{course.title}</h3>
      <p className="text-muted text-sm" style={{ marginBottom: '0.5rem' }}>by {course.teacherName}</p>
      <p className="course-desc text-sm">{course.description?.slice(0, 80)}...</p>
      <div className="course-meta" style={{ marginTop: '0.75rem' }}>
        <span><FiUsers size={13} /> {course.enrolledCount || 0}</span>
        <span><FiVideo size={13} /> {course.contentCount || 0} lessons</span>
        <span><FiClock size={13} /> {course.duration || 'N/A'}</span>
      </div>
      <div className="course-footer">
        <span className="course-price">
          {course.price === 0 || !course.price ? <span className="free-badge">FREE</span> : `₹${course.price}`}
        </span>
        <button className={`btn btn-sm ${enrolled ? 'btn-success' : 'btn-primary'}`}>
          {enrolled ? 'Continue' : 'Enroll Now'}
        </button>
      </div>
    </div>
  </Link>
);

export default CourseBrowser;
