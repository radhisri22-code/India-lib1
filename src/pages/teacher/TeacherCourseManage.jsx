import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, collection, getDocs, deleteDoc,
  addDoc, serverTimestamp
} from 'firebase/firestore';
import {
  FiArrowLeft, FiEdit3, FiTrash2, FiYoutube, FiVideo, FiUpload,
  FiUsers, FiPlay, FiMonitor, FiPlus, FiCheck, FiX, FiEye,
  FiEyeOff, FiBook, FiClock, FiDollarSign, FiGlobe, FiTag,
  FiSave, FiExternalLink, FiPercent
} from 'react-icons/fi';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { uploadVideoToDrive, getGDriveToken } from '../../firebase/googleDrive';
import './TeacherCourseManage.css';

const TeacherCourseManage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile, refreshDriveToken } = useAuth();
  const { toast } = useToast();

  const [course, setCourse]     = useState(null);
  const [content, setContent]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [coupons, setCoupons]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // Add-content panel
  const [addTab, setAddTab]             = useState('youtube');
  const [newTitle, setNewTitle]         = useState('');
  const [newUrl, setNewUrl]             = useState('');
  const [videoFile, setVideoFile]       = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading]       = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  // Coupon panel
  const [showCouponPanel, setShowCouponPanel] = useState(false);
  const [couponCode, setCouponCode]       = useState('');
  const [couponType, setCouponType]       = useState('percent'); // 'percent' | 'flat'
  const [couponValue, setCouponValue]     = useState('');
  const [couponMaxUses, setCouponMaxUses] = useState('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});

  const [driveConnected, setDriveConnected] = useState(!!driveConnected);
  const fileInputRef = useRef();

  useEffect(() => { fetchAll(); }, [courseId]);

  const fetchAll = async () => {
    try {
      const snap = await getDoc(doc(db, 'courses', courseId));
      if (!snap.exists()) { navigate('/teacher/courses'); return; }
      const data = { id: snap.id, ...snap.data() };
      if (data.teacherId !== currentUser.uid) { navigate('/teacher/courses'); return; }
      setCourse(data);
      setContent(data.content || []);
      setEditData({
        title: data.title, description: data.description,
        category: data.category, level: data.level,
        language: data.language, duration: data.duration, price: data.price
      });

      const sesSnap = await getDocs(collection(db, `courses/${courseId}/liveSessions`));
      setSessions(
        sesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.startedAt?.seconds || b.startedAt || 0) - (a.startedAt?.seconds || a.startedAt || 0))
      );

      const couponSnap = await getDocs(collection(db, `courses/${courseId}/coupons`));
      setCoupons(couponSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      toast('Failed to load course: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Publish toggle ───────────────────────────────────────────────────────
  const togglePublish = async () => {
    setSaving(true);
    try {
      const next = !course.isPublished;
      await updateDoc(doc(db, 'courses', courseId), { isPublished: next, updatedAt: serverTimestamp() });
      setCourse(c => ({ ...c, isPublished: next }));
      toast(next ? 'Course published! Students can now find and enroll.' : 'Course set to draft.', 'success');
    } catch (err) {
      toast('Update failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Save edit ────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editData.title || !editData.description || !editData.category) {
      toast('Title, description and category are required', 'error'); return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'courses', courseId), { ...editData, updatedAt: serverTimestamp() });
      setCourse(c => ({ ...c, ...editData }));
      setEditMode(false);
      toast('Course updated!', 'success');
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Add YouTube ──────────────────────────────────────────────────────────
  const addYouTube = () => {
    if (!newTitle.trim() || !newUrl.trim()) { toast('Title and URL required', 'error'); return; }
    const match = newUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    if (!match) { toast('Invalid YouTube URL', 'error'); return; }
    const updated = [...content, { type: 'youtube', title: newTitle.trim(), url: `https://www.youtube.com/embed/${match[1]}`, videoId: match[1], order: content.length }];
    saveContent(updated);
    setNewTitle(''); setNewUrl('');
  };

  // ─── Upload to Drive ──────────────────────────────────────────────────────
  const uploadDrive = async () => {
    if (!newTitle.trim() || !videoFile) { toast('Title and video required', 'error'); return; }

    // Check token before starting — prompt reconnect if missing/expired
    if (!driveConnected) {
      toast('Google Drive not connected. Click "Connect Drive" first.', 'error'); return;
    }

    setUploading(true); setUploadProgress(0);
    try {
      toast('Uploading to Google Drive… please wait', 'info');
      const result = await uploadVideoToDrive(
        videoFile,
        `${currentUser.uid}_${Date.now()}_${videoFile.name}`,
        p => setUploadProgress(p)
      );
      const updated = [...content, {
        type: 'drive', title: newTitle.trim(),
        url: result.embedLink, driveId: result.fileId,
        directLink: result.directLink, order: content.length
      }];
      saveContent(updated);
      setNewTitle(''); setVideoFile(null); setUploadProgress(0);
      toast('Video uploaded to Google Drive! ✅', 'success');
    } catch (err) {
      if (err.message.includes('expired') || err.message.includes('session')) {
        toast('Drive session expired — click "Connect Drive" to reconnect, then upload again.', 'error');
      } else {
        toast('Upload failed: ' + err.message, 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  const connectDrive = async () => {
    toast('Opening Google sign-in to connect Drive…', 'info');
    const ok = await refreshDriveToken();
    if (ok) { setDriveConnected(true); toast('Google Drive connected! You can now upload videos.', 'success'); }
    else toast('Drive connection cancelled.', 'warning');
  };

  const removeContent = (index) => {
    saveContent(content.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i })));
  };

  const saveContent = async (updated) => {
    setContent(updated);
    try {
      await updateDoc(doc(db, 'courses', courseId), { content: updated, contentCount: updated.length, updatedAt: serverTimestamp() });
      toast('Content saved!', 'success');
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    }
  };

  // ─── Delete course ────────────────────────────────────────────────────────
  const deleteCourse = async () => {
    if (!window.confirm('Delete this course permanently? This cannot be undone.')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'courses', courseId));
      toast('Course deleted', 'info');
      navigate('/teacher/courses');
    } catch (err) {
      toast('Delete failed: ' + err.message, 'error');
      setSaving(false);
    }
  };

  // ─── Coupon management ────────────────────────────────────────────────────
  const addCoupon = async () => {
    if (!couponCode.trim() || !couponValue) { toast('Code and discount value required', 'error'); return; }
    const code = couponCode.trim().toUpperCase();
    if (coupons.find(c => c.code === code)) { toast('Coupon code already exists', 'error'); return; }
    try {
      const newCoupon = {
        code,
        type: couponType,
        value: Number(couponValue),
        maxUses: couponMaxUses ? Number(couponMaxUses) : null,
        usedCount: 0,
        isActive: true,
        createdAt: serverTimestamp()
      };
      const ref = await addDoc(collection(db, `courses/${courseId}/coupons`), newCoupon);
      setCoupons(prev => [...prev, { id: ref.id, ...newCoupon }]);
      setCouponCode(''); setCouponValue(''); setCouponMaxUses('');
      toast(`Coupon ${code} created!`, 'success');
    } catch (err) {
      toast('Failed to create coupon: ' + err.message, 'error');
    }
  };

  const deleteCoupon = async (couponId) => {
    try {
      await deleteDoc(doc(db, `courses/${courseId}/coupons`, couponId));
      setCoupons(prev => prev.filter(c => c.id !== couponId));
      toast('Coupon deleted', 'info');
    } catch (err) {
      toast('Delete failed', 'error');
    }
  };

  const toggleCoupon = async (coupon) => {
    try {
      await updateDoc(doc(db, `courses/${courseId}/coupons`, coupon.id), { isActive: !coupon.isActive });
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, isActive: !c.isActive } : c));
    } catch { toast('Update failed', 'error'); }
  };

  const getTypeIcon = (type) => {
    if (type === 'youtube') return <FiYoutube size={15} color="#ff0000" />;
    if (type === 'drive')   return <FiVideo   size={15} color="#4285f4" />;
    return <FiVideo size={15} color="#6c63ff" />;
  };

  const getTypeLabel = (type) => {
    if (type === 'youtube') return 'YouTube'; if (type === 'drive') return 'Google Drive'; return 'Video';
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const CATEGORIES = ['Programming', 'Design', 'Business', 'Marketing', 'Music', 'Photography', 'Health', 'Language', 'Science', 'Math', 'History', 'Other'];

  if (loading) return <div className="loading-state" style={{ minHeight: '60vh' }}><div className="spinner spinner-lg" /><p>Loading...</p></div>;
  if (!course) return null;

  return (
    <div className="tcm-page">
      {/* Top Bar */}
      <div className="tcm-topbar">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/teacher/courses')}>
          <FiArrowLeft size={15} /> My Courses
        </button>
        <div className="flex items-center gap-2">
          <span className={`badge ${course.isPublished ? 'badge-success' : 'badge-warning'}`}>
            {course.isPublished ? 'Published' : 'Draft'}
          </span>
          <button className={`btn btn-sm ${course.isPublished ? 'btn-secondary' : 'btn-success'}`} onClick={togglePublish} disabled={saving}>
            {course.isPublished ? <><FiEyeOff size={14}/> Unpublish</> : <><FiEye size={14}/> Publish</>}
          </button>
          <Link to={`/teacher/live?course=${courseId}`} className="btn btn-danger btn-sm">
            <FiPlay size={14}/> Go Live
          </Link>
          <button className="btn btn-sm btn-secondary" onClick={() => setEditMode(!editMode)}>
            {editMode ? <><FiX size={14}/> Cancel</> : <><FiEdit3 size={14}/> Edit Info</>}
          </button>
          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }} onClick={deleteCourse}>
            <FiTrash2 size={14}/>
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="tcm-hero">
        {course.thumbnail && <img src={course.thumbnail} alt={course.title} className="tcm-hero-thumb" />}
        <div className="tcm-hero-info">
          <div className="flex items-center gap-2" style={{ marginBottom: '0.5rem' }}>
            <span className="badge badge-primary">{course.category}</span>
            <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>{course.level}</span>
          </div>
          <h1 className="tcm-title">{course.title}</h1>
          <p className="tcm-desc text-muted">{course.description}</p>
          <div className="tcm-stats-row">
            <span><FiUsers size={14}/> <strong>{course.enrolledCount || 0}</strong> enrolled</span>
            <span><FiVideo size={14}/> <strong>{content.length}</strong> lessons</span>
            <span><FiMonitor size={14}/> <strong>{sessions.length}</strong> sessions</span>
            <span><FiTag size={14}/> <strong>{coupons.length}</strong> coupons</span>
            <span><FiClock size={14}/> {course.duration || 'N/A'}</span>
            <span><FiDollarSign size={14}/> {course.price === 0 || !course.price ? 'Free' : `₹${course.price}`}</span>
          </div>
        </div>
      </div>

      {/* Edit Panel */}
      {editMode && (
        <div className="tcm-edit-panel card">
          <h3>Edit Course Info</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select className="form-input" value={editData.category} onChange={e => setEditData(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea className="form-input" rows={3} value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Level</label>
              <select className="form-input" value={editData.level} onChange={e => setEditData(p => ({ ...p, level: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Language</label>
              <input className="form-input" value={editData.language} onChange={e => setEditData(p => ({ ...p, language: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input className="form-input" placeholder="e.g. 10 hours" value={editData.duration} onChange={e => setEditData(p => ({ ...p, duration: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input className="form-input" type="number" min={0} value={editData.price} onChange={e => setEditData(p => ({ ...p, price: Number(e.target.value) }))} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
            {saving ? <span className="spinner"/> : <><FiSave size={15}/> Save Changes</>}
          </button>
        </div>
      )}

      <div className="tcm-body">
        <div className="tcm-main">

          {/* Content Section */}
          <div className="tcm-section card">
            <div className="tcm-section-header">
              <h2><FiVideo size={18}/> Course Content <span className="badge badge-primary">{content.length}</span></h2>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddPanel(!showAddPanel)}>
                {showAddPanel ? <><FiX size={14}/> Cancel</> : <><FiPlus size={14}/> Add Lesson</>}
              </button>
            </div>

            {showAddPanel && (
              <div className="tcm-add-panel">
                <div className="content-tabs">
                  <button className={`tab-btn ${addTab === 'youtube' ? 'active' : ''}`} onClick={() => setAddTab('youtube')}><FiYoutube size={15}/> YouTube</button>
                  <button className={`tab-btn ${addTab === 'drive' ? 'active' : ''}`} onClick={() => setAddTab('drive')}><FiUpload size={15}/> Upload Video</button>
                </div>
                <div className="form-group">
                  <label className="form-label">Lesson Title</label>
                  <input className="form-input" placeholder="e.g. Introduction to Variables" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                </div>
                {addTab === 'youtube' ? (
                  <div className="flex gap-2">
                    <input className="form-input" placeholder="https://youtube.com/watch?v=..." value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={addYouTube}><FiPlus size={15}/> Add</button>
                  </div>
                ) : (
                  <>
                    {/* Drive connection status */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 0.875rem', background: driveConnected ? '#f0fdf4' : '#fef2f2', border: `1px solid ${driveConnected ? '#86efac' : '#fca5a5'}`, borderRadius:'var(--radius-sm)', marginBottom:'0.75rem' }}>
                      <span style={{ fontSize:'0.82rem', fontWeight:600, color: driveConnected ? '#15803d' : '#dc2626' }}>
                        {driveConnected ? '✅ Google Drive connected' : '❌ Google Drive not connected'}
                      </span>
                      <button className="btn btn-sm" style={{ background: '#4285f4', color:'white', fontSize:'0.78rem' }} onClick={connectDrive}>
                        🔗 {driveConnected ? 'Reconnect Drive' : 'Connect Drive'}
                      </button>
                    </div>

                    <div className="file-drop" onClick={() => fileInputRef.current?.click()}>
                      {videoFile
                        ? <><FiVideo size={22}/><span>{videoFile.name}</span><small>{(videoFile.size/1e6).toFixed(1)} MB — any size allowed</small></>
                        : <><FiUpload size={22}/><span>Click to select video file</span><small>MP4, WebM, MOV — no size limit</small></>}
                      <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={e => setVideoFile(e.target.files[0])} />
                    </div>

                    {uploading && (
                      <div style={{ margin: '0.5rem 0' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:'0.3rem', color:'var(--gray-600)' }}>
                          <span>Uploading to Google Drive…</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}

                    <button className="btn btn-primary" onClick={uploadDrive} disabled={uploading || !videoFile || !newTitle.trim()}>
                      {uploading
                        ? <><span className="spinner"/> Uploading {uploadProgress}%…</>
                        : <><FiUpload size={15}/> Upload to Google Drive</>}
                    </button>
                  </>
                )}
              </div>
            )}

            {content.length === 0 ? (
              <div className="tcm-empty"><FiBook size={32}/><p>No lessons yet. Add your first lesson above.</p></div>
            ) : (
              <div className="tcm-content-list">
                {content.map((item, i) => (
                  <div key={i} className="tcm-content-item">
                    <div className="tcm-lesson-num">{i + 1}</div>
                    <div className="tcm-lesson-icon">{getTypeIcon(item.type)}</div>
                    <div className="tcm-lesson-info">
                      <span className="tcm-lesson-title">{item.title}</span>
                      <span className="tcm-lesson-type">{getTypeLabel(item.type)}</span>
                    </div>
                    <div className="tcm-lesson-actions">
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary"><FiExternalLink size={13}/></a>
                      )}
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }} onClick={() => removeContent(i)}>
                        <FiTrash2 size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Sessions Section */}
          <div className="tcm-section card">
            <div className="tcm-section-header">
              <h2><FiMonitor size={18}/> Live Sessions &amp; Recordings <span className="badge badge-danger">{sessions.length}</span></h2>
              <Link to={`/teacher/live?course=${courseId}`} className="btn btn-danger btn-sm"><FiPlay size={14}/> Start Live</Link>
            </div>
            {sessions.length === 0 ? (
              <div className="tcm-empty"><FiMonitor size={32}/><p>No live sessions yet. Go live to start teaching!</p></div>
            ) : (
              <div className="tcm-sessions-list">
                {sessions.map((session, i) => (
                  <div key={session.id} className={`tcm-session-item ${session.isLive ? 'is-live' : ''}`}>
                    <div className="tcm-session-icon">
                      {session.isLive ? <div className="live-dot"/> : <FiMonitor size={18} color="#ef4444"/>}
                    </div>
                    <div className="tcm-session-info">
                      <span className="tcm-session-title">{session.title || `Live Session ${sessions.length - i}`}</span>
                      <span className="tcm-session-date text-muted text-xs">
                        {formatDate(session.startedAt)}{session.hasRecording ? ' · Recording saved' : ''}
                      </span>
                    </div>
                    <div className="tcm-session-badges">
                      {session.isLive && <span className="badge badge-danger">LIVE</span>}
                      {session.hasRecording && <span className="badge badge-success">REC</span>}
                    </div>
                    {session.hasRecording && session.recordingUrl && (
                      <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary"><FiPlay size={13}/> View</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Coupon Codes Section */}
          <div className="tcm-section card">
            <div className="tcm-section-header">
              <h2><FiTag size={18}/> Coupon Codes <span className="badge badge-primary">{coupons.length}</span></h2>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCouponPanel(!showCouponPanel)}>
                {showCouponPanel ? <><FiX size={14}/> Cancel</> : <><FiPlus size={14}/> Add Coupon</>}
              </button>
            </div>

            {showCouponPanel && (
              <div className="tcm-add-panel">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Coupon Code</label>
                    <input className="form-input" placeholder="e.g. SAVE50" value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discount Type</label>
                    <select className="form-input" value={couponType} onChange={e => setCouponType(e.target.value)}>
                      <option value="percent">Percentage (%)</option>
                      <option value="flat">Flat Amount (₹)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discount Value</label>
                    <input className="form-input" type="number" min={1}
                      placeholder={couponType === 'percent' ? 'e.g. 20 (%)' : 'e.g. 500 (₹)'}
                      value={couponValue} onChange={e => setCouponValue(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Uses (optional)</label>
                    <input className="form-input" type="number" min={1} placeholder="Unlimited"
                      value={couponMaxUses} onChange={e => setCouponMaxUses(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={addCoupon}>
                  <FiPlus size={15}/> Create Coupon
                </button>
              </div>
            )}

            {coupons.length === 0 ? (
              <div className="tcm-empty"><FiTag size={32}/><p>No coupons yet. Create discount codes for your students.</p></div>
            ) : (
              <div className="tcm-content-list">
                {coupons.map(coupon => (
                  <div key={coupon.id} className="tcm-content-item">
                    <div className="tcm-lesson-icon" style={{ background: 'rgba(108,99,255,0.08)', padding: '0.375rem', borderRadius: '6px' }}>
                      <FiTag size={15} color="var(--primary)"/>
                    </div>
                    <div className="tcm-lesson-info">
                      <span className="tcm-lesson-title" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{coupon.code}</span>
                      <span className="tcm-lesson-type">
                        {coupon.type === 'percent' ? `${coupon.value}% off` : `₹${coupon.value} off`}
                        {coupon.maxUses ? ` · ${coupon.usedCount || 0}/${coupon.maxUses} used` : ` · ${coupon.usedCount || 0} used`}
                      </span>
                    </div>
                    <span className={`badge ${coupon.isActive ? 'badge-success' : 'badge-secondary'}`}>
                      {coupon.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <div className="tcm-lesson-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => toggleCoupon(coupon)}>
                        {coupon.isActive ? <FiEyeOff size={13}/> : <FiEye size={13}/>}
                      </button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }} onClick={() => deleteCoupon(coupon.id)}>
                        <FiTrash2 size={13}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="tcm-sidebar">
          <div className="card tcm-stat-card">
            <h3>Course Stats</h3>
            <div className="tcm-stat-item"><FiUsers size={16} className="text-primary"/><span>{course.enrolledCount || 0} Students Enrolled</span></div>
            <div className="tcm-stat-item"><FiVideo size={16} style={{ color: '#f59e0b' }}/><span>{content.length} Total Lessons</span></div>
            <div className="tcm-stat-item"><FiMonitor size={16} style={{ color: '#ef4444' }}/><span>{sessions.length} Live Sessions</span></div>
            <div className="tcm-stat-item"><FiCheck size={16} style={{ color: '#22c55e' }}/><span>{sessions.filter(s => s.hasRecording).length} Recordings</span></div>
            <div className="tcm-stat-item"><FiTag size={16} style={{ color: 'var(--primary)' }}/><span>{coupons.filter(c => c.isActive).length} Active Coupons</span></div>
          </div>

          <div className="card tcm-info-card">
            <h3>Course Details</h3>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Category</span><span className="tcm-detail-val">{course.category}</span></div>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Level</span><span className="tcm-detail-val" style={{ textTransform: 'capitalize' }}>{course.level}</span></div>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Language</span><span className="tcm-detail-val">{course.language}</span></div>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Duration</span><span className="tcm-detail-val">{course.duration || '—'}</span></div>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Price</span><span className="tcm-detail-val">{course.price === 0 || !course.price ? 'Free' : `₹${course.price}`}</span></div>
            <div className="tcm-detail-row"><span className="tcm-detail-label">Status</span>
              <span className={`badge ${course.isPublished ? 'badge-success' : 'badge-warning'}`}>
                {course.isPublished ? 'Published' : 'Draft'}
              </span>
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>Quick Actions</h3>
            <div className="flex flex-col gap-2">
              <Link to={`/teacher/live?course=${courseId}`} className="btn btn-danger w-full">
                <FiPlay size={15}/> Start Live Class
              </Link>
              <button className={`btn w-full ${course.isPublished ? 'btn-secondary' : 'btn-success'}`} onClick={togglePublish} disabled={saving}>
                {course.isPublished ? <><FiEyeOff size={15}/> Unpublish</> : <><FiGlobe size={15}/> Publish Course</>}
              </button>
              <button className="btn btn-secondary w-full" onClick={() => setEditMode(true)}>
                <FiEdit3 size={15}/> Edit Info
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherCourseManage;
