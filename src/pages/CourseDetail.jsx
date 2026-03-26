import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, arrayUnion, collection, getDocs
} from 'firebase/firestore';
import { onValue, ref as dbRef } from 'firebase/database';
import {
  FiPlay, FiYoutube, FiVideo, FiUsers, FiClock, FiBook,
  FiLock, FiCheck, FiMonitor, FiDownload, FiChevronLeft, FiChevronRight,
  FiMessageSquare
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

  const [course, setCourse]           = useState(null);
  const [allItems, setAllItems]       = useState([]); // merged: lessons + recordings
  const [selectedIdx, setSelectedIdx] = useState(null); // index in allItems
  const [loading, setLoading]         = useState(true);
  const [enrolling, setEnrolling]     = useState(false);
  const [liveNotepad, setLiveNotepad] = useState(false);
  const [currentLive, setCurrentLive] = useState(null);

  const isEnrolled = userProfile?.enrolledCourses?.includes(courseId);
  const isTeacher  = userProfile?.role === 'teacher' && course?.teacherId === currentUser?.uid;
  const canWatch   = isEnrolled || isTeacher;

  const selectedItem = selectedIdx !== null ? allItems[selectedIdx] : null;

  useEffect(() => {
    fetchCourse();
    const unsub = watchLive();
    return unsub;
  }, [courseId]);

  // Auto-select first item when access is granted and items are loaded
  useEffect(() => {
    if (canWatch && allItems.length > 0 && selectedIdx === null) {
      setSelectedIdx(0);
    }
  }, [canWatch, allItems]);

  const fetchCourse = async () => {
    try {
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (!snap.exists()) { navigate('/'); return; }
      const data = { id: snap.id, ...snap.data() };
      setCourse(data);

      // Build lesson items
      const lessons = (data.content || []).map((item, i) => ({
        ...item,
        _kind: 'lesson',
        _seq: i
      }));

      // Fetch recorded sessions — sort client-side (no composite index needed)
      const sesSnap = await getDocs(collection(db, `courses/${courseId}/liveSessions`));
      const recordings = sesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.hasRecording && s.recordingUrl)
        .sort((a, b) => (b.startedAt?.seconds || b.startedAt || 0) - (a.startedAt?.seconds || a.startedAt || 0))
        .map((s, i) => ({
          _kind:    'recording',
          _seq:     i,
          type:     'live',
          title:    s.title || `Live Recording ${i + 1}`,
          url:      s.recordingUrl,
          sessionId: s.id,
          startedAt: s.startedAt
        }));

      setAllItems([...lessons, ...recordings]);
    } catch (err) {
      console.error('Error fetching course:', err);
    } finally {
      setLoading(false);
    }
  };

  const watchLive = () => {
    const ref = dbRef(rtdb, 'liveSessions');
    const unsub = onValue(ref, snap => {
      const data = snap.val();
      if (!data) { setCurrentLive(null); return; }
      const live = Object.entries(data).find(([, s]) => s.courseId === courseId && s.isLive);
      setCurrentLive(live ? { id: live[0], ...live[1] } : null);
    });
    return () => unsub();
  };

  const enroll = async () => {
    if (!currentUser) { navigate('/login'); return; }
    setEnrolling(true);
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        enrolledCount: (course.enrolledCount || 0) + 1
      });
      await updateDoc(doc(db, 'users', currentUser.uid), {
        enrolledCourses: arrayUnion(courseId)
      });
      await fetchUserProfile(currentUser.uid);
      toast('Enrolled successfully! 🎉', 'success');
    } catch (err) {
      toast('Enrollment failed: ' + err.message, 'error');
    } finally {
      setEnrolling(false);
    }
  };

  const lessons   = allItems.filter(i => i._kind === 'lesson');
  const recordings = allItems.filter(i => i._kind === 'recording');

  const goNext = () => { if (selectedIdx !== null && selectedIdx < allItems.length - 1) setSelectedIdx(selectedIdx + 1); };
  const goPrev = () => { if (selectedIdx !== null && selectedIdx > 0) setSelectedIdx(selectedIdx - 1); };

  const getTypeIcon = (type, kind) => {
    if (kind === 'recording' || type === 'live') return <FiMonitor size={15} color="#ef4444" />;
    if (type === 'youtube') return <FiYoutube size={15} color="#ff0000" />;
    if (type === 'drive')   return <FiVideo   size={15} color="#4285f4" />;
    return <FiVideo size={15} color="#6c63ff" />;
  };

  const getTypeLabel = (type, kind) => {
    if (kind === 'recording') return 'Live Recording';
    if (type === 'youtube')   return 'YouTube Video';
    if (type === 'drive')     return 'Google Drive';
    return 'Video';
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
      {/* Course Hero */}
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
            <span><FiVideo size={15} /> {lessons.length} lessons</span>
            {recordings.length > 0 && <span><FiMonitor size={15} /> {recordings.length} recordings</span>}
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
        {/* Main */}
        <div className="course-main">

          {/* Live Banner */}
          {currentLive && canWatch && (
            <div className="live-alert">
              <div className="live-dot" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1.5s infinite' }} />
              <div>
                <strong>Live class in progress!</strong>
                <span>{currentLive.teacherName} is teaching now</span>
              </div>
              <Link to={`/live/${courseId}/${currentLive.id}`} className="btn btn-danger">
                <FiPlay size={14} /> Join Live
              </Link>
            </div>
          )}

          {/* Enroll prompt (not enrolled + not teacher) */}
          {!canWatch && (
            <div className="enroll-prompt card">
              <div className="enroll-prompt-icon">🔒</div>
              <h3>Enroll to access this course</h3>
              <p className="text-muted">Get lifetime access to all {lessons.length} video lessons, live classes, and recordings</p>
              <button className="btn btn-primary btn-lg" onClick={enroll} disabled={enrolling}>
                {enrolling ? <span className="spinner" /> : course.price === 0 ? 'Enroll for Free' : `Enroll for ₹${course.price}`}
              </button>
            </div>
          )}

          {/* Player */}
          {canWatch && selectedItem && (
            <div className="player-area fade-in">
              <div className="player-header">
                {getTypeIcon(selectedItem.type, selectedItem._kind)}
                <h3 style={{ flex: 1 }}>{selectedItem.title}</h3>
                <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                  {selectedIdx + 1} / {allItems.length}
                </span>
              </div>

              <VideoPlayer content={selectedItem} />

              {/* Prev / Next */}
              <div className="player-nav">
                <button className="btn btn-secondary btn-sm" onClick={goPrev} disabled={selectedIdx === 0}>
                  <FiChevronLeft size={16} /> Previous
                </button>
                <span className="text-muted text-sm">{getTypeLabel(selectedItem.type, selectedItem._kind)}</span>
                <button className="btn btn-primary btn-sm" onClick={goNext} disabled={selectedIdx === allItems.length - 1}>
                  Next <FiChevronRight size={16} />
                </button>
              </div>

              {/* Notes button for recordings */}
              {selectedItem._kind === 'recording' && selectedItem.sessionId && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: '0.75rem' }}
                  onClick={() => setLiveNotepad(!liveNotepad)}>
                  <FiBook size={14} /> {liveNotepad ? 'Hide' : 'View'} Class Notes
                </button>
              )}
              {liveNotepad && selectedItem.sessionId && (
                <Notepad sessionId={selectedItem.sessionId} readOnly={!isTeacher} onClose={() => setLiveNotepad(false)} />
              )}

              {/* Comments */}
              <CommentSection
                courseId={courseId}
                contentId={selectedItem._kind === 'recording' ? `rec_${selectedItem.sessionId}` : String(selectedItem._seq)}
                contentType={selectedItem.type}
                isTeacher={isTeacher}
              />
            </div>
          )}

          {/* "Pick a lesson" prompt when enrolled but nothing selected */}
          {canWatch && !selectedItem && allItems.length > 0 && (
            <div className="select-content-prompt card">
              <FiPlay size={40} className="text-primary" />
              <h3>Select a lesson to start</h3>
              <p className="text-muted">Choose a lesson from the curriculum below</p>
              <button className="btn btn-primary" onClick={() => setSelectedIdx(0)}>
                Start from Beginning
              </button>
            </div>
          )}

          {/* Curriculum */}
          <div className="content-curriculum card" style={{ marginTop: '1.5rem' }}>
            <h2>Course Curriculum</h2>
            <div className="curriculum-stats">
              <span>{lessons.length} lessons</span>
              {recordings.length > 0 && <span>· {recordings.length} recorded sessions</span>}
              <span>· {course.duration || 'N/A'}</span>
            </div>

            {allItems.length === 0 && (
              <p className="text-muted text-sm" style={{ padding: '1rem 0' }}>No content added yet.</p>
            )}

            {/* Lessons */}
            {lessons.length > 0 && (
              <>
                <div className="curriculum-section-header">Video Lessons</div>
                {lessons.map((item, i) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <div
                      key={i}
                      className={`curriculum-item ${selectedIdx === globalIdx ? 'active' : ''} ${!canWatch ? 'locked' : ''}`}
                      onClick={() => canWatch && setSelectedIdx(globalIdx)}
                    >
                      <div className="curriculum-num-badge">{i + 1}</div>
                      <div className="curriculum-icon">{getTypeIcon(item.type, item._kind)}</div>
                      <div className="curriculum-info">
                        <span className="curriculum-title">{item.title}</span>
                        <span className="curriculum-type text-muted text-xs">{getTypeLabel(item.type, item._kind)}</span>
                      </div>
                      {selectedIdx === globalIdx && canWatch && <FiPlay size={14} color="var(--primary)" />}
                      {!canWatch && <FiLock size={13} className="text-muted" />}
                    </div>
                  );
                })}
              </>
            )}

            {/* Recordings */}
            {recordings.length > 0 && (
              <>
                <div className="curriculum-section-header">Recorded Live Sessions</div>
                {recordings.map((item, i) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <div
                      key={i}
                      className={`curriculum-item recorded ${selectedIdx === globalIdx ? 'active' : ''} ${!canWatch ? 'locked' : ''}`}
                      onClick={() => canWatch && setSelectedIdx(globalIdx)}
                    >
                      <div className="curriculum-num-badge rec">⏺</div>
                      <div className="curriculum-icon"><FiMonitor size={15} color="#ef4444" /></div>
                      <div className="curriculum-info">
                        <span className="curriculum-title">{item.title}</span>
                        <span className="curriculum-type text-muted text-xs">
                          {item.startedAt ? formatDate(item.startedAt) : 'Recorded Session'}
                        </span>
                      </div>
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>REC</span>
                      {!canWatch && <FiLock size={13} className="text-muted" />}
                    </div>
                  );
                })}
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
              <div className="enroll-feature"><FiVideo size={14} /> {lessons.length} video lessons</div>
              <div className="enroll-feature"><FiMonitor size={14} /> Live class access</div>
              {recordings.length > 0 && <div className="enroll-feature"><FiDownload size={14} /> {recordings.length} recordings</div>}
              <div className="enroll-feature"><FiCheck size={14} /> Lifetime access</div>
              <div className="enroll-feature"><FiMessageSquare size={14} /> Comment on lessons</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Video Player ──────────────────────────────────────────────────────────────
const VideoPlayer = ({ content }) => {
  if (content.type === 'youtube' || content.url?.includes('youtube.com/embed')) {
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
  if (content.type === 'drive' || content.url?.includes('drive.google.com')) {
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
