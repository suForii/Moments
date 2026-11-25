const $ = (selector) => document.querySelector(selector),
  session = new URLSearchParams(location.search).get('session') || 'demo',
  storageKey = `moments-enrollment-${session}`,
  photos = [];
let stream = null;
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
  $('#complete').disabled = photos.length !== 3;
}
async function openCamera() {
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
  if (photos.length < 3) photos.push(canvas.toDataURL('image/jpeg', 0.86));
  render();
  if (photos.length === 3) {
    stream?.getTracks().forEach((track) => track.stop());
    $('#capture-button').hidden = true;
  }
}
$('#camera-button').onclick = openCamera;
$('#capture-button').onclick = takePhoto;
$('#upload').onchange = (event) => {
  for (const file of [...event.target.files].slice(0, 3 - photos.length)) {
    const reader = new FileReader();
    reader.onload = () => {
      photos.push(reader.result);
      render();
    };
    reader.readAsDataURL(file);
  }
};
$('#complete').onclick = () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ status: 'completed', count: 3, completedAt: new Date().toISOString() }),
  );
  $('#done').hidden = false;
  $('#complete').hidden = true;
  stream?.getTracks().forEach((track) => track.stop());
};
render();
