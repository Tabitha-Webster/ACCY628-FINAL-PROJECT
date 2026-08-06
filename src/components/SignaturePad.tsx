"use client";

import { useEffect, useRef } from "react";

type Props = {
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
  /** When set, shows an Autopopulate button that fills a demo signature for this name. */
  autoPopulateName?: string;
};

/** Simple canvas signature pad for demo e-sign. */
export function SignaturePad({ disabled = false, onChange, autoPopulateName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }, []);

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL("image/png"));
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    emit();
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    hasInk.current = false;
    onChange(null);
  }

  function autoPopulate() {
    if (disabled || !autoPopulateName) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Demo “ink” signature: cursive-style name plus a short underline flourish.
    ctx.fillStyle = "#111827";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "italic 34px 'Segoe Script', 'Brush Script MT', 'Apple Chancery', cursive";
    ctx.fillText(autoPopulateName, 24, height * 0.48);

    const textWidth = ctx.measureText(autoPopulateName).width;
    ctx.beginPath();
    ctx.moveTo(28, height * 0.72);
    ctx.quadraticCurveTo(28 + textWidth * 0.45, height * 0.82, 28 + textWidth, height * 0.7);
    ctx.stroke();

    hasInk.current = true;
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-box border border-base-300 bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="flex flex-wrap gap-2">
        {autoPopulateName ? (
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={autoPopulate}
            disabled={disabled}
          >
            Autopopulate ({autoPopulateName})
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-xs" onClick={clear} disabled={disabled}>
          Clear signature
        </button>
      </div>
    </div>
  );
}
