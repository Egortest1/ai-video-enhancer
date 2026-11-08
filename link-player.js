(() => {
  const input = document.querySelector('#video-url');
  const openButton = document.querySelector('#open-link-button');
  const hint = document.querySelector('#link-hint');
  const frame = document.querySelector('#embed-frame');
  const stage = document.querySelector('#video-stage');
  if (!input || !openButton || !frame || !stage) return;

  function parseLink(raw) {
    let url;
    try { url = new URL(raw.trim()); } catch { throw new Error('Вставьте корректную ссылку, начинающуюся с http:// или https://.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Разрешены только публичные ссылки HTTP или HTTPS.');
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let embedUrl = null;
    let title = host;
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = host === 'youtu.be' ? parts[0] : url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : null);
      if (!id || !/^[\w-]{6,20}$/.test(id)) throw new Error('Не удалось определить публичный ID ролика YouTube.');
      embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
      title = 'YouTube video';
    } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const match = url.pathname.match(/(?:video\/)?(\d{6,})/);
      if (!match) throw new Error('Не удалось определить публичный ID ролика Vimeo.');
      embedUrl = `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
      title = 'Vimeo video';
    }
    return { url: url.href, embedUrl, title, host };
  }

  function showError(message) {
    hint.textContent = message;
    hint.classList.add('link-error');
  }
  function clearError() {
    hint.textContent = 'Прямые видео URL и публичные встраиваемые ролики YouTube/Vimeo. Веб-страницы и защищённые трансляции не поддерживаются.';
    hint.classList.remove('link-error');
  }
  function updatePlayer(item) {
    activeVideo = item;
    if (item.embedUrl) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      frame.src = item.embedUrl;
      stage.classList.add('embed-mode');
      $('#player-title').textContent = item.name;
      $('#info-title').textContent = item.name;
      $('#info-format').textContent = item.host === 'youtube.com' ? 'YouTube embed' : 'Web embed';
      $('#info-duration').textContent = '—';
      $('#info-size').textContent = 'Поток';
      $('#ai-status').textContent = 'Для AI-улучшения нужен видеофайл, который вы вправе обрабатывать. Встроенный ролик не загружается в AI.';
      $('#ai-run-button').disabled = true;
      $('#video-empty').classList.add('hidden');
    } else {
      frame.removeAttribute('src');
      stage.classList.remove('embed-mode');
      $('#ai-run-button').disabled = false;
      $('#ai-status').textContent = item.file
        ? 'Real-ESRGAN x2 · файл загружается на сервер для обработки.'
        : 'Прямая ссылка открыта для просмотра. Для AI-обработки загрузите разрешённый файл.';
    }
  }

  function openLink() {
    clearError();
    let parsed;
    try { parsed = parseLink(input.value); }
    catch (error) { showError(error.message); return; }
    const item = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: parsed.title === parsed.host ? `Видео · ${parsed.host}` : parsed.title,
      url: parsed.url,
      embedUrl: parsed.embedUrl,
      host: parsed.host,
      size: 0,
      duration: 0,
      addedAt: Date.now(),
      isRemote: true
    };
    library.unshift(item);
    renderLibrary();
    openPlayer(item);
    updatePlayer(item);
    if (item.embedUrl) {
      showToast('Открыт встроенный плеер. Контролы зависят от видеосервиса.');
    } else {
      video.src = item.url;
      video.load();
      video.play().catch(() => showToast('Ссылка принята, но браузер не смог запустить поток. Проверьте прямой URL, права доступа и формат видео.'));
      video.onloadedmetadata = () => {
        item.duration = video.duration || 0;
        $('#info-format').textContent = video.currentSrc.includes('.m3u8') ? 'HLS stream' : 'Видео-поток';
        renderLibrary();
      };
      video.onerror = () => showToast('Источник запретил воспроизведение или ссылка ведёт не на прямой видеофайл. Попробуйте ссылку с кнопкой Embed.');
    }
    input.value = '';
  }

  openButton.addEventListener('click', openLink);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') openLink(); });
  input.addEventListener('input', clearError);

  videoGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-play]');
    if (!card) return;
    const item = library.find((entry) => entry.id === card.dataset.play);
    if (!item?.isRemote) return;
    setTimeout(() => {
      updatePlayer(item);
      if (item.embedUrl) {
        frame.src = item.embedUrl;
      } else {
        video.src = item.url;
        video.load();
        video.play().catch(() => {});
      }
    }, 0);
  });

  document.querySelector('#close-player')?.addEventListener('click', () => {
    frame.removeAttribute('src');
    stage.classList.remove('embed-mode');
  });
  document.querySelector('#close-player-x')?.addEventListener('click', () => {
    frame.removeAttribute('src');
    stage.classList.remove('embed-mode');
  });
})();
