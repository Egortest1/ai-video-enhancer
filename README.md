const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const videoGrid = $('#video-grid');
const emptyState = $('#empty-state');
const toast = $('#toast');
const video = $('#video');
const playerOverlay = $('#player-overlay');
const videoStage = $('#video-stage');

let library = [];
let activeVideo = null;
let toastTimer = null;
let sortNewest = true;
let speedIndex = 1;
const speedLevels = [0.75, 1, 1.25, 1.5, 2];
const presetMap = {
  soft: { brightness: 100, contrast: 100, saturation: 100 },
  cinematic: { brightness: 112, contrast: 128, saturation: 118 },
  vivid: { brightness: 118, contrast: 110, saturation: 132 }
};
const filters = { brightness: 100, contrast: 100, saturation: 100 };

function safeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderLibrary() {
  const query = $('#search-input').value.trim().toLowerCase();
  const visible = library.filter((item) => item.name.toLowerCase().includes(query));

  visible.sort((a, b) => (sortNewest ? b.addedAt - a.addedAt : a.name.localeCompare(b.name, 'ru')));

  if (!visible.length && library.length) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('strong').textContent = 'Ничего не найдено';
    emptyState.querySelector('span').textContent = 'Попробуйте изменить поисковый запрос.';
    $('#empty-upload').classList.add('hidden');
  } else if (!library.length) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('strong').textContent = 'Здесь пока пусто';
    emptyState.querySelector('span').textContent = 'Добавьте первое видео, чтобы начать просмотр.';
    $('#empty-upload').classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }

  videoGrid.innerHTML = visible.map((item) => `
    <article class="video-card" data-id="${item.id}">
      <div class="thumbnail" data-play="${item.id}" role="button" tabindex="0" aria-label="Смотреть ${safeHtml(item.name)}">
        <span class="thumb-kind">МОЁ</span>
        <span class="thumb-play">▶</span>
        <span class="thumb-time">${item.duration ? formatTime(item.duration) : 'Видео'}</span>
      </div>
      <div class="card-details">
        <div class="file-type-icon">▶</div>
        <div class="card-title">
          <strong title="${safeHtml(item.name)}">${safeHtml(item.name)}</strong>
          <span>${formatSize(item.size)} · ${item.duration ? formatTime(item.duration) : 'Добавлено'}</span>
        </div>
        <button class="card-menu" data-remove="${item.id}" type="button" aria-label="Удалить ${safeHtml(item.name)}">⋯</button>
      </div>
    </article>
  `).join('');

  $('#library-count').textContent = library.length;
}

function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(file.name));

  if (!files.length) {
    showToast('Выберите файл в формате видео.');
    return;
  }

  files.forEach((file) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
      duration: 0,
      addedAt: Date.now(),
      url: URL.createObjectURL(file)
    };

    library.unshift(item);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.src = item.url;
    probe.onloadedmetadata = () => {
      item.duration = probe.duration || 0;
      renderLibrary();
    };
    probe.onerror = () => {
      item.duration = 0;
      renderLibrary();
    };
  });

  renderLibrary();
  showToast(`Добавлено ${files.length} ${files.length > 1 ? 'видео' : 'видео'}.`);
  if (files.length === 1) openPlayer(library[0]);
  fileInput.value = '';
}

function openPlayer(item) {
  if (!item) return;
  activeVideo = item;
  video.src = item.url;
  video.load();
  $('#player-title').textContent = item.name;
  $('#info-title').textContent = item.name;
  $('#info-format').textContent = (item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : 'VIDEO');
  $('#info-duration').textContent = item.duration ? formatTime(item.duration) : '—';
  $('#info-size').textContent = formatSize(item.size);
  playerOverlay.classList.add('open');
  playerOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('#video-empty').classList.add('hidden');
  resetEnhancement();
  video.play().catch(() => setPlayState(false));
}

function closePlayer() {
  video.pause();
  playerOverlay.classList.remove('open');
  playerOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  videoStage.classList.remove('paused');
  document.querySelector('.player-dialog').classList.remove('theater-mode');
}

function setPlayState(isPlaying) {
  $('#play-button').textContent = isPlaying ? 'Ⅱ' : '▶';
  $('#play-button').setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
  videoStage.classList.toggle('paused', !isPlaying);
}

function togglePlay() {
  if (!video.src) return;
  if (video.paused) {
    video.play().then(() => setPlayState(true)).catch(() => showToast('Не удалось воспроизвести файл.'));
  } else {
    video.pause();
    setPlayState(false);
  }
}

function updateTimeline() {
  const duration = video.duration || 0;
  const currentTime = video.currentTime || 0;
  const percent = duration ? (currentTime / duration) * 100 : 0;
  $('#seek').value = duration ? (currentTime / duration) * 1000 : 0;
  $('#seek').style.setProperty('--progress', `${percent}%`);
  $('#current-time').textContent = formatTime(currentTime);
  $('#duration').textContent = formatTime(duration);

  if (activeVideo && duration) {
    activeVideo.duration = duration;
    $('#info-duration').textContent = formatTime(duration);
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
  $('#enhance-switch').setAttribute('aria-label', enabled ? 'Выключить улучшение' : 'Включить улучшение');
  applyFilters();
}

function resetEnhancement() {
  filters.brightness = 100;
  filters.contrast = 100;
  filters.saturation = 100;
  $('#brightness').value = 100;
  $('#contrast').value = 100;
  $('#saturation').value = 100;
  setEnhancement(false);
  $$('.preset').forEach((button) => button.classList.toggle('active', button.dataset.preset === 'soft'));
}

function applyPreset(name) {
  const preset = presetMap[name] || presetMap.soft;
  filters.brightness = preset.brightness;
  filters.contrast = preset.contrast;
  filters.saturation = preset.saturation;
  $('#brightness').value = preset.brightness;
  $('#contrast').value = preset.contrast;
  $('#saturation').value = preset.saturation;
  setEnhancement(true);
  applyFilters();
  $$('.preset').forEach((button) => button.classList.toggle('active', button.dataset.preset === name));
}

function removeVideo(id) {
  const index = library.findIndex((item) => item.id === id);
  if (index === -1) return;
  const [item] = library.splice(index, 1);
  URL.revokeObjectURL(item.url);
  if (activeVideo && activeVideo.id === id) {
    closePlayer();
    activeVideo = null;
  }
  renderLibrary();
  showToast('Видео удалено из библиотеки.');
}

$('#upload-button').addEventListener('click', () => fileInput.click());
$('#choose-button').addEventListener('click', () => fileInput.click());
$('#empty-upload').addEventListener('click', () => fileInput.click());
$('#library-cta').addEventListener('click', () => {
  $('#library').scrollIntoView({ behavior: 'smooth' });
  $('#crumb-current').textContent = 'Библиотека';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === 'library'));
});

fileInput.addEventListener('change', (event) => addFiles(event.target.files));

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

videoGrid.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove]');
  if (removeButton) {
    removeVideo(removeButton.dataset.remove);
    return;
  }

  const playNode = event.target.closest('[data-play]');
  if (playNode) {
    const selected = library.find((item) => item.id === playNode.dataset.play);
    if (selected) openPlayer(selected);
  }
});

videoGrid.addEventListener('keydown', (event) => {
  const playNode = event.target.closest('[data-play]');
  if (!playNode) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const selected = library.find((item) => item.id === playNode.dataset.play);
    if (selected) openPlayer(selected);
  }
});

$('#search-input').addEventListener('input', renderLibrary);
$('#sort-button').addEventListener('click', () => {
  sortNewest = !sortNewest;
  $('#sort-button').innerHTML = `${sortNewest ? 'Недавно добавленные' : 'По названию'} <span>⌄</span>`;
  renderLibrary();
});

$('#play-button').addEventListener('click', togglePlay);
$('#center-play').addEventListener('click', togglePlay);
video.addEventListener('click', togglePlay);
video.addEventListener('play', () => setPlayState(true));
video.addEventListener('pause', () => setPlayState(false));
video.addEventListener('timeupdate', updateTimeline);
video.addEventListener('loadedmetadata', updateTimeline);
video.addEventListener('error', () => {
  showToast('Браузер не смог открыть этот формат.');
});

$('#seek').addEventListener('input', (event) => {
  if (!video.duration) return;
  const value = Number(event.target.value) / 1000;
  video.currentTime = value * video.duration;
  updateTimeline();
});

$('#volume').addEventListener('input', (event) => {
  const value = Number(event.target.value);
  video.volume = value;
  video.muted = value === 0;
  $('#mute-button').textContent = video.muted ? '◖̸' : '◖';
  $('#volume').style.setProperty('--progress', `${value * 100}%`);
});

$('#mute-button').addEventListener('click', () => {
  video.muted = !video.muted;
  $('#mute-button').textContent = video.muted ? '◖̸' : '◖';
  $('#volume').value = video.muted ? 0 : 1;
});

$('#skip-back').addEventListener('click', () => {
  video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
});

$('#skip-forward').addEventListener('click', () => {
  video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 10);
});

$('#fullscreen-button').addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await videoStage.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast('Полноэкранный режим недоступен.');
  }
});

$('#theater-button').addEventListener('click', () => {
  const playerDialog = document.querySelector('.player-dialog');
  playerDialog.classList.toggle('theater-mode');
});

$('#close-player').addEventListener('click', closePlayer);
$('#close-player-x').addEventListener('click', closePlayer);

$('#enhance-toggle').addEventListener('click', () => {
  const enabled = $('#enhance-toggle').getAttribute('aria-pressed') === 'true';
  setEnhancement(!enabled);
});

$('#enhance-switch').addEventListener('click', () => {
  const enabled = $('#enhance-switch').getAttribute('aria-checked') === 'true';
  setEnhancement(!enabled);
});

['brightness', 'contrast', 'saturation'].forEach((key) => {
  const input = $(`#${key}`);
  input.addEventListener('input', (event) => {
    filters[key] = Number(event.target.value);
    if ($('#enhance-toggle').getAttribute('aria-pressed') !== 'true') {
      setEnhancement(true);
    }
    applyFilters();
    const min = Number(input.min);
    const max = Number(input.max);
    const percent = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--progress', `${percent}%`);
  });
});

$('#reset-settings').addEventListener('click', resetEnhancement);

$$('.preset').forEach((button) => {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
});

$('#speed-button').addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % speedLevels.length;
  const speedValue = speedLevels[speedIndex];
  video.playbackRate = speedValue;
  $('#speed-button').textContent = `${speedValue.toFixed(speedValue % 1 === 0 ? 0 : 2)}×`;
  showToast(`Скорость: ${speedValue.toFixed(speedValue % 1 === 0 ? 0 : 2)}×`);
});

$('#menu-button').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
});

document.querySelectorAll('[data-nav]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const active = link.dataset.nav;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === link));
    $('#crumb-current').textContent = active === 'library' ? 'Библиотека' : active === 'pipeline' ? 'Улучшение' : 'Главная';
    $('#sidebar').classList.remove('open');
    if (active === 'library') $('#library').scrollIntoView({ behavior: 'smooth' });
    if (active === 'pipeline') $('#pipeline').scrollIntoView({ behavior: 'smooth' });
    if (active === 'home') $('#home').scrollIntoView({ behavior: 'smooth' });
  });
});

$('#about-button').addEventListener('click', () => {
  $('#info-modal').classList.add('open');
  $('#info-modal').setAttribute('aria-hidden', 'false');
});
$('#privacy-button').addEventListener('click', () => {
  $('#info-modal').classList.add('open');
  $('#info-modal').setAttribute('aria-hidden', 'false');
});
$('#modal-close').addEventListener('click', () => {
  $('#info-modal').classList.remove('open');
  $('#info-modal').setAttribute('aria-hidden', 'true');
});
$('#modal-ok').addEventListener('click', () => {
  $('#info-modal').classList.remove('open');
  $('#info-modal').setAttribute('aria-hidden', 'true');
});
$('#info-modal').addEventListener('click', (event) => {
  if (event.target === $('#info-modal')) {
    $('#info-modal').classList.remove('open');
    $('#info-modal').setAttribute('aria-hidden', 'true');
  }
});

$('#player-more').addEventListener('click', () => showToast('Видео остаётся на устройстве.'));
$('#keyboard-help').addEventListener('click', () => showToast('Пробел — пауза · ←/→ — перемотка · M — звук · F — полный экран'));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if ($('#info-modal').classList.contains('open')) {
      $('#info-modal').classList.remove('open');
      $('#info-modal').setAttribute('aria-hidden', 'true');
      return;
    }
    if (playerOverlay.classList.contains('open')) {
      closePlayer();
      return;
    }
    $('#sidebar').classList.remove('open');
  }

  if (!playerOverlay.classList.contains('open') || event.target.matches('input')) return;

  if (event.code === 'Space') {
    event.preventDefault();
    togglePlay();
  }
  if (event.key === 'ArrowLeft') {
    video.currentTime = Math.max(0, (video.currentTime || 0) - 5);
  }
  if (event.key === 'ArrowRight') {
    video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 5);
  }
  if (event.key.toLowerCase() === 'm') {
    $('#mute-button').click();
  }
  if (event.key.toLowerCase() === 'f') {
    $('#fullscreen-button').click();
  }
  if (event.key === '?') {
    $('#keyboard-help').click();
  }
});

window.addEventListener('beforeunload', () => {
  library.forEach((item) => URL.revokeObjectURL(item.url));
});

$('#speed-button').textContent = '1×';
$('#volume').style.setProperty('--progress', '100%');
$('#seek').style.setProperty('--progress', '0%');
$('#brightness').style.setProperty('--progress', '50%');
$('#contrast').style.setProperty('--progress', '50%');
$('#saturation').style.setProperty('--progress', '50%');
renderLibrary();
resetEnhancement();
