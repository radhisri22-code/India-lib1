import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, arrayUnion, collection, getDocs, increment
} from 'firebase/firestore';
import { onValue, ref as dbRef } from 'firebase/database';
import {
  FiPlay, FiYoutube, FiVideo, FiUsers, FiClock, FiBook,
  FiLock, FiCheck, FiMonitor, FiDownload, FiChevronLeft, FiChevronRight,
  FiMessageSquare, FiTag, FiX
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
  const [allItems, setAllItems]       = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [completedIdxs, setCompletedIdxs] = useState(new Set());
  const [loading, setLoading]         = useState(true);
  const [enrolling, setEnrolling]     = useState(false);
  const [liveNotepad, setLiveNotepad] = useState(false);
  const [currentLive, setCurrentLive] = useState(null);

  // Enrollment modal (for paid courses)
  const [enrollModal, setEnrollModal]     = useState(false);
  const [couponInput, setCouponInput]     = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [finalPrice, setFinalPrice]       = useState(null);

  const isEnrolled = userProfile?.enrolledCourses?.includes(courseId);
  const isTeacher  = userProfile?.role === 'teacher' && course?.teacherId === currentUser?.uid;
  const canWatch   = isEnrolled || isTeacher;

  const selectedItem = selectedIdx !== null ? allItems[selectedIdx] : null;
  const lessons    = allItems.filter(i => i._kind === 'lesson');
  const recordings = allItems.filter(i => i._kind === 'recording');

  useEffect(() => {
    fetchCourse();
    const unsub = watchLive();
    return unsub;
  }, [courseId]);

  // Restore last-watched lesson once canWatch and items load
  useEffect(() => {
    if (canWatch && allItems.length > 0 && selectedIdx === null) {
      const savedIdx = userProfile?.progress?.[courseId]?.lastIdx ?? 0;
      setSelectedIdx(Math.min(savedIdx, allItems.length - 1));
      const saved = userProfile?.progress?.[courseId]?.completed || [];
      setCompletedIdxs(new Set(saved));
    }
  }, [canWatch, allItems]);

  // Set finalPrice when course loads
  useEffect(() => {
    if (course) setFinalPrice(course.price || 0);
  }, [course]);

  const fetchCourse = async () => {
    try {
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (!snap.exists()) { navigate('/'); return; }
      const data = { id: snap.id, ...snap.data() };
      setCourse(data);

      const lessonItems = (data.content || []).map((item, i) => ({ ...item, _kind: 'lesson', _seq: i }));

      const sesSnap = await getDocs(collection(db, `courses/${courseId}/liveSessions`));
      const recordingItems = sesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.hasRecording && s.recordingUrl)
        .sort((a, b) => (b.startedAt?.seconds || b.startedAt || 0) - (a.startedAt?.seconds || a.startedAt || 0))
        .map((s, i) => ({
          _kind: 'recording', _seq: i, type: 'live',
          title: s.title || `Live Recording ${i + 1}`,
          url: s.recordingUrl, sessionId: s.id, startedAt: s.startedAt
        }));

      setAllItems([...lessonItems, ...recordingItems]);
    } catch (err) {
      console.error('Error fetching course:', err);
    } finally {
      setLoading(false);
    }
  };

  const watchLive = () => {
    const unsubFn = onValue(dbRef(rtdb, 'liveSessions'), snap => {
      const data = snap.val();
      if (!data) { setCurrentLive(null); return; }
      const live = Object.entries(data).find(([, s]) => s.courseId === courseId && s.isLive);
      setCurrentLive(live ? { id: live[0], ...live[1] } : null);
    });
    return () => unsubFn();
  };

  // ─── Progress save ────────────────────────────────────────────────────────
  const saveProgress = useCallback(async (idx, completed) => {
    if (!currentUser || !isEnrolled) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        [`progress.${courseId}`]: { lastIdx: idx, completed: [...completed] }
      });
    } catch { /* silent */ }
  }, [currentUser, courseId, isEnrolled]);

  const selectLesson = (idx) => {
    setSelectedIdx(idx);
    // Mark previous as completed if it was a lesson
    const newCompleted = new Set(completedIdxs);
    if (selectedIdx !== null) newCompleted.add(selectedIdx);
    setCompletedIdxs(newCompleted);
    saveProgress(idx, newCompleted);
  };

  const goNext = () => { if (selectedIdx !== null && selectedIdx < allItems.length - 1) selectLesson(selectedIdx + 1); };
  const goPrev = () => { if (selectedIdx !== null && selectedIdx > 0) selectLesson(selectedIdx - 1); };

  // ─── Enroll ───────────────────────────────────────────────────────────────
  const handleEnrollClick = () => {
    if (!currentUser) { navigate('/login'); return; }
    if (course.price > 0) {
      setEnrollModal(true); // Show modal for paid courses (Razorpay will be added later)
    } else {
      doEnroll(0, null);
    }
  };

  const doEnroll = async (paidAmount, couponId) => {
    setEnrolling(true);
    try {
      await updateDoc(doc(db, 'courses', courseId), { enrolledCount: increment(1) });
      await updateDoc(doc(db, 'users', currentUser.uid), { enrolledCourses: arrayUnion(courseId) });
      // If coupon was used, increment its usedCount
      if (couponId) {
        await updateDoc(doc(db, `courses/${courseId}/coupons`, couponId), { usedCount: increment(1) });
      }
      await fetchUserProfile(currentUser.uid);
      setEnrollModal(false);
      toast('Enrolled successfully! 🎉', 'success');
    } catch (err) {
      toast('Enrollment failed: ' + err.message, 'error');
    } finally {
      setEnrolling(false);
    }
  };

  // ─── Apply coupon ─────────────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    try {
      const snap = await getDocs(collection(db, `courses/${courseId}/coupons`));
      const coupon = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .find(c => c.code === couponInput.trim().toUpperCase() && c.isActive);
      if (!coupon) { toast('Invalid or expired coupon code', 'error'); setCouponLoading(false); return; }
      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) { toast('Coupon usage limit reached', 'error'); setCouponLoading(false); return; }
      setAppliedCoupon(coupon);
      const base = course.price || 0;
      const discounted = coupon.type === 'percent'
        ? Math.max(0, Math.round(base - (base * coupon.value / 100)))
        : Math.max(0, base - coupon.value);
      setFinalPrice(discounted);
      toast(`Coupon applied! You save ${coupon.type === 'percent' ? coupon.value + '%' : '₹' + coupon.value}`, 'success');
    } catch (err) {
      toast('Could not apply coupon: ' + err.message, 'error');
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setFinalPrice(course.price || 0);
  };

  const getTypeIcon = (type, kind) => {
    if (kind === 'recording') return <FiMonitor size={15} color="#ef4444"/>;
    if (type === 'youtube')   return <FiYoutube size={15} color="#ff0000"/>;
    if (type === 'drive')     return <FiVideo   size={15} color="#4285f4"/>;
    return <FiVideo size={15} color="#6c63ff"/>;
  };

  const getTypeLabel = (type, kind) => {
    if (kind === 'recording') return 'Live Recording';
    if (type === 'youtube')   return 'YouTube Video';
    if (type === 'drive')     return 'Google Drive Video';
    return 'Video';
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const progressPct = allItems.length > 0 ? Math.round((completedIdxs.size / allItems.length) * 100) : 0;

  if (loading) return (
    <div className="loading-state" style={{ minHeight: '60vh' }}>
      <div className="spinner spinner-lg"/><p>Loading course...</p>
    </div>
  );
  if (!course) return null;

  return (
    <div className="course-detail">
      {/* Hero */}
      <div className="course-hero">
        <div className="course-hero-content">
          <div className="flex items-center gap-2" style={{ marginBottom: '0.75rem' }}>
            <span className="badge badge-primary">{course.category}</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', textTransform: 'capitalize' }}>{course.level}</span>
          </div>
          <h1 className="course-hero-title">{course.title}</h1>
          <p className="course-hero-desc">{course.description}</p>
          <div className="course-hero-meta">
            <span><FiUsers size={15}/> {course.enrolledCount || 0} students</span>
            <span><FiVideo size={15}/> {lessons.length} lessons</span>
            {recordings.length > 0 && <span><FiMonitor size={15}/> {recordings.length} recordings</span>}
            <span><FiClock size={15}/> {course.duration || 'N/A'}</span>
            <span><FiBook size={15}/> {course.language}</span>
          </div>
          <p className="course-instructor">by {course.teacherName}</p>
          {/* Progress bar for enrolled students */}
          {canWatch && allItems.length > 0 && (
            <div className="hero-progress">
              <div className="hero-progress-bar">
                <div className="hero-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span>{progressPct}% complete</span>
            </div>
          )}
        </div>
        {course.thumbnail && (
          <div className="course-hero-thumb">
            <img src={course.thumbnail} alt={course.title}/>
          </div>
        )}
      </div>

      <div className="course-body">
        <div className="course-main">
          {/* Live Banner */}
          {currentLive && canWatch && (
            <div className="live-alert">
              <div className="live-dot"/>
              <div>
                <strong>Live class in progress!</strong>
                <span>{currentLive.teacherName} is teaching now</span>
              </div>
              <Link to={`/live/${courseId}/${currentLive.id}`} className="btn btn-danger">
                <FiPlay size={14}/> Join Live
              </Link>
            </div>
          )}

          {/* Enroll prompt */}
          {!canWatch && (
            <div className="enroll-prompt card">
              <div className="enroll-prompt-icon">🔒</div>
              <h3>Enroll to access this course</h3>
              <p className="text-muted">Get lifetime access to all {lessons.length} lessons, live classes &amp; recordings</p>
              <button className="btn btn-primary btn-lg" onClick={handleEnrollClick} disabled={enrolling}>
                {enrolling ? <span className="spinner"/> : course.price === 0 ? 'Enroll for Free' : `Enroll for ₹${course.price}`}
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

              <VideoPlayer content={selectedItem}/>

              <div className="player-nav">
                <button className="btn btn-secondary btn-sm" onClick={goPrev} disabled={selectedIdx === 0}>
                  <FiChevronLeft size={16}/> Previous
                </button>
                <span className="text-muted text-sm">{getTypeLabel(selectedItem.type, selectedItem._kind)}</span>
                <button className="btn btn-primary btn-sm" onClick={goNext} disabled={selectedIdx === allItems.length - 1}>
                  Next <FiChevronRight size={16}/>
                </button>
              </div>

              {selectedItem._kind === 'recording' && selectedItem.sessionId && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setLiveNotepad(!liveNotepad)}>
                  <FiBook size={14}/> {liveNotepad ? 'Hide' : 'View'} Class Notes
                </button>
              )}
              {liveNotepad && selectedItem.sessionId && (
                <Notepad sessionId={selectedItem.sessionId} readOnly={!isTeacher} onClose={() => setLiveNotepad(false)}/>
              )}

              <CommentSection
                courseId={courseId}
                contentId={selectedItem._kind === 'recording' ? `rec_${selectedItem.sessionId}` : String(selectedItem._seq)}
                contentType={selectedItem.type}
                isTeacher={isTeacher}
              />
            </div>
          )}

          {canWatch && !selectedItem && allItems.length > 0 && (
            <div className="select-content-prompt card">
              <FiPlay size={40} className="text-primary"/>
              <h3>Ready to learn?</h3>
              <p className="text-muted">Click "Start from Beginning" or pick any lesson below</p>
              <button className="btn btn-primary" onClick={() => selectLesson(0)}>Start from Beginning</button>
            </div>
          )}

          {/* Curriculum */}
          <div className="content-curriculum card" style={{ marginTop: '1.5rem' }}>
            <h2>Course Curriculum</h2>
            <div className="curriculum-stats">
              <span>{lessons.length} lessons</span>
              {recordings.length > 0 && <span>· {recordings.length} recordings</span>}
              <span>· {course.duration || 'N/A'}</span>
              {canWatch && <span>· <strong>{progressPct}%</strong> completed</span>}
            </div>

            {allItems.length === 0 && (
              <p className="text-muted text-sm" style={{ padding: '1rem 0' }}>No content added yet.</p>
            )}

            {lessons.length > 0 && (
              <>
                <div className="curriculum-section-header">Video Lessons</div>
                {lessons.map((item, i) => {
                  const globalIdx = allItems.indexOf(item);
                  const done = completedIdxs.has(globalIdx);
                  return (
                    <div
                      key={i}
                      className={`curriculum-item ${selectedIdx === globalIdx ? 'active' : ''} ${!canWatch ? 'locked' : ''}`}
                      onClick={() => canWatch && selectLesson(globalIdx)}
                    >
                      <div className={`curriculum-num-badge ${done ? 'done' : ''}`}>
                        {done ? <FiCheck size={11}/> : i + 1}
                      </div>
                      <div className="curriculum-icon">{getTypeIcon(item.type, item._kind)}</div>
                      <div className="curriculum-info">
                        <span className="curriculum-title">{item.title}</span>
                        <span className="curriculum-type text-muted text-xs">{getTypeLabel(item.type, item._kind)}</span>
                      </div>
                      {selectedIdx === globalIdx && canWatch && <FiPlay size={14} color="var(--primary)"/>}
                      {!canWatch && <FiLock size={13} className="text-muted"/>}
                    </div>
                  );
                })}
              </>
            )}

            {recordings.length > 0 && (
              <>
                <div className="curriculum-section-header">Recorded Live Sessions</div>
                {recordings.map((item, i) => {
                  const globalIdx = allItems.indexOf(item);
                  return (
                    <div
                      key={i}
                      className={`curriculum-item recorded ${selectedIdx === globalIdx ? 'active' : ''} ${!canWatch ? 'locked' : ''}`}
                      onClick={() => canWatch && selectLesson(globalIdx)}
                    >
                      <div className="curriculum-num-badge rec">⏺</div>
                      <div className="curriculum-icon"><FiMonitor size={15} color="#ef4444"/></div>
                      <div className="curriculum-info">
                        <span className="curriculum-title">{item.title}</span>
                        <span className="curriculum-type text-muted text-xs">{item.startedAt ? formatDate(item.startedAt) : 'Recorded'}</span>
                      </div>
                      <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>REC</span>
                      {!canWatch && <FiLock size={13} className="text-muted"/>}
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
            {course.thumbnail && <img src={course.thumbnail} alt={course.title} className="enroll-thumb"/>}
            <div className="enroll-price">
              {course.price === 0 || !course.price
                ? <span className="price-free">FREE</span>
                : <span className="price-amount">₹{course.price}</span>}
            </div>
            {isEnrolled ? (
              <div className="enrolled-check"><FiCheck size={18}/> You're enrolled</div>
            ) : isTeacher ? (
              <Link to={`/teacher/courses/${courseId}`} className="btn btn-primary w-full">Manage Course</Link>
            ) : (
              <button className="btn btn-primary w-full btn-lg" onClick={handleEnrollClick} disabled={enrolling}>
                {enrolling ? <span className="spinner"/> : 'Enroll Now'}
              </button>
            )}
            {/* Progress for enrolled */}
            {canWatch && allItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.375rem', color: 'var(--gray-600)' }}>
                  <span>Progress</span><span>{progressPct}%</span>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }}/></div>
              </div>
            )}
            <div className="enroll-features">
              <div className="enroll-feature"><FiVideo size={14}/> {lessons.length} video lessons</div>
              <div className="enroll-feature"><FiMonitor size={14}/> Live class access</div>
              {recordings.length > 0 && <div className="enroll-feature"><FiDownload size={14}/> {recordings.length} recordings</div>}
              <div className="enroll-feature"><FiCheck size={14}/> Lifetime access</div>
              <div className="enroll-feature"><FiMessageSquare size={14}/> Q&amp;A per lesson</div>
            </div>
          </div>
        </div>
      </div>

      {/* Enrollment Modal (for paid courses) */}
      {enrollModal && (
        <div className="modal-overlay" onClick={() => setEnrollModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Complete Enrollment</h2>
              <button className="modal-close" onClick={() => setEnrollModal(false)}><FiX size={16}/></button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--gray-900)', marginBottom: '0.125rem' }}>{course.title}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>by {course.teacherName}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {appliedCoupon && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--gray-400)', textDecoration: 'line-through' }}>₹{course.price}</p>
                  )}
                  <p style={{ fontSize: '1.25rem', fontWeight: 800, color: appliedCoupon ? 'var(--success)' : 'var(--gray-900)' }}>
                    {finalPrice === 0 ? 'FREE' : `₹${finalPrice}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Coupon input */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label className="form-label"><FiTag size={13}/> Have a coupon code?</label>
              {appliedCoupon ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)' }}>
                  <FiCheck size={16} color="var(--success)"/>
                  <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600 }}>
                    {appliedCoupon.code} — {appliedCoupon.type === 'percent' ? `${appliedCoupon.value}% off` : `₹${appliedCoupon.value} off`}
                  </span>
                  <button onClick={removeCoupon} className="btn btn-sm btn-secondary"><FiX size={13}/></button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <input
                    className="form-input"
                    placeholder="Enter coupon code"
                    value={couponInput}
                    onChange={e => setCouponInput(e.target.value.toUpperCase())}
                    style={{ flex: 1 }}
                    onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                  />
                  <button className="btn btn-secondary" onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()}>
                    {couponLoading ? <span className="spinner"/> : 'Apply'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: '1rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#92400e' }}>
              Payment gateway coming soon. Enrollment is currently free for testing.
            </div>

            <button className="btn btn-primary w-full btn-lg" onClick={() => doEnroll(finalPrice, appliedCoupon?.id)} disabled={enrolling}>
              {enrolling ? <span className="spinner"/> : finalPrice === 0 ? 'Enroll for Free' : `Confirm Enrollment (₹${finalPrice})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Video Player ──────────────────────────────────────────────────────────────
const VideoPlayer = ({ content }) => {
  if (content.type === 'youtube' || content.url?.includes('youtube.com/embed')) {
    return (
      <div className="video-wrapper">
        <iframe src={content.url} className="video-iframe" allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          title={content.title}/>
      </div>
    );
  }
  if (content.type === 'drive' || content.url?.includes('drive.google.com')) {
    return (
      <div className="video-wrapper">
        <iframe src={content.url} className="video-iframe" allowFullScreen allow="autoplay" title={content.title}/>
      </div>
    );
  }
  return (
    <div className="video-wrapper">
      <video src={content.url} controls className="video-player" controlsList="nodownload" onContextMenu={e => e.preventDefault()}/>
    </div>
  );
};

export default CourseDetail;
