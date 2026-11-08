const $ = (selector) => document.querySelector(selector);
const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const video = $('#video');
const playerOverlay = $('#player-overlay');
const videoGrid = $('#video-grid');
const emptyState = $('#empty-state');
const toast = $('#toast');
let library = [];
let activeVideo = null;
let objectUrl = null;
let toastTimer;
let sortNewest = true;
const filters = { brightness: 100, contrast: 100, saturation: 100 };

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function formatSize(bytes) {
  if (!bytes) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(unit > 0 ? 1 : 0)} ${units[unit]}`;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function safeName(name) { return name.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function addFiles(files) {
  const accepted = [...files].filter(file => file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(file.name));
  if (!accepted.length) { showToast('Выберите видеофайл, например MP4 или WebM.'); return; }
  accepted.forEach(file => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, name: file.name, size: file.size, addedAt: Date.now(), duration: 0, url: URL.createObjectURL(file) };
    library.unshift(item);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = item.url;
    probe.onloadedmetadata = () => { item.duration = probe.duration; renderLibrary(); };
    probe.onerror = () => { item.unplayable = true; renderLibrary(); };
  });
  renderLibrary();
  if (accepted.length === 1) openPlayer(library[0]);
  else showToast(`Добавлено видео: ${accepted.length}`);
  fileInput.value = '';
}
function renderLibrary() {
  const query = $('#search-input').value.trim().toLowerCase();
  const visible = library.filter(item => item.name.toLowerCase().includes(query));
  visible.sort((a, b) => sortNewest ? b.addedAt - a.addedAt : a.name.localeCompare(b.name, 'ru'));
  videoGrid.innerHTML = visible.map(item => `<article class="video-card" data-id="${item.id}"><div class="thumbnail" data-play="${item.id}" role="button" tabindex="0" aria-label="Смотреть ${safeName(item.name)}"><span class="thumb-kind">МОЁ ВИДЕО</span><span class="thumb-play">▶</span><span class="thumb-time">${item.duration ? formatTime(item.duration) : 'Видео'}</span></div><div class="card-details"><div class="file-type-icon">▶</div><div class="card-title"><strong title="${safeName(item.name)}">${safeName(item.name)}</strong><span>${formatSize(item.size)} · ${item.duration ? formatTime(item.duration) : 'Добавлено сейчас'}</span></div><button class="card-menu" data-remove="${item.id}" aria-label="Удалить ${safeName(item.name)}">···</button></div></article>`).join('');
  emptyState.classList.toggle('hidden', library.length > 0);
  videoGrid.classList.toggle('hidden', visible.length === 0);
  if (library.length > 0 && visible.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('strong').textContent = 'Ничего не найдено';
    emptyState.querySelector('span').textContent = 'Попробуйте изменить поисковый запрос.';
    $('#empty-upload').classList.add('hidden');
  } else {
    emptyState.querySelector('strong').textContent = 'Здесь пока пусто';
    emptyState.querySelector('span').textContent = 'Добавьте видео — оно появится в вашей библиотеке.';
    $('#empty-upload').classList.remove('hidden');
  }
  $('#library-count').textContent = library.length;
}
function openPlayer(item) {
  if (!item) return;
  activeVideo = item;
  if (objectUrl && objectUrl !== item.url) URL.revokeObjectURL(objectUrl);
  objectUrl = item.url;
  video.src = item.url;
  video.load();
  $('#player-title').textContent = item.name;
  $('#info-title').textContent = item.name;
  const ext = item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : 'ВИДЕО';
  $('#info-format').textContent = ext;
  $('#info-duration').textContent = item.duration ? formatTime(item.duration) : 'Загружается…';
  $('#info-size').textContent = formatSize(item.size);
  playerOverlay.classList.add('open');
  playerOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('#video-empty').classList.add('hidden');
  resetEnhancement();
  video.play().then(() => setPlayState(true)).catch(() => setPlayState(false));
}
function closePlayer() {
  video.pause();
  playerOverlay.classList.remove('open');
  playerOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  $('#video-stage').classList.remove('paused', 'controls-hidden');
  document.querySelector('.player-dialog').classList.remove('theater-mode');
}
function setPlayState(playing) {
  $('#play-button').textContent = playing ? 'Ⅱ' : '▶';
  $('#play-button').setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
  $('#video-stage').classList.toggle('paused', !playing && Boolean(video.src));
}
function togglePlay() { if (!video.src) return; if (video.paused) video.play().then(() => setPlayState(true)).catch(() => showToast('Не удалось воспроизвести этот формат в браузере.')); else { video.pause(); setPlayState(false); } }
function updateTimeline() {
  const percent = video.duration ? video.currentTime / video.duration * 100 : 0;
  $('#seek').value = video.duration ? video.currentTime / video.duration * 1000 : 0;
  $('#seek').style.setProperty('--progress', `${percent}%`);
  $('#current-time').textContent = formatTime(video.currentTime);
  $('#duration').textContent = formatTime(video.duration);
  if (activeVideo && video.duration) {
    activeVideo.duration = video.duration;
    $('#info-duration').textContent = formatTime(video.duration);
  }
}
function applyFilters() {
  const enabled = $('#enhance-toggle').getAttribute('aria-pressed') === 'true';
  video.style.filter = enabled ? `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)` : '';
  $('#brightness-value').textContent = `${filters.brightness}%`;
  $('#contrast-value').textContent = `${filters.contrast}%`;
  $('#saturation-value').textContent = `${filters.saturation}%`;
}
function setEnhancement(enabled) {
  $('#enhance-toggle').setAttribute('aria-pressed', String(enabled));
  $('#enhance-toggle').classList.toggle('active', enabled);
  $('#enhance-switch').setAttribute('aria-checked', String(enabled));
  applyFilters();
}
function resetEnhancement() {
  filters.brightness = filters.contrast = filters.saturation = 100;
  $('#brightness').value = $('#contrast').value = $('#saturation').value = 100;
  setEnhancement(false);
}
function removeVideo(id) {
  const index = library.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = library.splice(index, 1);
  URL.revokeObjectURL(item.url);
  if (activeVideo && activeVideo.id === id) { closePlayer(); activeVideo = null; }
  renderLibrary();
  showToast('Видео удалено из библиотеки.');
}

$('#upload-button').addEventListener('click', () => fileInput.click());
$('#choose-button').addEventListener('click', () => fileInput.click());
$('#empty-upload').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', event => addFiles(event.target.files));
['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('drag-over'); }));
dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => { if (!dropZone.contains(event.target)) event.preventDefault(); });
videoGrid.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (remove) { event.stopPropagation(); removeVideo(remove.dataset.remove); return; }
  const card = event.target.closest('[data-play]');
  if (card) openPlayer(library.find(item => item.id === card.dataset.play));
});
videoGrid.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-play]')) { event.preventDefault(); openPlayer(library.find(item => item.id === event.target.dataset.play)); } });
$('#search-input').addEventListener('input', renderLibrary);
$('#sort-button').addEventListener('click', () => { sortNewest = !sortNewest; $('#sort-button').innerHTML = `${sortNewest ? 'Недавно добавленные' : 'По названию'} <span>⌄</span>`; renderLibrary(); });
$('#play-button').addEventListener('click', togglePlay);
$('#center-play').addEventListener('click', togglePlay);
video.addEventListener('click', togglePlay);
video.addEventListener('play', () => setPlayState(true));
video.addEventListener('pause', () => setPlayState(false));
video.addEventListener('timeupdate', updateTimeline);
video.addEventListener('loadedmetadata', updateTimeline);
video.addEventListener('ended', () => setPlayState(false));
video.addEventListener('error', () => { if (video.src) showToast('Браузер не смог открыть этот видеоформат.'); });
$('#seek').addEventListener('input', event => { if (video.duration) { video.currentTime = Number(event.target.value) / 1000 * video.duration; updateTimeline(); } });
$('#volume').addEventListener('input', event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; $('#mute-button').textContent = video.muted ? '◖̸' : '◖'; event.target.style.setProperty('--progress', `${video.volume * 100}%`); });
$('#mute-button').addEventListener('click', () => { video.muted = !video.muted; $('#mute-button').textContent = video.muted ? '◖̸' : '◖'; });
$('#skip-back').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 10); });
$('#skip-forward').addEventListener('click', () => { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); });
$('#fullscreen-button').addEventListener('click', async () => { try { if (!document.fullscreenElement) await $('#video-stage').requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('Полноэкранный режим недоступен.'); } });
$('#theater-button').addEventListener('click', () => document.querySelector('.player-dialog').classList.toggle('theater-mode'));
$('#close-player').addEventListener('click', closePlayer);
$('#close-player-x').addEventListener('click', closePlayer);
$('#enhance-toggle').addEventListener('click', () => setEnhancement($('#enhance-toggle').getAttribute('aria-pressed') !== 'true'));
$('#enhance-switch').addEventListener('click', () => setEnhancement($('#enhance-switch').getAttribute('aria-checked') !== 'true'));
[['brightness', 'brightness'], ['contrast', 'contrast'], ['saturation', 'saturation']].forEach(([id, key]) => $(`#${id}`).addEventListener('input', event => { filters[key] = Number(event.target.value); if ($('#enhance-toggle').getAttribute('aria-pressed') !== 'true') setEnhancement(true); applyFilters(); event.target.style.setProperty('--progress', `${(Number(event.target.value) - Number(event.target.min)) / (Number(event.target.max) - Number(event.target.min)) * 100}%`); }));
$('#reset-settings').addEventListener('click', resetEnhancement);
$('#menu-button').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.querySelectorAll('[data-nav]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  document.querySelectorAll('[data-nav]').forEach(item => item.classList.remove('active'));
  link.classList.add('active');
  $('#crumb-current').textContent = link.dataset.nav === 'library' ? 'Моя библиотека' : 'Главная';
  $('#sidebar').classList.remove('open');
  (link.dataset.nav === 'library' ? $('#library') : $('#home')).scrollIntoView({ behavior: 'smooth' });
}));
const modal = $('#info-modal');
function openModal() { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
$('#about-button').addEventListener('click', openModal);
$('#privacy-button').addEventListener('click', openModal);
$('#modal-close').addEventListener('click', closeModal);
$('#modal-ok').addEventListener('click', closeModal);
modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
$('#player-more').addEventListener('click', () => showToast('Исходное видео остаётся на устройстве.'));
$('#keyboard-help').addEventListener('click', () => showToast('Пробел — пауза · ←/→ — перемотка · M — звук · F — полный экран'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (modal.classList.contains('open')) closeModal(); else if (playerOverlay.classList.contains('open')) closePlayer(); $('#sidebar').classList.remove('open'); }
  if (!playerOverlay.classList.contains('open') || event.target.matches('input')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
  if (event.key === 'ArrowRight') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
  if (event.key.toLowerCase() === 'm') $('#mute-button').click();
  if (event.key.toLowerCase() === 'f') $('#fullscreen-button').click();
  if (event.key === '?') $('#keyboard-help').click();
});
window.addEventListener('beforeunload', () => library.forEach(item => URL.revokeObjectURL(item.url)));
renderLibrary();
