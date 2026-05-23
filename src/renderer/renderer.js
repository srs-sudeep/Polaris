const ui = {
  statePill: document.getElementById('statePill'),
  selectionButton: document.getElementById('selectionButton'),
  clipboardButton: document.getElementById('clipboardButton'),
  monitoringButton: document.getElementById('monitoringButton'),
  originalText: document.getElementById('originalText'),
  translationText: document.getElementById('translationText'),
  sourceLabel: document.getElementById('sourceLabel'),
  providerLabel: document.getElementById('providerLabel'),
  historyList: document.getElementById('historyList'),
  historyMeta: document.getElementById('historyMeta'),
  clearHistoryButton: document.getElementById('clearHistoryButton')
};

let currentHistory = [];

window.addEventListener('DOMContentLoaded', async () => {
  bindActions();
  window.polaris.onState(renderState);
  window.polaris.onTranslation(renderTranslationResult);
  window.polaris.onHistory(renderHistory);

  renderState(await window.polaris.getState());
  renderHistory(await window.polaris.getHistory());
});

function bindActions() {
  ui.selectionButton.addEventListener('click', () => {
    window.polaris.translateSelection();
  });

  ui.clipboardButton.addEventListener('click', () => {
    window.polaris.translateClipboard();
  });

  ui.monitoringButton.addEventListener('click', () => {
    window.polaris.toggleClipboardMonitoring();
  });

  ui.clearHistoryButton.addEventListener('click', () => {
    window.polaris.clearHistory();
  });
}

function renderState(state) {
  ui.statePill.textContent = state.busy ? 'Working' : state.status || 'Ready';
  ui.statePill.classList.toggle('busy', Boolean(state.busy));
  ui.statePill.classList.toggle('error', !state.busy && isErrorStatus(state.status));

  ui.monitoringButton.textContent = state.clipboardMonitoring
    ? 'Monitoring on'
    : 'Monitoring off';

  ui.selectionButton.disabled = Boolean(state.busy);
  ui.clipboardButton.disabled = Boolean(state.busy);
}

function renderTranslationResult(result) {
  if (!result.ok) {
    ui.sourceLabel.textContent = result.sourceLabel || 'Error';
    ui.translationText.textContent = result.error || 'Translation failed.';
    ui.providerLabel.textContent = 'Error';
    return;
  }

  renderReaderItem(result.item);
}

function renderHistory(history) {
  currentHistory = Array.isArray(history) ? history : [];
  ui.historyMeta.textContent = currentHistory.length
    ? `${currentHistory.length} saved in this session`
    : 'No history yet';

  if (!currentHistory.length) {
    ui.historyList.innerHTML = '<div class="empty-state">Recent translations will appear here.</div>';
    return;
  }

  ui.historyList.replaceChildren(...currentHistory.map(createHistoryItem));
}

function createHistoryItem(item) {
  const button = document.createElement('button');
  button.className = 'history-item';
  button.type = 'button';
  button.addEventListener('click', () => renderReaderItem(item));

  const textWrap = document.createElement('div');
  const original = document.createElement('p');
  original.className = 'history-original';
  original.textContent = item.original;

  const translation = document.createElement('p');
  translation.className = 'history-translation';
  translation.textContent = item.translation;

  const time = document.createElement('span');
  time.className = 'history-time';
  time.textContent = formatTime(item.createdAt);

  textWrap.append(original, translation);
  button.append(textWrap, time);
  return button;
}

function renderReaderItem(item) {
  ui.sourceLabel.textContent = item.sourceLabel || 'Translation';
  ui.providerLabel.textContent = `${item.provider || 'Free APIs'} · ${item.sourceLang || 'ja'} -> ${item.targetLang || 'en'}`;
  ui.originalText.textContent = item.original || '';
  ui.translationText.textContent = item.translation || '';
}

function formatTime(isoDate) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(isoDate));
  } catch (_error) {
    return '';
  }
}

function isErrorStatus(status) {
  return /failed|could not|does not|select text|error/i.test(status || '');
}
