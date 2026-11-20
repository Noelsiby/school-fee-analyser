/** Student photos: made small in the browser before upload (max 480 px, JPEG). */

const MAX = 480;

function toJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo.'))), 'image/jpeg', 0.85);
  });
}

/** Shrink a chosen photo file (keeps its shape). */
export function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = Object.assign(document.createElement('canvas'), {
        width: Math.round(img.width * scale), height: Math.round(img.height * scale),
      });
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      toJpeg(canvas).then(resolve, reject);
    };
    img.onerror = () => reject(new Error('That file is not a photo.'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * A passport-style (3 wide : 4 tall) photo from the middle of the camera picture.
 * @param {HTMLVideoElement} video  live camera
 * @param {boolean} mirror  flip left-right (front camera), so the photo looks like the preview
 */
export function captureFrame(video, mirror = false) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return Promise.reject(new Error('The camera is not ready yet.'));
  // Largest 3:4 area in the middle of the picture
  let cw = vw, ch = Math.round(vw * 4 / 3);
  if (ch > vh) { ch = vh; cw = Math.round(vh * 3 / 4); }
  const sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2);
  const scale = Math.min(1, MAX / ch);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(cw * scale), height: Math.round(ch * scale) });
  const ctx = canvas.getContext('2d');
  if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  return toJpeg(canvas);
}

/** Upload a student's photo (blob) with useApi().apiUpload. */
export function uploadStudentPhoto(apiUpload, studentId, blob) {
  const fd = new FormData();
  fd.append('photo', blob, 'photo.jpg');
  return apiUpload(`/api/students/${studentId}/photo`, fd, 'PUT');
}
