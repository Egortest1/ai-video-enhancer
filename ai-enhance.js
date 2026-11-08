(() => {
  const button = document.querySelector('#ai-run-button');
  if (!button) return;
  const status = document.querySelector('#ai-status');
  const progressBar = document.querySelector('#ai-progress-bar');
  const actions = document.querySelector('#ai-actions');
  const playResult = document.querySelector('#ai-play-result');
  const downloadResult = document.querySelector('#ai-download-result');
  let pollTimer;
  let resultUrl = null;

  function updateProgress(value) {
    progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }
  function setStatus(message) { status.textContent = message; }
  function clearResult() {
    actions.classList.add('hidden');
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    downloadResult.removeAttribute('href');
  }
  async function request(url, options) {
    let response;
    try { response = await fetch(url, options); }
    catch { throw new Error('Не удалось подключиться к AI-серверу. Запустите backend по инструкции README.'); }
    if (!response.ok) {
      let message = 'Ошибка AI-сервера.';
      try { message = (await response.json()).detail || message; } catch { /* ignore non-JSON response */ }
      throw new Error(message);
    }
    return response;
  }

  button.addEventListener('click', async () => {
    if (!activeVideo?.file) {
      showToast('Сначала выберите исходное видео.');
      return;
    }
    clearTimeout(pollTimer);
    clearResult();
    button.disabled = true;
    updateProgress(3);
    setStatus('Загружаем видео на сервер…');
    const form = new FormData();
    form.append('file', activeVideo.file, activeVideo.name);
    try {
      const response = await request('/api/jobs', { method: 'POST', body: form });
      const job = await response.json();
      if (!job.id) throw new Error('Сервер не вернул идентификатор задачи.');
      pollJob(job.id);
    } catch (error) {
      button.disabled = false;
      updateProgress(0);
      setStatus(error.message);
    }
  });

  async function pollJob(id) {
    try {
      const response = await request(`/api/jobs/${encodeURIComponent(id)}`);
      const job = await response.json();
      updateProgress(job.progress || 0);
      setStatus(job.message || 'Обрабатываем кадры нейросетью…');
      if (job.status === 'failed') throw new Error(job.error || 'AI-обработка не удалась.');
      if (job.status === 'done') {
        const resultResponse = await request(`/api/jobs/${encodeURIComponent(id)}/result`);
        const blob = await resultResponse.blob();
        resultUrl = URL.createObjectURL(blob);
        downloadResult.href = resultUrl;
        downloadResult.download = job.filename || 'frame-enhanced.mp4';
        actions.classList.remove('hidden');
        button.disabled = false;
        updateProgress(100);
        setStatus('Готово! Улучшенное видео можно посмотреть или скачать.');
        return;
      }
      pollTimer = setTimeout(() => pollJob(id), 1600);
    } catch (error) {
      button.disabled = false;
      updateProgress(0);
      setStatus(error.message);
    }
  }

  playResult.addEventListener('click', () => {
    if (!resultUrl) return;
    video.pause();
    video.src = resultUrl;
    video.load();
    video.play().catch(() => showToast('Нажмите Play для начала просмотра результата.'));
    showToast('Воспроизводится AI-улучшенная версия.');
  });
})();
