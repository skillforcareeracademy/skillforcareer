"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BoardTool, Stroke } from "@/lib/validations/board";

/** Stroke width per tool, in canvas units (fraction of the smaller side). */
const TOOL_WIDTH: Record<BoardTool, number> = {
  pen: 0.004,
  highlighter: 0.025,
  eraser: 0.035,
};

/**
 * The shared whiteboard inside a live class.
 *
 * Controlled: `strokes` are the finished strokes the room has broadcast (so
 * every participant sees the same board), and the one still under the pen is
 * kept locally and painted on top. When the host finishes a stroke `onStroke`
 * fires and the room relays it to everyone. Students get `canDraw = false` and
 * only watch.
 */
export function LiveBoard({
  strokes,
  canDraw,
  tool,
  color,
  onStroke,
}: {
  strokes: Stroke[];
  canDraw: boolean;
  tool: BoardTool;
  color: string;
  onStroke: (stroke: Stroke) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = useRef<Stroke | null>(null);

  const repaint = useCallback(
    (live?: Stroke | null) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const { width, height } = canvas;
      const unit = Math.min(width, height);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const all = live ? [...strokes, live] : strokes;
      for (const s of all) {
        if (s.points.length < 2) continue;
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, s.width * unit);
        ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
        ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
        ctx.moveTo(s.points[0] * width, s.points[1] * height);
        for (let i = 2; i < s.points.length; i += 2) {
          ctx.lineTo(s.points[i] * width, s.points[i + 1] * height);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    [strokes],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      repaint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [repaint]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  function at(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = at(e);
    current.current = { tool, color, width: TOOL_WIDTH[tool], points: [x, y] };
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !current.current) return;
    const [x, y] = at(e);
    const pts = current.current.points;
    const dx = x - pts[pts.length - 2];
    const dy = y - pts[pts.length - 1];
    if (dx * dx + dy * dy < 0.000004) return;
    pts.push(x, y);
    repaint(current.current);
  }

  function up() {
    const done = current.current;
    current.current = null;
    drawing.current = false;
    if (done && done.points.length >= 4) onStroke(done);
  }

  return (
    <div ref={wrapRef} className="relative size-full bg-white">
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        className={`size-full ${canDraw ? "cursor-crosshair touch-none" : "cursor-default"}`}
        style={{ touchAction: canDraw ? "none" : "auto" }}
      />
    </div>
  );
}
