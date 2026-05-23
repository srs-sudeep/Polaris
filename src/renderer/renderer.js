const ui = {
  tabButtons: [...document.querySelectorAll('.tab-button')],
  tabPanels: [...document.querySelectorAll('.tab-panel')],
  monitoringButton: document.getElementById('monitoringButton'),
  monitoringInline: document.getElementById('monitoringInline'),
  shortcutInline: document.getElementById('shortcutInline'),
  shortcutSelect: document.getElementById('shortcutSelect'),
  shortcutStatus: document.getElementById('shortcutStatus'),
  sourceLanguage: document.getElementById('sourceLanguage'),
  targetLanguage: document.getElementById('targetLanguage'),
  swapButton: document.getElementById('swapButton'),
  translateButton: document.getElementById('translateButton'),
  clearTextButton: document.getElementById('clearTextButton'),
  speakSourceButton: document.getElementById('speakSourceButton'),
  speakTranslationButton: document.getElementById('speakTranslationButton'),
  copyTranslationButton: document.getElementById('copyTranslationButton'),
  sourceInput: document.getElementById('sourceInput'),
  translationText: document.getElementById('translationText'),
  sourceLabel: document.getElementById('sourceLabel'),
  providerLabel: document.getElementById('providerLabel'),
  historyList: document.getElementById('historyList'),
  historyMeta: document.getElementById('historyMeta'),
  clearHistoryButton: document.getElementById('clearHistoryButton')
};

let currentHistory = [];
let currentTranslation = '';

window.addEventListener('DOMContentLoaded', async () => {
  bindActions();
  window.polaris.onState(renderState);
  window.polaris.onTranslation(renderTranslationResult);
  window.polaris.onHistory(renderHistory);

  const state = await window.polaris.getState();
  ui.sourceLanguage.value = state.sourceLang || 'auto';
  ui.targetLanguage.value = state.targetLang || 'en';
  ui.shortcutSelect.value = state.shortcut || 'CommandOrControl+Shift+T';
  renderState(state);
  renderHistory(await window.polaris.getHistory());
});

function bindActions() {
  ui.tabButtons.forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  ui.translateButton.addEventListener('click', translateManual);
  ui.monitoringButton.addEventListener('click', () => window.polaris.toggleClipboardMonitoring());
  ui.clearHistoryButton.addEventListener('click', () => window.polaris.clearHistory());

  ui.clearTextButton.addEventListener('click', () => {
    ui.sourceInput.value = '';
    ui.translationText.textContent = 'No translation yet.';
    currentTranslation = '';
    ui.sourceLabel.textContent = 'Type, paste, copy, or use the selected-text shortcut.';
    ui.providerLabel.textContent = 'Free APIs';
    ui.sourceInput.focus();
  });

  ui.copyTranslationButton.addEventListener('click', async () => {
    if (!currentTranslation) {
      return;
    }
    await window.polaris.writeClipboard(currentTranslation);
    flashButton(ui.copyTranslationButton, 'Copied');
  });

  ui.speakSourceButton.addEventListener('click', () => speak(ui.sourceInput.value, ui.sourceLanguage.value));
  ui.speakTranslationButton.addEventListener('click', () => speak(currentTranslation, ui.targetLanguage.value));

  ui.sourceInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      translateManual();
    }
  });

  ui.sourceLanguage.addEventListener('change', updateLanguages);
  ui.targetLanguage.addEventListener('change', updateLanguages);

  ui.shortcutSelect.addEventListener('change', async () => {
    const result = await window.polaris.updateShortcut(ui.shortcutSelect.value);
    if (!result.ok) {
      ui.shortcutStatus.textContent = result.error;
      ui.shortcutSelect.value = result.shortcut;
      return;
    }
    ui.shortcutStatus.textContent = `Selected-text shortcut updated to ${formatShortcut(result.shortcut)}.`;
  });

  ui.swapButton.addEventListener('click', () => {
    const source = ui.sourceLanguage.value;
    const target = ui.targetLanguage.value;
    if (source === 'auto') {
      ui.sourceLanguage.value = target;
      ui.targetLanguage.value = 'ja';
    } else {
      ui.sourceLanguage.value = target;
      ui.targetLanguage.value = source;
    }
    updateLanguages();
  });
}

function activateTab(tabName) {
  ui.tabButtons.forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  ui.tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `${tabName}-tab`));
}

function translateManual() {
  return window.polaris.translateManual({
    text: ui.sourceInput.value,
    sourceLang: ui.sourceLanguage.value,
    targetLang: ui.targetLanguage.value
  });
}

function updateLanguages() {
  return window.polaris.updateLanguages({
    sourceLang: ui.sourceLanguage.value,
    targetLang: ui.targetLanguage.value
  });
}

function renderState(state) {
  const shortcut = state.shortcut || 'CommandOrControl+Shift+T';
  ui.shortcutInline.textContent = formatShortcut(shortcut);
  ui.shortcutSelect.value = shortcut;

  ui.monitoringButton.textContent = state.clipboardMonitoring ? 'Monitoring on' : 'Monitoring off';
  ui.monitoringButton.classList.toggle('off', !state.clipboardMonitoring);
  ui.monitoringInline.textContent = state.clipboardMonitoring
    ? 'Copy Japanese text and it translates automatically.'
    : 'Clipboard auto-translate is off. Enable it in Settings.';

  ui.translateButton.disabled = Boolean(state.busy);
  ui.translateButton.textContent = state.busy ? 'Translating...' : 'Translate';
}

function renderTranslationResult(result) {
  if (!result.ok) {
    ui.sourceLabel.textContent = result.sourceLabel || 'Error';
    ui.translationText.textContent = result.error || 'Translation failed.';
    currentTranslation = '';
    ui.providerLabel.textContent = 'Error';
    activateTab('translate');
    return;
  }

  renderReaderItem(result.item);
  activateTab('translate');
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
  button.addEventListener('click', () => {
    renderReaderItem(item);
    activateTab('translate');
  });

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
  ui.providerLabel.textContent = `${item.provider || 'Free APIs'} · ${item.sourceLang || 'auto'} -> ${item.targetLang || 'en'}`;
  ui.sourceInput.value = item.original || '';
  ui.translationText.textContent = item.translation || '';
  currentTranslation = item.translation || '';
}

function speak(text, language) {
  const value = String(text || '').trim();
  if (!value || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = language === 'auto' ? 'ja-JP' : language;
  window.speechSynthesis.speak(utterance);
}

function flashButton(button, label) {
  const previous = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = previous;
  }, 1000);
}

function formatShortcut(accelerator) {
  return String(accelerator || '')
    .replace('CommandOrControl', 'Ctrl/Cmd')
    .replaceAll('+', ' + ');
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
