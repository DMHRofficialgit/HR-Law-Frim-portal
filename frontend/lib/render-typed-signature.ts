/** Render short text (name / initials) as a transparent PNG for e-sign boxes. */
export function renderTypedSignaturePng(
  text: string,
  options?: { width?: number; height?: number }
): Promise<Blob> {
  const width = options?.width ?? 560;
  const height = options?.height ?? 140;
  const value = text.trim();
  if (!value) {
    return Promise.reject(new Error("Text is required"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas unavailable"));
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let fontSize = Math.min(64, Math.floor(height * 0.55));
  const fontFamily = '"Segoe Script", "Brush Script MT", "Apple Chancery", cursive';
  ctx.font = `${fontSize}px ${fontFamily}`;
  while (fontSize > 18 && ctx.measureText(value).width > width - 24) {
    fontSize -= 2;
    ctx.font = `${fontSize}px ${fontFamily}`;
  }
  ctx.fillText(value, width / 2, height / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Failed to render typed signature"));
      else resolve(blob);
    }, "image/png");
  });
}
