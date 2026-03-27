import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ref as dbRef, onValue, off, set, push } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import './Whiteboard.css';

const COLORS = ['#000000','#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#ffffff'];

const Whiteboard = ({ sessionId, readOnly = false }) => {
  const canvasRef   = useRef(null);
  const isDrawing   = useRef(false);
  const currentStroke = useRef(null);
  const allStrokes  = useRef([]);

  const [tool,  setTool]  = useState('pen');   // 'pen' | 'eraser'
  const [color, setColor] = useState('#000000');
  const [size,  setSize]  = useState(4);

  const wbPath = `liveSessions/${sessionId}/whiteboard`;

  // ─── Redraw entire canvas from strokes ──────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    allStrokes.current.forEach(stroke => renderStroke(ctx, stroke));
  }, []);

  const renderStroke = (ctx, stroke) => {
    if (!stroke?.points?.length) return;
    ctx.beginPath();
    ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : (stroke.color || '#000');
    ctx.lineWidth   = stroke.size || 4;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    stroke.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  };

  // ─── Sync from RTDB ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    const node = dbRef(rtdb, wbPath);
    onValue(node, snap => {
      const data = snap.val();
      allStrokes.current = data ? Object.values(data) : [];
      redraw();
    });
    return () => off(node);
  }, [sessionId, redraw]);

  // ─── Pointer helpers ──────────────────────────────────────────────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY
    };
  };

  // ─── Draw handlers ────────────────────────────────────────────────────────────
  const onDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    isDrawing.current = true;
    const pos = getPos(e);
    currentStroke.current = { tool, color, size, points: [pos] };
  };

  const onMove = (e) => {
    if (!isDrawing.current || readOnly) return;
    e.preventDefault();
    const pos = getPos(e);
    currentStroke.current.points.push(pos);

    // Incremental draw (smooth)
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const pts    = currentStroke.current.points;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth   = size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  const onUp = async (e) => {
    if (!isDrawing.current || readOnly) return;
    isDrawing.current = false;
    if (currentStroke.current?.points?.length > 1) {
      await push(dbRef(rtdb, wbPath), currentStroke.current);
    }
    currentStroke.current = null;
  };

  const clearBoard = async () => {
    await set(dbRef(rtdb, wbPath), null);
  };

  return (
    <div className="whiteboard-wrap">
      {!readOnly && (
        <div className="wb-toolbar">
          <button className={`wb-tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')}>✏️ Pen</button>
          <button className={`wb-tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')}>🧹 Eraser</button>
          <div className="wb-divider" />
          <div className="wb-colors">
            {COLORS.map(c => (
              <button
                key={c}
                className={`wb-color ${color === c ? 'active' : ''}`}
                style={{ background: c, border: c === '#ffffff' ? '2px solid #ccc' : '2px solid transparent' }}
                onClick={() => { setColor(c); setTool('pen'); }}
              />
            ))}
          </div>
          <div className="wb-divider" />
          <div className="wb-sizes">
            {[2, 4, 8, 16].map(s => (
              <button key={s} className={`wb-size ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>
                <div style={{ width: s * 2, height: s * 2, borderRadius: '50%', background: 'currentColor' }} />
              </button>
            ))}
          </div>
          <div className="wb-divider" />
          <button className="wb-tool danger" onClick={clearBoard}>🗑️ Clear All</button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        className="wb-canvas"
        style={{ cursor: readOnly ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
      />
      {readOnly && <div className="wb-readonly-badge">📋 Whiteboard (view only)</div>}
    </div>
  );
};

export default Whiteboard;
