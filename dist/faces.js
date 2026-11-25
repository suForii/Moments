/** Finds faces on this device. Pictures never leave the browser for this step. */
let ready;
function load() {
  ready ??= (async () => {
    const { default: Human } = await import('./vendor/human/human.esm.js');
    const off = { enabled: false };
    const human = new Human({
      backend: 'webgl',
      modelBasePath: new URL('./vendor/human/models/', import.meta.url).href,
      cacheSensitivity: 0,
      filter: off,
      face: {
        enabled: true,
        detector: {
          rotation: true,
          maxDetected: 30,
          minConfidence: 0.4,
          skipFrames: 0,
          skipTime: 0,
        },
        mesh: { enabled: true },
        iris: off,
        emotion: off,
        antispoof: off,
        liveness: off,
        description: { enabled: true, skipFrames: 0, skipTime: 0 },
      },
      body: off,
      hand: off,
      object: off,
      gesture: off,
      segmentation: off,
    });
    await human.load();
    return human;
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function crop(source, x, y, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  canvas.getContext('2d').drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function overlaps(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 && (w * h) / Math.min(a.w * a.h, b.w * b.h) > 0.4;
}

let queue = Promise.resolve();
/** Returns [{ embedding, score, w, h }]. Calls are run one at a time. */
export function findFaces(blob, { tiles = true } = {}) {
  const job = queue.then(() => scan(blob, tiles));
  queue = job.catch(() => {});
  return job;
}
async function scan(blob, tiles) {
  const human = await load(),
    image = await createImageBitmap(blob),
    { width: W, height: H } = image;
  // The detector shrinks its input, so small faces in group photos need a closer look.
  const areas = [[0, 0, W, H]];
  if (tiles)
    for (const x of [0, 0.45])
      for (const y of [0, 0.45]) areas.push([x * W, y * H, W * 0.55, H * 0.55]);
  const found = [];
  for (const [x, y, w, h] of areas) {
    const result = await human.detect(crop(image, x, y, w, h));
    if (result.error) throw new Error('Face detection failed on this device.');
    for (const face of result.face) {
      const [bx, by, bw, bh] = face.box;
      if (face.embedding?.length !== 1024 || face.score < 0.5 || Math.min(bw, bh) < 32) continue;
      const item = {
        x: x + bx,
        y: y + by,
        w: bw,
        h: bh,
        score: face.score,
        yaw: face.rotation?.angle?.yaw ?? 0,
      };
      if (found.some((other) => overlaps(item, other))) continue;
      found.push({ ...item, embedding: face.embedding.map((n) => Math.round(n * 1e4) / 1e4) });
    }
  }
  image.close();
  return found.slice(0, 60);
}
