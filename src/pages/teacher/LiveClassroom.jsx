import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ref as dbRef, push, onValue, off, set, update, remove
} from 'firebase/database';
import {
  doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp, getDocs, query, where
} from 'firebase/firestore';
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiMonitor,
  FiUsers, FiMessageSquare, FiEdit3, FiStopCircle, FiSend,
  FiTrash2, FiSlash, FiX, FiVolume2, FiVolumeX, FiPlay, FiBook
} from 'react-icons/fi';
import { rtdb, db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { uploadBlobToDrive } from '../../firebase/googleDrive';
import Notepad from '../../components/shared/Notepad';
import './LiveClassroom.css';

// Safe MediaRecorder mimeType
const getSupportedMimeType = () => {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
};

const LiveClassroom = ({ isTeacher: isTeacherMode = false }) => {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const isTeacher = isTeacherMode || userProfile?.role === 'teacher';

  // ─── Media state ───────────────────────────────────────────────────────────
  const [localStream,  setLocalStream]  = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [screenOn,     setScreenOn]     = useState(false);
  const [recording,    setRecording]    = useState(false);
  const [recordingTime,setRecordingTime]= useState(0);
  const [saving,       setSaving]       = useState(false);

  // ─── UI state ──────────────────────────────────────────────────────────────
  const [chatOpen,     setChatOpen]     = useState(true);
  const [notepadOpen,  setNotepadOpen]  = useState(false);
  const [chatMuted,    setChatMuted]    = useState(false);
  const [messages,     setMessages]     = useState([]);
  const [newMsg,       setNewMsg]       = useState('');
  const [viewerCount,  setViewerCount]  = useState(0);
  const [myCourses,    setMyCourses]    = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(courseId || '');
  const [loadingCourses,  setLoadingCourses] = useState(false);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);
  const screenVideoRef  = useRef(null);
  const mediaRecorderRef= useRef(null);
  const recordedChunks  = useRef([]);
  const recordingTimer  = useRef(null);
  const chatBottomRef   = useRef(null);

  const chatRef    = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/chat`)    : null;
  const viewersRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/viewers`) : null;

  // ─── Load teacher's courses (for setup page) ──────────────────────────────
  useEffect(() => {
    if (isTeacher && !sessionId) fetchMyCourses();
  }, [isTeacher, sessionId]);

  const fetchMyCourses = async () => {
    setLoadingCourses(true);
    try {
      const q = query(collection(db, 'courses'), where('teacherId', '==', currentUser.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyCourses(list);
      if (list.length > 0 && !selectedCourse) setSelectedCourse(list[0].id);
    } catch (e) {
      toast('Could not load courses: ' + e.message, 'error');
    } finally {
      setLoadingCourses(false);
    }
  };

  // ─── Start camera + mic ───────────────────────────────────────────────────
  useEffect(() => {
    if (isTeacher) startLocalMedia();
    return stopAll;
  }, []);

  // Assign stream to video element whenever stream changes
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (screenStream && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
    } catch (err) {
      toast('Camera/Mic: ' + err.message, 'error');
    }
  };

  // ─── Start live session ───────────────────────────────────────────────────
  const startLiveSession = async () => {
    if (!selectedCourse) { toast('Please select a course first', 'error'); return; }
    try {
      const data = {
        courseId:    selectedCourse,
        teacherId:   currentUser.uid,
        teacherName: userProfile?.displayName || currentUser.email,
        startedAt:   serverTimestamp(),
        isLive:      true,
        chatMuted:   false,
        title:       `Live Class - ${new Date().toLocaleDateString('en-IN')}`
      };
      const docRef = await addDoc(collection(db, `courses/${selectedCourse}/liveSessions`), data);
      await set(dbRef(rtdb, `liveSessions/${docRef.id}`), {
        ...data,
        startedAt: Date.now(),
        isLive: true,
        chatMuted: false
      });
      toast('Live session started! 🎉', 'success');
      navigate(`/live/${selectedCourse}/${docRef.id}`);
    } catch (err) {
      toast('Failed to start: ' + err.message, 'error');
    }
  };

  // ─── End live session ─────────────────────────────────────────────────────
  const endLiveSession = async () => {
    if (!sessionId) return;
    try {
      if (recording) await stopRecording();
      await update(dbRef(rtdb, `liveSessions/${sessionId}`), { isLive: false, endedAt: Date.now() });
      await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
        isLive: false, endedAt: serverTimestamp()
      });
      stopAll();
      toast('Live session ended', 'info');
      navigate(`/teacher/courses/${courseId}`);
    } catch (err) {
      toast('Error ending: ' + err.message, 'error');
    }
  };

  // ─── Media controls ───────────────────────────────────────────────────────
  const toggleMic = () => {
    const track = localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const toggleCam = () => {
    const track = localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  };

  const toggleScreen = async () => {
    if (screenOn) {
      screenStream?.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setScreenOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        setScreenStream(stream);
        setScreenOn(true);
        stream.getVideoTracks()[0].onended = () => { setScreenStream(null); setScreenOn(false); };
      } catch (err) {
        if (err.name !== 'NotAllowedError') toast('Screen share failed: ' + err.message, 'error');
      }
    }
  };

  // ─── Recording ────────────────────────────────────────────────────────────
  const startRecording = () => {
    const stream = screenStream || localStream;
    if (!stream) { toast('No stream to record', 'error'); return; }

    const mimeType = getSupportedMimeType();
    try {
      recordedChunks.current = [];
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setRecording(true);

      let t = 0;
      recordingTimer.current = setInterval(() => setRecordingTime(++t), 1000);
      toast('Recording started ⏺', 'info');
    } catch (err) {
      toast('Recording failed: ' + err.message, 'error');
    }
  };

  const stopRecording = () => new Promise(resolve => {
    if (!mediaRecorderRef.current) { resolve(); return; }
    clearInterval(recordingTimer.current);
    setRecordingTime(0);
    mediaRecorderRef.current.onstop = async () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      await saveRecording(blob);
      resolve();
    };
    mediaRecorderRef.current.stop();
    setRecording(false);
  });

  const saveRecording = async (blob) => {
    setSaving(true);
    const fileName = `recording_${courseId}_${Date.now()}.webm`;
    toast('Saving to Google Drive...', 'info');
    try {
      const result = await uploadBlobToDrive(blob, fileName, p =>
        p === 100 && toast('Upload complete!', 'success')
      );
      await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
        recordingUrl:  result.embedLink,
        recordingName: fileName,
        hasRecording:  true
      });
      toast('Recording saved to Google Drive ✅', 'success');
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Chat ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatRef) return;
    onValue(chatRef, snap => {
      const data = snap.val();
      if (!data) { setMessages([]); return; }
      const list = Object.entries(data)
        .map(([id, m]) => ({ id, ...m }))
        .sort((a, b) => a.timestamp - b.timestamp);
      setMessages(list);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
    return () => off(chatRef);
  }, [sessionId]);

  // Viewers
  useEffect(() => {
    if (!viewersRef || !sessionId || !currentUser) return;
    const myRef = dbRef(rtdb, `liveSessions/${sessionId}/viewers/${currentUser.uid}`);
    set(myRef, { name: userProfile?.displayName, joinedAt: Date.now() });
    onValue(viewersRef, snap => setViewerCount(snap.numChildren()));
    return () => { remove(myRef); off(viewersRef); };
  }, [sessionId]);

  // Chat mute sync
  useEffect(() => {
    if (!sessionId) return;
    const ref = dbRef(rtdb, `liveSessions/${sessionId}/chatMuted`);
    onValue(ref, snap => setChatMuted(snap.val() || false));
    return () => off(ref);
  }, [sessionId]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !chatRef) return;
    if (chatMuted && !isTeacher) { toast('Chat is muted by teacher', 'warning'); return; }
    await push(chatRef, {
      text:       newMsg.trim(),
      senderId:   currentUser.uid,
      senderName: userProfile?.displayName || currentUser.email,
      timestamp:  Date.now(),
      isTeacher
    });
    setNewMsg('');
  };

  const deleteMessage = async (id) => {
    if (!isTeacher) return;
    await remove(dbRef(rtdb, `liveSessions/${sessionId}/chat/${id}`));
  };

  const blockUser = async (userId, userName) => {
    if (!isTeacher) return;
    await remove(dbRef(rtdb, `liveSessions/${sessionId}/viewers/${userId}`));
    await updateDoc(doc(db, 'courses', courseId), { blockedUsers: arrayUnion(userId) });
    toast(`${userName} blocked`, 'warning');
  };

  const toggleChatMute = async () => {
    if (!isTeacher || !sessionId) return;
    const next = !chatMuted;
    await update(dbRef(rtdb, `liveSessions/${sessionId}`), { chatMuted: next });
    toast(next ? 'Chat muted for students' : 'Chat unmuted', 'info');
  };

  const stopAll = () => {
    localStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    clearInterval(recordingTimer.current);
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  // ─────────────────────────────────────────────────────────────────────────
  // TEACHER SETUP PAGE (before going live)
  // ─────────────────────────────────────────────────────────────────────────
  if (isTeacher && !sessionId) {
    return (
      <div className="live-setup">
        <div className="live-setup-card card">
          <div className="live-setup-icon">🎥</div>
          <h2>Start a Live Class</h2>
          <p>Your enrolled students will see a Live banner instantly</p>

          {/* Camera preview */}
          <div className="camera-preview">
            <video ref={localVideoRef} autoPlay muted playsInline className="preview-video" />
            {!localStream && (
              <div className="cam-waiting">
                <span>📷 Waiting for camera...</span>
                <button className="btn btn-outline btn-sm" onClick={startLocalMedia}>
                  Allow Camera
                </button>
              </div>
            )}
          </div>

          {/* Select Course */}
          <div className="form-group" style={{ width: '100%', textAlign: 'left' }}>
            <label className="form-label"><FiBook size={14} /> Select Course</label>
            {loadingCourses ? (
              <div className="flex items-center gap-2"><span className="spinner" /> Loading courses...</div>
            ) : myCourses.length === 0 ? (
              <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
                No courses found. <a href="/teacher/courses/new">Create a course first →</a>
              </div>
            ) : (
              <select
                className="form-input"
                value={selectedCourse}
                onChange={e => setSelectedCourse(e.target.value)}
              >
                {myCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            )}
          </div>

          {/* Controls */}
          <div className="live-setup-controls">
            <button className={`ctrl-btn ${micOn ? '' : 'off'}`} onClick={toggleMic}>
              {micOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
              {micOn ? 'Mic On' : 'Mic Off'}
            </button>
            <button className={`ctrl-btn ${camOn ? '' : 'off'}`} onClick={toggleCam}>
              {camOn ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
              {camOn ? 'Cam On' : 'Cam Off'}
            </button>
          </div>

          <button
            className="btn btn-danger btn-lg w-full"
            onClick={startLiveSession}
            disabled={!selectedCourse || myCourses.length === 0}
          >
            🔴 Start Live Class
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE ROOM
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="live-room">
      {/* ── Video Stage ── */}
      <div className="live-main">
        <div className="video-stage">
          {/* Screen share */}
          {screenOn && (
            <div className="screen-container">
              <video ref={screenVideoRef} autoPlay playsInline className="screen-video" />
              <div className="screen-label"><FiMonitor size={14} /> Screen Share</div>
            </div>
          )}

          {/* Camera */}
          <div className={`cam-container ${screenOn ? 'pip' : 'full'}`}>
            {isTeacher
              ? <video ref={localVideoRef} autoPlay muted playsInline className="cam-video" />
              : <div className="remote-placeholder">
                  <div className="teacher-avatar">{userProfile?.displayName?.[0] || 'T'}</div>
                  <p>Teacher's Camera</p>
                </div>}
          </div>

          {/* Badges */}
          <div className="live-badge"><div className="live-dot" /> LIVE</div>
          <div className="viewer-badge"><FiUsers size={13} /> {viewerCount}</div>
          {recording && <div className="rec-badge"><div className="live-dot" /> REC {fmt(recordingTime)}</div>}
          {saving    && <div className="rec-badge" style={{ top: '5.5rem' }}>💾 Saving...</div>}
        </div>

        {/* ── Teacher Controls ── */}
        {isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <button className={`ctrl-btn ${micOn ? '' : 'off'}`} onClick={toggleMic}>
                {micOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
              </button>
              <button className={`ctrl-btn ${camOn ? '' : 'off'}`} onClick={toggleCam}>
                {camOn ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
              </button>
              <button className={`ctrl-btn ${screenOn ? 'active' : ''}`} onClick={toggleScreen}>
                <FiMonitor size={20} style={screenOn ? { color: 'var(--danger)' } : {}} />
                {screenOn ? 'Stop Share' : 'Share Screen'}
              </button>
              <button
                className={`ctrl-btn ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <><FiStopCircle size={20} /> Stop {fmt(recordingTime)}</> : <>⏺ Record</>}
              </button>
            </div>

            <div className="controls-center">
              <button className={`ctrl-btn ${notepadOpen ? 'active' : ''}`} onClick={() => setNotepadOpen(!notepadOpen)}>
                <FiEdit3 size={20} /> Notes
              </button>
              <button className={`ctrl-btn ${chatMuted ? 'off' : ''}`} onClick={toggleChatMute}>
                {chatMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
                {chatMuted ? 'Unmute' : 'Mute Chat'}
              </button>
            </div>

            <div className="controls-right">
              <button className="ctrl-btn danger" onClick={endLiveSession}>
                <FiStopCircle size={20} /> End Class
              </button>
            </div>
          </div>
        )}

        {/* ── Student bar ── */}
        {!isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <div className="live-info"><div className="live-dot" /><span>Watching Live</span></div>
            </div>
            <div className="controls-right">
              <button className={`ctrl-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}>
                <FiMessageSquare size={20} /> Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Notepad ── */}
      {notepadOpen && isTeacher && (
        <Notepad sessionId={sessionId} onClose={() => setNotepadOpen(false)} />
      )}

      {/* ── Chat Sidebar ── */}
      {chatOpen && (
        <div className="chat-sidebar slide-in">
          <div className="chat-header">
            <div className="flex items-center gap-2">
              <FiMessageSquare size={16} />
              <span className="font-semibold">Live Chat</span>
              {chatMuted && <span className="badge badge-warning">Muted</span>}
            </div>
            {isTeacher && (
              <button className="btn btn-sm btn-secondary" onClick={toggleChatMute}>
                {chatMuted ? <FiVolume2 size={14} /> : <FiVolumeX size={14} />}
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={() => setChatOpen(false)}>
              <FiX size={16} />
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <FiMessageSquare size={24} /><p>No messages yet!</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`chat-msg ${msg.senderId === currentUser?.uid ? 'mine' : ''} ${msg.isTeacher ? 'teacher-msg' : ''}`}>
                <div className="msg-header">
                  <div className="avatar avatar-sm" style={{ background: msg.isTeacher ? 'var(--primary)' : 'var(--secondary)' }}>
                    {msg.senderName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="msg-name">{msg.senderName}</span>
                  {msg.isTeacher && <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>Teacher</span>}
                  <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="msg-body">{msg.text}</div>
                {isTeacher && msg.senderId !== currentUser?.uid && (
                  <div className="msg-actions">
                    <button className="msg-action-btn danger" onClick={() => deleteMessage(msg.id)}>
                      <FiTrash2 size={12} />
                    </button>
                    <button className="msg-action-btn danger" onClick={() => blockUser(msg.senderId, msg.senderName)}>
                      <FiSlash size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div className="chat-input-area">
            {chatMuted && !isTeacher ? (
              <div className="muted-notice"><FiVolumeX size={16} /> Chat muted by teacher</div>
            ) : (
              <div className="chat-input-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type a message..."
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                />
                <button className="btn btn-primary btn-icon" onClick={sendMessage}>
                  <FiSend size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassroom;
