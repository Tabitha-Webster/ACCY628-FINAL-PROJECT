/** Build a simple demo signature PNG data URL for autopopulate / edit re-approval flows. */
export function buildDemoSignatureDataUrl(signerName: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC";
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "italic 42px 'Segoe Script', 'Brush Script MT', 'Apple Chancery', cursive";
  ctx.fillText(signerName, 36, canvas.height * 0.48);

  const textWidth = ctx.measureText(signerName).width;
  ctx.beginPath();
  ctx.moveTo(40, canvas.height * 0.72);
  ctx.quadraticCurveTo(40 + textWidth * 0.45, canvas.height * 0.84, 40 + textWidth, canvas.height * 0.7);
  ctx.stroke();

  return canvas.toDataURL("image/png");
}
