import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, arrayUnion, collection, getDocs, query, orderBy
} from 'firebase/firestore';
import { onValue, ref as dbRef } from 'firebase/database';
import {
  FiPlay, FiYoutube, FiVideo, FiUsers, FiClock, FiBook,
  FiLock, FiCheck, FiStar, FiMonitor, FiDownload, FiAlertCircle
} from 'react-icons/fi';
import { db, rtdb } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/shared/Toast';
import CommentSection from '../components/shared/CommentSection';
import Notepad from '../components/shared/Notepad';
import './CourseDetail.css';

const CourseDetail = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile, fetchUserProfile } = useAuth();
  const { toast } = useToast();

  const [course, setCourse] = useState(null);
  const [content, setContent] = useState([]);
  const [liveSessions, setLiveSessions] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [liveNotepad, setLiveNotepad] = useState(false);
  const [currentLive, setCurrentLive] = useState(null);

  const isEnrolled = userProfile?.enrolledCourses?.includes(courseId);
  const isTeacher = userProfile?.role === 'teacher' && course?.teacherId === currentUser?.uid;

  useEffect(() => {
    fetchCourse();
    watchLiveSessions();
  }, [courseId]);

  const fetchCourse = async () => {
    try {
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (!snap.exists()) { navigate('/'); return; }
      const data = { id: snap.id, ...snap.data() };
      setCourse(data);
      setContent(data.content || []);

      // Fetch recorded sessions
      const sessions = await getDocs(
        query(collection(db, `courses/${courseId}/liveSessions`), orderBy('startedAt', 'desc'))
      );
      setLiveSessions(sessions.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching course:', err);
    } finally {
      setLoading(false);
    }
  };

  const watchLiveSessions = () => {
    onValue(dbRef(rtdb, 'liveSessions'), snap => {
      const data = snap.val();
      if (!data) { setCurrentLive(null); return; }
      const live = Object.entries(data)
        .find(([, s]) => s.courseId === courseId && s.isLive);
      setCurrentLive(live ? { id: live[0], ...live[1] } : null);
    });
  };

  const enroll = async () => {
    if (!currentUser) { navigate('/login'); return; }
    setEnrolling(true);
    try {
      // Update course enrolled count
      await updateDoc(doc(db, 'courses', courseId), {
        enrolledCount: (course.enrolledCount || 0) + 1
      });
      // Update user's enrolled courses
      await updateDoc(doc(db, 'users', currentUser.uid), {
        enrolledCourses: arrayUnion(courseId)
      });
      await fetchUserProfile(currentUser.uid);
      toast('Successfully enrolled! 🎉', 'success');
    } catch (err) {
      toast('Enrollment failed: ' + err.message, 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const getContentIcon = (type) => {
    if (type === 'youtube') return <FiYoutube size={16} color="#ff0000" />;
    if (type === 'drive') return <FiVideo size={16} color="#4285f4" />;
    return <FiVideo size={16} color="#6c63ff" />;
  };

  if (loading) return (
    <div className="loading-state" style={{ minHeight: '60vh' }}>
      <div className="spinner spinner-lg" />
      <p>Loading course...</p>
    </div>
  );

  if (!course) return null;

  return (
    <div className="course-detail">
      {/* Course Header */}
      <div className="course-hero">
        <div className="course-hero-content">
          <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
            <span className="badge badge-primary">{course.category}</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', textTransform: 'capitalize' }}>
              {course.level}
            </span>
          </div>
          <h1 className="course-hero-title">{course.title}</h1>
          <p className="course-hero-desc">{course.description}</p>
          <div className="course-hero-meta">
            <span><FiUsers size={15} /> {course.enrolledCount || 0} students</span>
            <span><FiVideo size={15} /> {content.length} lessons</span>
            <span><FiClock size={15} /> {course.duration || 'N/A'}</span>
            <span><FiBook size={15} /> {course.language}</span>
          </div>
          <p className="course-instructor">by {course.teacherName}</p>
        </div>
        {course.thumbnail && (
          <div className="course-hero-thumb">
            <img src={course.thumbnail} alt={course.title} />
          </div>
        )}
      </div>

      <div className="course-body">
        {/* Main Content */}
        <div className="course-main">
          {/* Live Session Banner */}
          {currentLive && (isEnrolled || isTeacher) && (
            <div className="live-alert">
              <div className="live-dot" />
              <div>
                <strong>Live class is in progress!</strong>
                <span>{currentLive.teacherName} is teaching now</span>
              </div>
              <Link to={`/live/${courseId}/${currentLive.id}`} className="btn btn-danger">
                <FiPlay size={14} /> Join Live
              </Link>
            </div>
          )}

          {/* Video Player Area */}
          {selectedContent && (isEnrolled || isTeacher) && (
            <div className="player-area">
              <div className="player-header">
                {getContentIcon(selectedContent.type)}
                <h3>{selectedContent.title}</h3>
              </div>
              <VideoPlayer content={selectedContent} courseId={courseId} isTeacher={isTeacher} />

              {/* Notepad for students (read-only, from live sessions) */}
              {selectedContent.type === 'live' && selectedContent.sessionId && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: '0.75rem' }}
                  onClick={() => setLiveNotepad(!liveNotepad)}>
                  View Class Notes
                </button>
              )}

              {liveNotepad && selectedContent.sessionId && (
                <Notepad sessionId={selectedContent.sessionId} readOnly={!isTeacher} onClose={() => setLiveNotepad(false)} />
              )}

              {/* Comments for this content */}
              <CommentSection
                courseId={courseId}
                contentId={selectedContent.order?.toString() || '0'}
                contentType={selectedContent.type}
                isTeacher={isTeacher}
              />
            </div>
          )}

          {!selectedContent && (isEnrolled || isTeacher) && (
            <div className="select-content-prompt card">
              <FiPlay size={40} className="text-primary" />
              <h3>Select a lesson to start learning</h3>
              <p className="text-muted">Choose a video from the course content below</p>
            </div>
          )}

          {!isEnrolled && !isTeacher && (
            <div className="enroll-prompt card">
              <div className="enroll-prompt-icon">🔒</div>
              <h3>Enroll to access this course</h3>
              <p className="text-muted">Get lifetime access to all videos, live classes, and recordings</p>
              <button className="btn btn-primary btn-lg" onClick={enroll} disabled={enrolling}>
                {enrolling ? <span className="spinner" /> : course.price === 0 ? 'Enroll for Free' : `Enroll for ₹${course.price}`}
              </button>
            </div>
          )}

          {/* Course Content List */}
          <div className="content-curriculum card" style={{ marginTop: '1.5rem' }}>
            <h2>Course Content</h2>
            <div className="curriculum-stats">
              <span>{content.length} lessons</span>
              {liveSessions.filter(s => s.hasRecording).length > 0 && (
                <span>{liveSessions.filter(s => s.hasRecording).length} recorded sessions</span>
              )}
            </div>

            {content.length === 0 && liveSessions.length === 0 && (
              <p className="text-muted text-sm">No content added yet.</p>
            )}

            {/* Pre-recorded / YouTube lessons */}
            {content.map((item, i) => (
              <div
                key={i}
                className={`curriculum-item ${selectedContent?.order === item.order ? 'active' : ''} ${!isEnrolled && !isTeacher ? 'locked' : ''}`}
                onClick={() => (isEnrolled || isTeacher) && setSelectedContent(item)}
              >
                <div className="curriculum-icon">{getContentIcon(item.type)}</div>
                <div className="curriculum-info">
                  <span className="curriculum-title">{item.title}</span>
                  <span className="curriculum-type text-muted text-xs">
                    {item.type === 'youtube' ? 'YouTube Video' : item.type === 'drive' ? 'Google Drive Video' : 'Video'}
                  </span>
                </div>
                <span className="curriculum-num">#{i + 1}</span>
                {(!isEnrolled && !isTeacher) && <FiLock size={14} className="text-muted" />}
              </div>
            ))}

            {/* Recorded Live Sessions */}
            {liveSessions.filter(s => s.hasRecording).length > 0 && (
              <>
                <div className="curriculum-section-header">Recorded Live Sessions</div>
                {liveSessions.filter(s => s.hasRecording).map((session, i) => (
                  <div
                    key={session.id}
                    className={`curriculum-item recorded ${selectedContent?.sessionId === session.id ? 'active' : ''} ${!isEnrolled && !isTeacher ? 'locked' : ''}`}
                    onClick={() => (isEnrolled || isTeacher) && setSelectedContent({
                      type: 'live',
                      title: session.title || `Live Session ${i + 1}`,
                      url: session.recordingUrl,
                      sessionId: session.id,
                      order: `live_${i}`
                    })}
                  >
                    <div className="curriculum-icon"><FiMonitor size={16} color="#ef4444" /></div>
                    <div className="curriculum-info">
                      <span className="curriculum-title">{session.title || `Live Session ${i + 1}`}</span>
                      <span className="curriculum-type text-muted text-xs">
                        {session.startedAt?.toDate
                          ? new Date(session.startedAt.toDate()).toLocaleDateString('en-IN')
                          : 'Recorded'}
                      </span>
                    </div>
                    <span className="badge badge-danger">REC</span>
                    {(!isEnrolled && !isTeacher) && <FiLock size={14} className="text-muted" />}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="course-sidebar">
          <div className="course-enroll-card card">
            {course.thumbnail && <img src={course.thumbnail} alt={course.title} className="enroll-thumb" />}
            <div className="enroll-price">
              {course.price === 0 || !course.price
                ? <span className="price-free">FREE</span>
                : <span className="price-amount">₹{course.price}</span>}
            </div>
            {isEnrolled ? (
              <div className="enrolled-check">
                <FiCheck size={18} /> You're enrolled
              </div>
            ) : isTeacher ? (
              <Link to={`/teacher/courses/${courseId}`} className="btn btn-primary w-full">
                Manage Course
              </Link>
            ) : (
              <button className="btn btn-primary w-full btn-lg" onClick={enroll} disabled={enrolling}>
                {enrolling ? <span className="spinner" /> : 'Enroll Now'}
              </button>
            )}
            <div className="enroll-features">
              <div className="enroll-feature"><FiVideo size={14} /> {content.length} video lessons</div>
              <div className="enroll-feature"><FiMonitor size={14} /> Live class access</div>
              <div className="enroll-feature"><FiDownload size={14} /> Recordings included</div>
              <div className="enroll-feature"><FiCheck size={14} /> Lifetime access</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Video Player Component ────────────────────────────────────────────────────
const VideoPlayer = ({ content, courseId, isTeacher }) => {
  if (content.type === 'youtube' || (content.url && content.url.includes('youtube.com/embed'))) {
    return (
      <div className="video-wrapper">
        <iframe
          src={content.url}
          className="video-iframe"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          title={content.title}
        />
      </div>
    );
  }

  if (content.type === 'drive' || (content.url && content.url.includes('drive.google.com'))) {
    return (
      <div className="video-wrapper">
        <iframe
          src={content.url}
          className="video-iframe"
          allowFullScreen
          allow="autoplay"
          title={content.title}
        />
      </div>
    );
  }

  // Direct video (Firebase Storage or other)
  return (
    <div className="video-wrapper">
      <video
        src={content.url}
        controls
        className="video-player"
        controlsList="nodownload"
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
};

export default CourseDetail;
