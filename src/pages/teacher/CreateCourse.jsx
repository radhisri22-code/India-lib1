import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, addDoc, serverTimestamp, doc, updateDoc, arrayUnion
} from 'firebase/firestore';
import {
  FiUpload, FiYoutube, FiVideo, FiBook, FiDollarSign,
  FiImage, FiPlus, FiTrash2, FiCheck, FiLink
} from 'react-icons/fi';
import { db } from '../../firebase/config';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { uploadVideoToDrive } from '../../firebase/googleDrive';
import './CreateCourse.css';

const CATEGORIES = ['Programming', 'Design', 'Business', 'Marketing', 'Music', 'Photography', 'Health', 'Language', 'Science', 'Math', 'History', 'Other'];

const CreateCourse = () => {
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);
  const thumbnailRef = useRef();

  const [courseData, setCourseData] = useState({
    title: '',
    description: '',
    category: '',
    price: 0,
    duration: '',
    level: 'beginner',
    language: 'English',
    thumbnail: '',
    isPublished: false
  });

  const [content, setContent] = useState([]); // array of { type: 'video'|'youtube'|'upload', title, url, driveId }
  const [newContent, setNewContent] = useState({ type: 'youtube', title: '', url: '' });
  const [videoFile, setVideoFile] = useState(null);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setCourseData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleThumbnail = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setThumbnailPreview(preview);
    // Upload thumbnail to Firebase Storage
    const sRef = storageRef(storage, `thumbnails/${currentUser.uid}/${Date.now()}_${file.name}`);
    const task = uploadBytesResumable(sRef, file);
    task.on('state_changed', null, null, async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      setCourseData(prev => ({ ...prev, thumbnail: url }));
      toast('Thumbnail uploaded!', 'success');
    });
  };

  const handleAddYouTube = () => {
    if (!newContent.title || !newContent.url) { toast('Title and URL required', 'error'); return; }
    let url = newContent.url;
    // Extract YouTube embed URL
    const ytRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(ytRegex);
    if (!match) { toast('Invalid YouTube URL', 'error'); return; }
    const videoId = match[1];
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    setContent(prev => [...prev, { type: 'youtube', title: newContent.title, url: embedUrl, videoId, order: prev.length }]);
    setNewContent({ type: 'youtube', title: '', url: '' });
    toast('YouTube video added!', 'success');
  };

  const handleVideoUpload = async () => {
    if (!videoFile || !newContent.title) { toast('Select a video file and add a title', 'error'); return; }
    setLoading(true);
    setUploadProgress(0);
    try {
      // Upload to Google Drive (same account: hackthetech0000@gmail.com)
      toast('Connecting to Google Drive...', 'info');
      const result = await uploadVideoToDrive(
        videoFile,
        `${currentUser.uid}_${Date.now()}_${videoFile.name}`,
        (p) => setUploadProgress(p)
      );
      setContent(prev => [...prev, {
        type: 'drive',
        title: newContent.title,
        url: result.embedLink,
        driveId: result.fileId,
        directLink: result.directLink,
        order: prev.length
      }]);
      setNewContent({ type: 'youtube', title: '', url: '' });
      setVideoFile(null);
      setUploadProgress(0);
      toast('Video uploaded successfully!', 'success');
    } catch (err) {
      toast('Video upload failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const removeContent = (index) => {
    setContent(prev => prev.filter((_, i) => i !== index));
  };

  const saveCourse = async () => {
    if (!courseData.title || !courseData.description || !courseData.category) {
      toast('Please fill all required fields', 'error');
      return;
    }
    setLoading(true);
    try {
      const courseDoc = {
        ...courseData,
        teacherId: currentUser.uid,
        teacherName: userProfile?.displayName || currentUser.email,
        content,
        contentCount: content.length,
        enrolledCount: 0,
        liveSessionCount: 0,
        rating: 0,
        ratingCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'courses'), courseDoc);
      // Update user's createdCourses
      await updateDoc(doc(db, 'users', currentUser.uid), {
        createdCourses: arrayUnion(docRef.id)
      });
      toast('Course created successfully!', 'success');
      navigate(`/teacher/courses/${docRef.id}`);
    } catch (err) {
      toast('Failed to create course: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-course">
      <div className="create-course-header">
        <h1>Create New Course</h1>
        <div className="steps">
          {['Basic Info', 'Content', 'Publish'].map((label, i) => (
            <div key={i} className={`step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
              <div className="step-num">{step > i + 1 ? <FiCheck size={14} /> : i + 1}</div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="step-content card">
          <h2>Course Information</h2>

          <div className="thumb-upload" onClick={() => thumbnailRef.current?.click()}>
            {thumbnailPreview
              ? <img src={thumbnailPreview} alt="thumbnail" />
              : <div className="thumb-placeholder-upload"><FiImage size={32} /><span>Upload Thumbnail</span></div>}
            <input ref={thumbnailRef} type="file" accept="image/*" hidden onChange={handleThumbnail} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Course Title *</label>
              <input name="title" type="text" className="form-input"
                placeholder="e.g., Complete Python Bootcamp" value={courseData.title} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select name="category" className="form-input" value={courseData.category} onChange={handleChange}>
                <option value="">Select category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea name="description" className="form-input" rows={4}
              placeholder="What will students learn in this course?"
              value={courseData.description} onChange={handleChange} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Level</label>
              <select name="level" className="form-input" value={courseData.level} onChange={handleChange}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Language</label>
              <input name="language" type="text" className="form-input"
                placeholder="e.g., English, Hindi" value={courseData.language} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Duration</label>
              <input name="duration" type="text" className="form-input"
                placeholder="e.g., 10 hours" value={courseData.duration} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label"><FiDollarSign size={14} /> Price (₹)</label>
              <input name="price" type="number" className="form-input"
                placeholder="0 for free" value={courseData.price} onChange={handleChange} min={0} />
            </div>
          </div>

          <div className="step-actions">
            <button className="btn btn-primary" onClick={() => {
              if (!courseData.title || !courseData.description || !courseData.category) {
                toast('Fill required fields', 'error'); return;
              }
              setStep(2);
            }}>
              Next: Add Content →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Content */}
      {step === 2 && (
        <div className="step-content card">
          <h2>Add Course Content</h2>
          <p className="text-muted text-sm">Add YouTube links or upload your own videos</p>

          {/* Content Type Tabs */}
          <div className="content-tabs">
            <button
              className={`tab-btn ${newContent.type === 'youtube' ? 'active' : ''}`}
              onClick={() => setNewContent(p => ({ ...p, type: 'youtube' }))}
            >
              <FiYoutube size={16} /> YouTube Link
            </button>
            <button
              className={`tab-btn ${newContent.type === 'upload' ? 'active' : ''}`}
              onClick={() => setNewContent(p => ({ ...p, type: 'upload' }))}
            >
              <FiUpload size={16} /> Upload Video
            </button>
          </div>

          <div className="add-content-form">
            <div className="form-group">
              <label className="form-label">Lesson Title</label>
              <input type="text" className="form-input" placeholder="e.g., Introduction to Variables"
                value={newContent.title} onChange={e => setNewContent(p => ({ ...p, title: e.target.value }))} />
            </div>

            {newContent.type === 'youtube' ? (
              <div className="form-group">
                <label className="form-label"><FiYoutube size={14} /> YouTube URL</label>
                <div className="input-row">
                  <input type="url" className="form-input" placeholder="https://youtube.com/watch?v=..."
                    value={newContent.url} onChange={e => setNewContent(p => ({ ...p, url: e.target.value }))} />
                  <button className="btn btn-primary" onClick={handleAddYouTube}>
                    <FiPlus size={16} /> Add
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label"><FiVideo size={14} /> Video File</label>
                <div className="file-drop" onClick={() => document.getElementById('videoInput').click()}>
                  {videoFile
                    ? <><FiVideo size={24} /><span>{videoFile.name}</span><small>{(videoFile.size / 1e6).toFixed(1)} MB</small></>
                    : <><FiUpload size={24} /><span>Click to select video</span><small>MP4, WebM, MOV supported</small></>}
                  <input id="videoInput" type="file" accept="video/*" hidden
                    onChange={e => setVideoFile(e.target.files[0])} />
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="progress-bar" style={{ marginTop: '0.75rem' }}>
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                <button className="btn btn-primary" onClick={handleVideoUpload} disabled={loading || !videoFile}>
                  {loading ? <><span className="spinner" /> Uploading {uploadProgress}%...</> : <><FiUpload size={16} /> Upload to Drive</>}
                </button>
              </div>
            )}
          </div>

          {/* Content List */}
          {content.length > 0 && (
            <div className="content-list">
              <h3>Added Content ({content.length})</h3>
              {content.map((item, i) => (
                <div key={i} className="content-item">
                  <div className="content-type-icon">
                    {item.type === 'youtube' ? <FiYoutube size={16} color="#ff0000" />
                      : item.type === 'drive' ? <FiVideo size={16} color="#4285f4" />
                        : <FiVideo size={16} color="#6c63ff" />}
                  </div>
                  <div className="content-item-info">
                    <span className="font-medium text-sm">{item.title}</span>
                    <span className="text-xs text-muted">{item.type === 'youtube' ? 'YouTube' : item.type === 'drive' ? 'Google Drive' : 'Firebase Storage'}</span>
                  </div>
                  <span className="badge badge-primary">#{i + 1}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => removeContent(i)}>
                    <FiTrash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="step-actions">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Publish →</button>
          </div>
        </div>
      )}

      {/* Step 3: Publish */}
      {step === 3 && (
        <div className="step-content card">
          <h2>Review & Publish</h2>

          <div className="review-grid">
            <div className="review-item">
              <span className="review-label">Title</span>
              <span className="review-value">{courseData.title}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Category</span>
              <span className="review-value">{courseData.category}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Level</span>
              <span className="review-value" style={{ textTransform: 'capitalize' }}>{courseData.level}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Price</span>
              <span className="review-value">{courseData.price === 0 ? 'Free' : `₹${courseData.price}`}</span>
            </div>
            <div className="review-item">
              <span className="review-label">Content</span>
              <span className="review-value">{content.length} lessons</span>
            </div>
            <div className="review-item">
              <span className="review-label">Language</span>
              <span className="review-value">{courseData.language}</span>
            </div>
          </div>

          <div className="publish-toggle">
            <label className="toggle-label">
              <input type="checkbox" name="isPublished" checked={courseData.isPublished}
                onChange={handleChange} className="toggle-input" />
              <span className="toggle-switch" />
              <span>Publish immediately (students can see and enroll)</span>
            </label>
          </div>

          <div className="step-actions">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-success" onClick={saveCourse} disabled={loading}>
              {loading ? <span className="spinner" /> : <><FiCheck size={16} /> Create Course</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateCourse;
