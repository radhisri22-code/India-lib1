import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ref as dbRef, push, onValue, off, set, update, remove
} from 'firebase/database';
import {
  doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp, getDocs, query, where
} from 'firebase/firestore';
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiMonitor,
  FiUsers, FiMessageSquare, FiEdit3, FiStopCircle, FiSend,
  FiTrash2, FiSlash, FiX, FiVolume2, FiVolumeX, FiBook,
  FiSquare, FiPhoneOff
} from 'react-icons/fi';
import { rtdb, db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { uploadBlobToDrive } from '../../firebase/googleDrive';
import Notepad from '../../components/shared/Notepad';
import Whiteboard from '../../components/shared/Whiteboard';
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
  const [searchParams] = useSearchParams();
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
  const [chatOpen,      setChatOpen]      = useState(true);
  const [notepadOpen,   setNotepadOpen]   = useState(false);
  const [whiteboardOn,  setWhiteboardOn]  = useState(false);
  const [chatMuted,     setChatMuted]     = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [newMsg,        setNewMsg]        = useState('');
  const [viewerCount,   setViewerCount]   = useState(0);
  const [myCourses,     setMyCourses]     = useState([]);
  const [sessionInfo,   setSessionInfo]   = useState(null);
  const [selectedCourse,setSelectedCourse]= useState(courseId || searchParams.get('course') || '');
  const [loadingCourses,setLoadingCourses]= useState(false);
  const [ending,        setEnding]        = useState(false);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const localVideoRef    = useRef(null);
  const screenVideoRef   = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunks   = useRef([]);
  const recordingTimer   = useRef(null);
  const chatBottomRef    = useRef(null);
  const mediaStarted     = useRef(false);  // guard for isTeacher timing fix

  const chatRef    = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/chat`)    : null;
  const viewersRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/viewers`) : null;

  // ─── Fix: wait for isTeacher to become true before starting media ─────────
  useEffect(() => {
    if (isTeacher && !mediaStarted.current) {
      mediaStarted.current = true;
      startLocalMedia();
    }
  }, [isTeacher]); // re-runs when userProfile loads and isTeacher becomes true

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAll();
  }, []); // eslint-disable-line

  // Assign local camera stream to video element
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Assign screen stream to video element
  useEffect(() => {
    if (screenStream && screenVideoRef.current) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  // ─── Load teacher's courses (for setup page) ──────────────────────────────
  useEffect(() => {
    if (isTeacher && !sessionId && currentUser) fetchMyCourses();
  }, [isTeacher, sessionId, currentUser]); // eslint-disable-line

  const fetchMyCourses = async () => {
    setLoadingCourses(true);
    try {
      const q = query(collection(db, 'courses'), where('teacherId', '==', currentUser.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMyCourses(list);
      if (list.length > 0 && !selectedCourse) setSelectedCourse(list[0].id);
    } catch (e) {
      toast('Could not load courses: ' + e.message, 'error');
    } finally {
      setLoadingCourses(false);
    }
  };

  // ─── Load session info ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const ref = dbRef(rtdb, `liveSessions/${sessionId}`);
    onValue(ref, snap => setSessionInfo(snap.val()));
    return () => off(ref);
  }, [sessionId]);

  // ─── Start camera + mic ───────────────────────────────────────────────────
  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
    } catch (err) {
      toast('Camera/Mic access denied: ' + err.message, 'error');
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
        title:       `Live Class – ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}`
      };
      const docRef = await addDoc(collection(db, `courses/${selectedCourse}/liveSessions`), data);
      await set(dbRef(rtdb, `liveSessions/${docRef.id}`), {
        ...data,
        startedAt: Date.now(),
        isLive:    true,
        chatMuted: false
      });
      toast('Live session started! 🎉', 'success');
      navigate(`/teacher/live/${selectedCourse}/${docRef.id}`);
    } catch (err) {
      toast('Failed to start: ' + err.message, 'error');
    }
  };

  // ─── End live session ─────────────────────────────────────────────────────
  const endLiveSession = async () => {
    if (!sessionId || ending) return;
    if (!window.confirm('End the live class for everyone?')) return;
    setEnding(true);
    try {
      if (recording) await stopRecording();
      await update(dbRef(rtdb, `liveSessions/${sessionId}`), { isLive: false, endedAt: Date.now() });
      await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
        isLive: false, endedAt: serverTimestamp()
      });
      stopAll();
      toast('Live class ended', 'info');
      navigate(`/teacher/courses/${courseId}`);
    } catch (err) {
      toast('Error ending: ' + err.message, 'error');
      setEnding(false);
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

  const toggleWhiteboard = () => {
    setWhiteboardOn(w => !w);
    if (screenOn) {
      // turn off screen share when switching to whiteboard
      screenStream?.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setScreenOn(false);
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
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') { resolve(); return; }
    clearInterval(recordingTimer.current);
    setRecordingTime(0);
    mediaRecorderRef.current.onstop = async () => {
      if (recordedChunks.current.length > 0) {
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        await saveRecording(blob);
      }
      resolve();
    };
    mediaRecorderRef.current.stop();
    setRecording(false);
  });

  const saveRecording = async (blob) => {
    setSaving(true);
    const fileName = `recording_${courseId}_${Date.now()}.webm`;
    toast('Saving recording to Google Drive…', 'info');
    try {
      const result = await uploadBlobToDrive(blob, fileName, p => {
        if (p === 100) toast('Upload complete!', 'success');
      });
      if (courseId && sessionId) {
        await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
          recordingUrl:  result.embedLink,
          recordingName: fileName,
          hasRecording:  true
        });
      }
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
  }, [sessionId]); // eslint-disable-line

  // Viewers
  useEffect(() => {
    if (!viewersRef || !sessionId || !currentUser) return;
    const myRef = dbRef(rtdb, `liveSessions/${sessionId}/viewers/${currentUser.uid}`);
    set(myRef, { name: userProfile?.displayName, joinedAt: Date.now() });
    onValue(viewersRef, snap => setViewerCount(snap.numChildren()));
    return () => { remove(myRef); off(viewersRef); };
  }, [sessionId]); // eslint-disable-line

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
          <p>Students enrolled in your course will see a Live banner instantly</p>

          {/* Camera preview */}
          <div className="camera-preview">
            <video ref={localVideoRef} autoPlay muted playsInline className="preview-video" />
            {!localStream && (
              <div className="cam-waiting">
                <span>📷 Waiting for camera…</span>
                <button className="btn btn-outline btn-sm" onClick={startLocalMedia}>
                  Allow Camera &amp; Mic
                </button>
              </div>
            )}
          </div>

          {/* Select Course */}
          <div className="form-group" style={{ width: '100%', textAlign: 'left' }}>
            <label className="form-label"><FiBook size={14} /> Select Course</label>
            {loadingCourses ? (
              <div className="flex items-center gap-2"><span className="spinner" /> Loading courses…</div>
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

          {/* Pre-check controls */}
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
            🔴 Go Live Now
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIVE ROOM
  // ─────────────────────────────────────────────────────────────────────────
  const courseTitle = sessionInfo?.title || 'Live Class';

  return (
    <div className="live-room">
      {/* ── Main area ── */}
      <div className="live-main">

        {/* Session info bar */}
        <div className="session-info-bar">
          <div className="session-live-tag"><div className="live-dot" /> LIVE</div>
          <div className="session-title">{courseTitle}</div>
          {sessionInfo?.teacherName && (
            <div className="session-teacher">by {sessionInfo.teacherName}</div>
          )}
          <div className="session-viewers"><FiUsers size={13} /> {viewerCount} watching</div>
          {recording && (
            <div className="session-rec-tag"><div className="live-dot" /> REC {fmt(recordingTime)}</div>
          )}
          {saving && <div className="session-rec-tag" style={{ background: 'rgba(234,179,8,0.2)', color:'#eab308' }}>💾 Saving…</div>}
        </div>

        {/* ── Video Stage ── */}
        <div className="video-stage">
          {/* Whiteboard mode */}
          {whiteboardOn && isTeacher && (
            <div className="whiteboard-stage">
              <Whiteboard sessionId={sessionId} readOnly={false} />
            </div>
          )}

          {/* Student whiteboard view */}
          {whiteboardOn && !isTeacher && (
            <div className="whiteboard-stage">
              <Whiteboard sessionId={sessionId} readOnly={true} />
            </div>
          )}

          {/* Screen share */}
          {!whiteboardOn && screenOn && (
            <div className="screen-container">
              <video ref={screenVideoRef} autoPlay playsInline className="screen-video" />
              <div className="screen-label"><FiMonitor size={14} /> Screen Share</div>
            </div>
          )}

          {/* Camera (full when no screen/whiteboard, PiP when screen sharing) */}
          {!whiteboardOn && (
            <div className={`cam-container ${screenOn ? 'pip' : 'full'}`}>
              {isTeacher
                ? <video ref={localVideoRef} autoPlay muted playsInline className="cam-video" />
                : <div className="remote-placeholder">
                    <div className="teacher-avatar">{sessionInfo?.teacherName?.[0]?.toUpperCase() || 'T'}</div>
                    <p>{sessionInfo?.teacherName || 'Teacher'}</p>
                  </div>
              }
            </div>
          )}

          {/* Camera PiP over whiteboard */}
          {whiteboardOn && isTeacher && localStream && (
            <div className="cam-container pip">
              <video ref={localVideoRef} autoPlay muted playsInline className="cam-video" />
            </div>
          )}
        </div>

        {/* ── Teacher Controls ── */}
        {isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <button className={`ctrl-btn ${micOn ? '' : 'off'}`} onClick={toggleMic} title="Toggle Mic">
                {micOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
                <span>{micOn ? 'Mic' : 'Muted'}</span>
              </button>
              <button className={`ctrl-btn ${camOn ? '' : 'off'}`} onClick={toggleCam} title="Toggle Camera">
                {camOn ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
                <span>{camOn ? 'Camera' : 'Cam Off'}</span>
              </button>
              <button className={`ctrl-btn ${screenOn ? 'active' : ''}`} onClick={toggleScreen} title="Share Screen">
                <FiMonitor size={20} style={screenOn ? { color: '#a78bfa' } : {}} />
                <span>{screenOn ? 'Stop Share' : 'Screen'}</span>
              </button>
              <button className={`ctrl-btn ${whiteboardOn ? 'active' : ''}`} onClick={toggleWhiteboard} title="Whiteboard">
                <span style={{ fontSize: '1.1rem' }}>🖊</span>
                <span>{whiteboardOn ? 'Close Board' : 'Whiteboard'}</span>
              </button>
              <button
                className={`ctrl-btn ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                title={recording ? 'Stop Recording' : 'Start Recording'}
              >
                {recording
                  ? <><FiSquare size={20} /><span>Stop {fmt(recordingTime)}</span></>
                  : <><span style={{ fontSize: '0.9rem' }}>⏺</span><span>Record</span></>
                }
              </button>
            </div>

            <div className="controls-center">
              <button className={`ctrl-btn ${notepadOpen ? 'active' : ''}`} onClick={() => setNotepadOpen(!notepadOpen)}>
                <FiEdit3 size={20} /><span>Notes</span>
              </button>
              <button className={`ctrl-btn ${chatMuted ? 'off' : ''}`} onClick={toggleChatMute}>
                {chatMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
                <span>{chatMuted ? 'Unmute Chat' : 'Mute Chat'}</span>
              </button>
              <button className={`ctrl-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}>
                <FiMessageSquare size={20} /><span>Chat</span>
              </button>
            </div>

            <div className="controls-right">
              <button
                className="ctrl-btn end-btn"
                onClick={endLiveSession}
                disabled={ending}
                title="End Live Class"
              >
                <FiPhoneOff size={20} />
                <span>{ending ? 'Ending…' : 'End Class'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Student bar ── */}
        {!isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <div className="live-info">
                <div className="live-dot" />
                <span>Watching Live</span>
              </div>
            </div>
            <div className="controls-right">
              <button className={`ctrl-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}>
                <FiMessageSquare size={20} /><span>Chat</span>
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
              {chatMuted && <span className="badge badge-warning" style={{ fontSize:'0.65rem' }}>Muted</span>}
            </div>
            {isTeacher && (
              <button className="btn btn-sm btn-secondary" onClick={toggleChatMute} title={chatMuted ? 'Unmute chat' : 'Mute chat'}>
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
              <div
                key={msg.id}
                className={`chat-msg ${msg.senderId === currentUser?.uid ? 'mine' : ''} ${msg.isTeacher ? 'teacher-msg' : ''}`}
              >
                <div className="msg-header">
                  <div className="avatar avatar-sm" style={{ background: msg.isTeacher ? 'var(--primary)' : 'var(--secondary)' }}>
                    {msg.senderName?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="msg-name">{msg.senderName}</span>
                  {msg.isTeacher && <span className="badge badge-primary" style={{ fontSize:'0.6rem' }}>Teacher</span>}
                  <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</span>
                </div>
                <div className="msg-body">{msg.text}</div>
                {isTeacher && msg.senderId !== currentUser?.uid && (
                  <div className="msg-actions">
                    <button className="msg-action-btn danger" title="Delete message" onClick={() => deleteMessage(msg.id)}>
                      <FiTrash2 size={12} />
                    </button>
                    <button className="msg-action-btn danger" title="Block user" onClick={() => blockUser(msg.senderId, msg.senderName)}>
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
                  placeholder="Type a message…"
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
