import { api } from './services.js';
import { findFaces } from './faces.js';
import { angleProblem } from './angles.js';

const $ = (selector) => document.querySelector(selector),
  token = location.hash.slice(1),
  photos = [];
let stream = null,
  busy = false;
const message = (text) => {
  $('#message').textContent = text;
};
const labels = ['Front', 'Turn left', 'Turn right'];
function render() {
  document.querySelectorAll('#angles>div').forEach((slot, index) => {
    slot.classList.toggle('added', Boolean(photos[index]));
    slot.style.backgroundImage = photos[index]
      ? `linear-gradient(#087c6970,#087c6970),url(${photos[index]})`
      : '';
    slot.querySelector('strong').textContent = photos[index]
      ? `${labels[index]} added`
      : labels[index];
  });
  $('#complete').disabled = busy || photos.length !== 3;
}
async function openCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    $('#video').srcObject = stream;
    $('.camera').classList.add('live');
    $('#camera-button').textContent = 'Camera ready';
    $('#capture-button').hidden = false;
  } catch {
    $('#camera-empty').innerHTML =
      '<strong>Camera unavailable.</strong><span>Use Upload photos instead.</span>';
  }
}
function takePhoto() {
  const video = $('#video'),
    canvas = $('#canvas'),
    size = Math.min(video.videoWidth, video.videoHeight);
  canvas.width = canvas.height = 720;
  canvas
    .getContext('2d')
    .drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      720,
      720,
    );
  if (!size) return;
  if (photos.length < 3) photos.push(canvas.toDataURL('image/jpeg', 0.86));
  render();
  if (photos.length === 3) {
    stream?.getTracks().forEach((track) => track.stop());
    $('#capture-button').hidden = true;
  }
}
$('#camera-button').onclick = openCamera;
$('#capture-button').onclick = takePhoto;
const blobs = () =>
  Promise.all(photos.map((url) => fetch(url).then((response) => response.blob())));
$('#upload').onchange = async (event) => {
  const files = [...event.target.files].slice(0, 3 - photos.length);
  event.target.value = '';
  for (const file of files)
    photos.push(
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      }),
    );
  render();
};
// Tap an angle to take it again.
document.querySelectorAll('#angles>div').forEach((slot, index) => {
  slot.onclick = () => {
    if (!photos[index] || busy) return;
    photos.splice(index);
    if (stream) openCamera();
    render();
  };
});
$('#complete').onclick = async () => {
  busy = true;
  $('#complete').disabled = true;
  $('#complete').textContent = 'Checking your selfies…';
  message('');
  try {
    const faces = [],
      yaws = [];
    for (const [index, blob] of (await blobs()).entries()) {
      const found = await findFaces(blob, { tiles: false });
      if (found.length !== 1) {
        photos.splice(index);
        throw new Error(
          found.length
            ? `More than one face in "${labels[index]}". Take it again alone.`
            : `No clear face in "${labels[index]}". Take it again in better light.`,
        );
      }
      faces.push(found[0].embedding);
      yaws.push(found[0].yaw);
    }
    const problem = angleProblem(yaws);
    if (problem) {
      photos.splice(problem[0]);
      throw new Error(problem[1]);
    }
    await api.enrollment.submit(token, faces);
    $('#done').hidden = false;
    $('#complete').hidden = true;
    stream?.getTracks().forEach((track) => track.stop());
    photos.length = 0;
  } catch (error) {
    message(error.message || 'Something went wrong. Please try again.');
    if (stream && photos.length < 3) openCamera();
  } finally {
    busy = false;
    $('#complete').textContent = 'Complete selfie setup';
    render();
  }
};
render();
api.enrollment
  .status(token)
  .then((status) => {
    if (status === 'waiting') return;
    message('This link has expired or was already used. Start again on your computer.');
    $('.capture').inert = true;
  })
  .catch((error) => message(error.message));
