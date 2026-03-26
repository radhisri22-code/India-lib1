import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ref as dbRef, push, onValue, off, set, update, remove, serverTimestamp as rtServerTimestamp
} from 'firebase/database';
import { doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiMonitor, FiMonitorOff,
  FiUsers, FiMessageSquare, FiEdit3, FiStopCircle, FiSend,
  FiTrash2, FiSlash, FiX, FiVolume2, FiVolumeX, FiMaximize,
  FiDownload, FiAlertCircle
} from 'react-icons/fi';
import { rtdb, db, storage } from '../../firebase/config';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/shared/Toast';
import { uploadBlobToDrive, signInToDrive } from '../../firebase/googleDrive';
import Notepad from '../../components/shared/Notepad';
import './LiveClassroom.css';

const LiveClassroom = ({ isTeacher: isTeacherMode = false }) => {
  const { courseId, sessionId } = useParams();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  // Media streams
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // UI state
  const [chatOpen, setChatOpen] = useState(true);
  const [notepadOpen, setNotepadOpen] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [liveSession, setLiveSession] = useState(null);

  // Refs
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const chatBottomRef = useRef(null);
  const peerConnectionsRef = useRef({});

  const isTeacher = isTeacherMode || userProfile?.role === 'teacher';
  const sessionRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}`) : null;
  const chatRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/chat`) : null;
  const viewersRef = sessionId ? dbRef(rtdb, `liveSessions/${sessionId}/viewers`) : null;

  // ─── Start Camera & Mic ────────────────────────────────────────────────────
  useEffect(() => {
    if (isTeacher) {
      startLocalMedia();
    }
    return () => {
      stopAll();
    };
  }, []);

  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      toast('Camera/Mic access denied: ' + err.message, 'error');
    }
  };

  // ─── Start Live Session (Teacher) ─────────────────────────────────────────
  const startLiveSession = async () => {
    try {
      const sessionData = {
        courseId,
        teacherId: currentUser.uid,
        teacherName: userProfile?.displayName,
        startedAt: serverTimestamp(),
        isLive: true,
        chatMuted: false,
        viewerCount: 0,
        title: `Live Class - ${new Date().toLocaleDateString()}`
      };
      const sessionDoc = await addDoc(collection(db, `courses/${courseId}/liveSessions`), sessionData);

      // Set in RTDB for real-time
      await set(dbRef(rtdb, `liveSessions/${sessionDoc.id}`), {
        ...sessionData,
        isLive: true,
        chatMuted: false,
        startedAt: Date.now()
      });

      setLiveSession({ id: sessionDoc.id, ...sessionData });
      toast('Live session started!', 'success');
      navigate(`/live/${courseId}/${sessionDoc.id}`);
    } catch (err) {
      toast('Failed to start session: ' + err.message, 'error');
    }
  };

  // ─── End Live Session (Teacher) ───────────────────────────────────────────
  const endLiveSession = async () => {
    if (!sessionId) return;
    try {
      // Stop recording if active
      if (recording) await stopRecording();

      // Mark session as ended
      await update(dbRef(rtdb, `liveSessions/${sessionId}`), { isLive: false, endedAt: Date.now() });
      await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
        isLive: false,
        endedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'courses', courseId), {
        liveSessionCount: arrayUnion(sessionId)
      });

      stopAll();
      toast('Live session ended', 'info');
      navigate(`/teacher/courses/${courseId}`);
    } catch (err) {
      toast('Error ending session: ' + err.message, 'error');
    }
  };

  // ─── Toggle Controls ───────────────────────────────────────────────────────
  const toggleMic = () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  const toggleCam = () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled); }
  };

  const toggleScreen = async () => {
    if (screenOn) {
      screenStream?.getTracks().forEach(t => t.stop());
      setScreenStream(null);
      setScreenOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        setScreenStream(stream);
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
        setScreenOn(true);
        stream.getVideoTracks()[0].onended = () => { setScreenOn(false); setScreenStream(null); };
      } catch (err) {
        if (err.name !== 'NotAllowedError') toast('Screen share failed: ' + err.message, 'error');
      }
    }
  };

  // ─── Recording ────────────────────────────────────────────────────────────
  const startRecording = () => {
    const stream = screenStream || localStream;
    if (!stream) { toast('No stream to record', 'error'); return; }

    recordedChunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.start(1000);
    mediaRecorderRef.current = mr;
    setRecording(true);

    let elapsed = 0;
    recordingTimerRef.current = setInterval(() => {
      elapsed++;
      setRecordingTime(elapsed);
    }, 1000);
    toast('Recording started', 'info');
  };

  const stopRecording = async () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) { resolve(); return; }
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        await saveRecording(blob);
        resolve();
      };
      mediaRecorderRef.current.stop();
      setRecording(false);
      setRecordingTime(0);
    });
  };

  const saveRecording = async (blob) => {
    const fileName = `recording_${courseId}_${sessionId}_${Date.now()}.webm`;
    toast('Saving recording...', 'info');
    try {
      let recordingUrl;
      try {
        await signInToDrive();
        const result = await uploadBlobToDrive(blob, fileName);
        recordingUrl = result.embedLink;
        toast('Recording saved to Google Drive!', 'success');
      } catch {
        // Fallback Firebase Storage
        const sRef = storageRef(storage, `recordings/${courseId}/${fileName}`);
        await uploadBytesResumable(sRef, blob);
        recordingUrl = await getDownloadURL(sRef);
        toast('Recording saved!', 'success');
      }
      // Save to Firestore
      await updateDoc(doc(db, `courses/${courseId}/liveSessions`, sessionId), {
        recordingUrl,
        recordingName: fileName,
        hasRecording: true
      });
    } catch (err) {
      toast('Failed to save recording: ' + err.message, 'error');
    }
  };

  // ─── Chat ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chatRef) return;
    onValue(chatRef, snap => {
      const data = snap.val();
      if (!data) { setMessages([]); return; }
      const msgs = Object.entries(data)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => a.timestamp - b.timestamp);
      setMessages(msgs);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => off(chatRef);
  }, [sessionId]);

  // Viewer count
  useEffect(() => {
    if (!viewersRef || !sessionId || !currentUser) return;
    const myViewerRef = dbRef(rtdb, `liveSessions/${sessionId}/viewers/${currentUser.uid}`);
    set(myViewerRef, { name: userProfile?.displayName, joinedAt: Date.now() });
    onValue(viewersRef, snap => setViewerCount(snap.numChildren()));
    return () => { remove(myViewerRef); off(viewersRef); };
  }, [sessionId]);

  // Chat mute state sync
  useEffect(() => {
    if (!sessionRef) return;
    onValue(dbRef(rtdb, `liveSessions/${sessionId}/chatMuted`), snap => {
      setChatMuted(snap.val() || false);
    });
  }, [sessionId]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !chatRef) return;
    if (chatMuted && !isTeacher) { toast('Chat is muted by the teacher', 'warning'); return; }
    try {
      await push(chatRef, {
        text: newMsg.trim(),
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.email,
        timestamp: Date.now(),
        isTeacher: isTeacher
      });
      setNewMsg('');
    } catch (err) {
      toast('Failed to send message', 'error');
    }
  };

  const deleteMessage = async (msgId) => {
    if (!isTeacher) return;
    await remove(dbRef(rtdb, `liveSessions/${sessionId}/chat/${msgId}`));
    toast('Message deleted', 'info');
  };

  const toggleChatMute = async () => {
    if (!isTeacher) return;
    const next = !chatMuted;
    await update(dbRef(rtdb, `liveSessions/${sessionId}`), { chatMuted: next });
    toast(next ? 'Chat muted for students' : 'Chat unmuted', 'info');
  };

  const blockUser = async (userId, userName) => {
    if (!isTeacher) return;
    // Remove from viewers
    await remove(dbRef(rtdb, `liveSessions/${sessionId}/viewers/${userId}`));
    // Add to blocked list in Firestore
    await updateDoc(doc(db, 'courses', courseId), {
      blockedUsers: arrayUnion(userId)
    });
    toast(`${userName} has been blocked`, 'warning');
  };

  // ─── Stop All ─────────────────────────────────────────────────────────────
  const stopAll = () => {
    localStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    clearInterval(recordingTimerRef.current);
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!sessionId && isTeacher) {
    return (
      <div className="live-setup">
        <div className="live-setup-card card">
          <div className="live-setup-icon">🎥</div>
          <h2>Start a Live Class</h2>
          <p>Your students will be notified when you go live</p>

          {/* Camera preview */}
          <div className="camera-preview">
            <video ref={localVideoRef} autoPlay muted playsInline className="preview-video" />
          </div>

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

          <button className="btn btn-danger btn-lg w-full" onClick={startLiveSession}>
            🔴 Start Live Class
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="live-room">
      {/* Video Area */}
      <div className="live-main">
        <div className="video-stage">
          {/* Screen share (primary) */}
          {screenOn && (
            <div className="screen-container">
              <video ref={screenVideoRef} autoPlay playsInline className="screen-video" />
              <div className="screen-label"><FiMonitor size={14} /> Screen Share</div>
            </div>
          )}

          {/* Camera feed */}
          <div className={`cam-container ${screenOn ? 'pip' : 'full'}`}>
            {isTeacher
              ? <video ref={localVideoRef} autoPlay muted playsInline className="cam-video" />
              : <div className="remote-placeholder">
                  <div className="teacher-avatar">
                    {userProfile?.displayName?.[0] || 'T'}
                  </div>
                  <p>Teacher's Camera</p>
                </div>}
          </div>

          {/* Live badge */}
          <div className="live-badge">
            <div className="live-dot" />
            LIVE
          </div>

          {/* Viewer count */}
          <div className="viewer-badge">
            <FiUsers size={13} /> {viewerCount}
          </div>

          {/* Recording indicator */}
          {recording && (
            <div className="rec-badge">
              <div className="live-dot" />
              REC {formatTime(recordingTime)}
            </div>
          )}
        </div>

        {/* Controls Bar */}
        {isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <button className={`ctrl-btn ${micOn ? '' : 'off'}`} onClick={toggleMic} title="Toggle Mic">
                {micOn ? <FiMic size={20} /> : <FiMicOff size={20} />}
              </button>
              <button className={`ctrl-btn ${camOn ? '' : 'off'}`} onClick={toggleCam} title="Toggle Camera">
                {camOn ? <FiVideo size={20} /> : <FiVideoOff size={20} />}
              </button>
              <button className={`ctrl-btn ${screenOn ? 'active' : ''}`} onClick={toggleScreen} title="Share Screen">
                {screenOn ? <FiMonitorOff size={20} /> : <FiMonitor size={20} />}
              </button>
              <button
                className={`ctrl-btn ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                title={recording ? 'Stop Recording' : 'Start Recording'}
              >
                {recording ? <FiStopCircle size={20} /> : <span style={{ fontSize: '16px' }}>⏺</span>}
                {recording ? `Stop (${formatTime(recordingTime)})` : 'Record'}
              </button>
            </div>

            <div className="controls-center">
              <button className={`ctrl-btn ${notepadOpen ? 'active' : ''}`} onClick={() => setNotepadOpen(!notepadOpen)} title="Notepad">
                <FiEdit3 size={20} /> Notes
              </button>
              <button className={`ctrl-btn ${chatMuted ? 'off' : ''}`} onClick={toggleChatMute} title="Mute/Unmute Chat">
                {chatMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
                {chatMuted ? 'Unmute Chat' : 'Mute Chat'}
              </button>
            </div>

            <div className="controls-right">
              <button className="ctrl-btn danger" onClick={endLiveSession} title="End Class">
                <FiStopCircle size={20} /> End Class
              </button>
            </div>
          </div>
        )}

        {/* Student controls */}
        {!isTeacher && (
          <div className="controls-bar">
            <div className="controls-left">
              <div className="live-info">
                <div className="live-dot" />
                <span>You are watching live</span>
              </div>
            </div>
            <div className="controls-right">
              <button className={`ctrl-btn ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(!chatOpen)}>
                <FiMessageSquare size={20} /> Chat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Notepad (Teacher only - while screen sharing) */}
      {notepadOpen && isTeacher && (
        <Notepad sessionId={sessionId} onClose={() => setNotepadOpen(false)} />
      )}

      {/* Chat Sidebar */}
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
            <button className="btn-icon btn btn-secondary" onClick={() => setChatOpen(false)}>
              <FiX size={16} />
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <FiMessageSquare size={24} />
                <p>No messages yet. Say hello!</p>
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
                    <button onClick={() => deleteMessage(msg.id)} title="Delete" className="msg-action-btn danger">
                      <FiTrash2 size={12} />
                    </button>
                    <button onClick={() => blockUser(msg.senderId, msg.senderName)} title="Block User" className="msg-action-btn danger">
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
              <div className="muted-notice">
                <FiVolumeX size={16} />
                Chat is muted by the teacher
              </div>
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
