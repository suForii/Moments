/** Shrinks photos before upload. Redrawing also strips all metadata from the stored copy. */
import exifr from './vendor/exifr.js';

async function shrink(bitmap, max, quality) {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not process this photo.');
  return blob;
}

export async function preparePhoto(file, event) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Object.assign(new Error('This browser cannot open that image. Try a JPEG or PNG.'), {
      permanent: true,
    });
  }
  const [full, thumb, info, gps] = await Promise.all([
    shrink(bitmap, 2048, 0.82),
    shrink(bitmap, 640, 0.75),
    exifr.parse(file).catch(() => null),
    exifr.gps(file).catch(() => null),
  ]);
  bitmap.close();
  const taken = info?.DateTimeOriginal;
  const valid = taken instanceof Date && !Number.isNaN(+taken);
  const pad = (n) => String(n).padStart(2, '0');
  const hasGps = Number.isFinite(gps?.latitude) && Number.isFinite(gps?.longitude);
  return {
    full,
    thumb,
    date: valid
      ? `${taken.getFullYear()}-${pad(taken.getMonth() + 1)}-${pad(taken.getDate())}`
      : event.date,
    // Rounded to about 1 km so exact positions are never stored.
    location: hasGps
      ? `Near ${gps.latitude.toFixed(2)}, ${gps.longitude.toFixed(2)}`
      : event.location,
  };
}
