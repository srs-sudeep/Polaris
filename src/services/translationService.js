const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_CHUNK_LENGTH = 450;
const MAX_CACHE_ENTRIES = 250;
const CACHE_TTL_MS = 1000 * 60 * 60;

const api = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  headers: {
    'User-Agent': 'PolarisTranslator/1.0'
  }
});

const translationCache = new Map();

const PROVIDERS = {
  myMemory: {
    label: 'MyMemory',
    translate: async (text, sourceLang, targetLang) => {
      const response = await api.get('https://api.mymemory.translated.net/get', {
        params: {
          q: text,
          langpair: `${sourceLang}|${targetLang}`
        }
      });

      const body = response.data;
      const translatedText = body?.responseData?.translatedText;

      if (!translatedText || body?.responseStatus >= 400) {
        throw new Error(body?.responseDetails || 'MyMemory did not return a translation');
      }

      return decodeHtmlEntities(translatedText);
    }
  },
  libreTranslate: {
    label: 'LibreTranslate',
    translate: async (text, sourceLang, targetLang) => {
      const response = await api.post('https://libretranslate.de/translate', {
        q: text,
        source: sourceLang === 'auto' ? 'auto' : sourceLang,
        target: targetLang,
        format: 'text'
      });

      if (!response.data?.translatedText) {
        throw new Error('LibreTranslate did not return a translation');
      }

      return decodeHtmlEntities(response.data.translatedText);
    }
  }
};

let currentProvider = 'myMemory';

function normalizeLanguageCode(languageCode, fallback = 'ja') {
  if (!languageCode || typeof languageCode !== 'string') {
    return fallback;
  }

  const normalized = languageCode.toLowerCase().trim();
  if (normalized === 'jp') {
    return 'ja';
  }

  return normalized;
}

function containsJapanese(text) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text || '');
}

async function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return 'auto';
  }

  const englishRegex = /^[a-zA-Z0-9\s.,!?;:'"()[\]{}\-_/\\@#$%^&*+=<>|`~]+$/;

  if (containsJapanese(text)) {
    return 'ja';
  }

  if (englishRegex.test(text.trim())) {
    return 'en';
  }

  return 'auto';
}

async function translateText(text, sourceLang = 'ja', targetLang = 'en', options = {}) {
  const cleanedText = normalizeText(text);
  if (!cleanedText) {
    throw new Error('No text provided for translation');
  }

  const resolvedSource = normalizeLanguageCode(
    sourceLang === 'auto' ? await detectLanguage(cleanedText) : sourceLang,
    'ja'
  );
  const resolvedTarget = normalizeLanguageCode(targetLang, 'en');

  if (resolvedSource === resolvedTarget) {
    return cleanedText;
  }

  const cacheKey = buildCacheKey(cleanedText, resolvedSource, resolvedTarget, options.provider || currentProvider);
  const cached = getCachedTranslation(cacheKey);
  if (cached) {
    return cached;
  }

  const chunks = splitText(cleanedText, options.maxChunkLength || MAX_CHUNK_LENGTH);
  const translatedChunks = [];

  for (const chunk of chunks) {
    translatedChunks.push(await translateChunk(chunk, resolvedSource, resolvedTarget, options));
  }

  const translation = translatedChunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  setCachedTranslation(cacheKey, translation);
  return translation;
}

async function translateChunk(text, sourceLang, targetLang, options = {}) {
  const preferredProvider = options.provider || currentProvider;
  const providerOrder = [
    preferredProvider,
    ...Object.keys(PROVIDERS).filter((providerName) => providerName !== preferredProvider)
  ];

  const errors = [];

  for (const providerName of providerOrder) {
    const provider = PROVIDERS[providerName];
    if (!provider) {
      continue;
    }

    try {
      return await provider.translate(text, sourceLang, targetLang);
    } catch (error) {
      errors.push(`${provider.label}: ${error.message}`);
    }
  }

  throw new Error(`Translation failed. ${errors.join(' | ')}`);
}

function splitText(text, maxLength) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  const paragraphs = text.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      continue;
    }

    if (trimmedParagraph.length <= maxLength) {
      chunks.push(trimmedParagraph);
      continue;
    }

    const sentences = trimmedParagraph
      .split(/(?<=[。！？.!?])\s*/)
      .filter(Boolean);

    let currentChunk = '';
    for (const sentence of sentences) {
      if (!currentChunk) {
        currentChunk = sentence;
        continue;
      }

      if (`${currentChunk}${sentence}`.length <= maxLength) {
        currentChunk += sentence;
      } else {
        chunks.push(currentChunk);
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      while (currentChunk.length > maxLength) {
        chunks.push(currentChunk.slice(0, maxLength));
        currentChunk = currentChunk.slice(maxLength);
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }
    }
  }

  return chunks.length ? chunks : [text.slice(0, maxLength)];
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n')
    .trim();
}

function buildCacheKey(text, sourceLang, targetLang, provider) {
  return `${provider}:${sourceLang}:${targetLang}:${text}`;
}

function getCachedTranslation(cacheKey) {
  const cached = translationCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    translationCache.delete(cacheKey);
    return null;
  }

  return cached.translation;
}

function setCachedTranslation(cacheKey, translation) {
  translationCache.set(cacheKey, {
    translation,
    createdAt: Date.now()
  });

  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function setProvider(provider) {
  if (!PROVIDERS[provider]) {
    throw new Error(`Unknown translation provider: ${provider}`);
  }
  currentProvider = provider;
}

function getProviderStatus() {
  return {
    currentProvider,
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([key, provider]) => [key, provider.label])
    )
  };
}

module.exports = {
  translateText,
  detectLanguage,
  containsJapanese,
  normalizeLanguageCode,
  setProvider,
  getProviderStatus
};
