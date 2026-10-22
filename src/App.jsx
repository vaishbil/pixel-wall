import { useEffect, useRef, useState } from "react";
import { ref, onValue, set, update } from "firebase/database";
import { db } from "./firebase";
import "./App.css";

const COLORS = [
  "#1b1b1b", "#3e2f23", "#6b4a2f", "#a0764a", "#f4efe1",
  "#ffffff", "#c8553d", "#e63946", "#e07a3f", "#f2c14e",
  "#fff176", "#9cc65a", "#4c8c4a", "#1f5f3a", "#2a9d8f",
  "#5aa9c9", "#2f6fb0", "#8e5a9b", "#e8a0b4", "#ff5fa2",
];
const ERASER = "eraser";
const SIZES = [10, 15, 20, 25, 30];
const EMPTY = "#f1ecdc";

const getUid = () => {
  try {
    let id = localStorage.getItem("ppw-uid");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem("ppw-uid", id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
};
const uid = getUid();
const isAdmin = new URLSearchParams(window.location.search).has("admin");

export default function App() {
  const [pixels, setPixels] = useState({});
  const [painters, setPainters] = useState({});
  const [size, setSize] = useState(20);
  const [color, setColor] = useState(COLORS[6]);
  const [canUndo, setCanUndo] = useState(false);

  const painting = useRef(false);
  const last = useRef(null);
  const pixelsRef = useRef({});
  const paintersRef = useRef({});
  const stroke = useRef(new Map()); // pixels changed in the current stroke
  const history = useRef([]); // this person's past strokes

  useEffect(() => {
    const offPixels = onValue(ref(db, "pixels"), (snap) => {
      const val = snap.val() || {};
      pixelsRef.current = val;
      setPixels(val);
    });
    const offPainters = onValue(ref(db, "painters"), (snap) => {
      const val = snap.val() || {};
      paintersRef.current = val;
      setPainters(val);
    });
    const offSize = onValue(ref(db, "config/size"), (snap) =>
      setSize(snap.val() || 20)
    );
    return () => {
      offPixels();
      offPainters();
      offSize();
    };
  }, []);

  const undo = () => {
    const s = history.current.pop();
    if (!s) return;
    update(ref(db, "pixels"), s); // null values remove the pixel
    setCanUndo(history.current.length > 0);
  };

  useEffect(() => {
    const stop = () => {
      if (painting.current && stroke.current.size > 0) {
        history.current.push(Object.fromEntries(stroke.current));
        if (history.current.length > 30) history.current.shift();
        setCanUndo(true);
      }
      stroke.current = new Map();
      painting.current = false;
      last.current = null;
    };
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const paintAt = (x, y) => {
    const k = document.elementFromPoint(x, y)?.dataset?.k;
    if (k === undefined || k === last.current) return;
    last.current = k;

    // remember what was here before, for undo
    if (!stroke.current.has(k)) {
      stroke.current.set(k, pixelsRef.current[k] ?? null);
    }
    set(ref(db, `pixels/${k}`), color === ERASER ? null : color);

    if (!paintersRef.current[uid]) {
      set(ref(db, `painters/${uid}`), true);
    }
  };

  const changeSize = (n) => set(ref(db, "config/size"), n);

  const clearAll = () => {
    if (!window.confirm("Clear the whole canvas for everyone?")) return;
    set(ref(db, "pixels"), null);
    set(ref(db, "painters"), null);
    history.current = [];
    setCanUndo(false);
  };

  // only count pixels inside the current grid
  const pixelCount = Object.keys(pixels).filter((k) => {
    const [r, c] = k.split("-").map(Number);
    return r < size && c < size;
  }).length;
  const peopleCount = Object.keys(painters).length;

  return (
    <div className="app">
      <h1>Pixel Art Wall</h1>
      <p className="sub">🌳 grab a colour and paint with everyone here</p>

      <div className="palette">
        {COLORS.map((c) => (
          <button
            key={c}
            className={c === color ? "swatch active" : "swatch"}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
        <input
          type="color"
          className="custom"
          title="Pick any colour"
          value={color === ERASER ? "#000000" : color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>

      <div className="tools">
        <button
          className={color === ERASER ? "tool on" : "tool"}
          onClick={() => setColor(ERASER)}
        >
          🧽 Eraser
        </button>
        <button className="tool" onClick={undo} disabled={!canUndo}>
          ↩ Undo
        </button>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        onPointerDown={(e) => {
          painting.current = true;
          last.current = null;
          stroke.current = new Map();
          paintAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (painting.current) paintAt(e.clientX, e.clientY);
        }}
      >
        {Array.from({ length: size * size }, (_, i) => {
          const k = `${Math.floor(i / size)}-${i % size}`;
          return (
            <div
              key={k}
              data-k={k}
              className="pixel"
              style={{ background: pixels[k] || EMPTY }}
            />
          );
        })}
      </div>

      <p className="count">
        🌱 {pixelCount} {pixelCount === 1 ? "pixel" : "pixels"} painted by{" "}
        {peopleCount} {peopleCount === 1 ? "person" : "people"}
      </p>

      {isAdmin && (
        <div className="admin">
          <label>
            Grid size{" "}
            <select value={size} onChange={(e) => changeSize(Number(e.target.value))}>
              {SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} × {n}
                </option>
              ))}
            </select>
          </label>
          <button className="clear" onClick={clearAll}>
            Clear canvas
          </button>
        </div>
      )}
    </div>
  );
}