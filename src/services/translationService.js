const axios = require('axios');

const DEFAULT_SOURCE_LANGUAGE = 'ja';
const DEFAULT_TARGET_LANGUAGE = 'en';
const MAX_CACHE_ENTRIES = 200;
const MAX_CHUNK_LENGTH = 480;

const client = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent': 'PolarisReader/1.0'
  }
});

const cache = new Map();

function containsJapanese(text) {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text || '');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeLanguage(language, fallback) {
  const value = String(language || fallback).trim().toLowerCase();
  return value === 'jp' ? 'ja' : value;
}

function detectLanguage(text) {
  if (containsJapanese(text)) {
    return 'ja';
  }

  if (/^[a-z0-9\s.,!?;:'"()[\]{}\-_/\\@#$%^&*+=<>|`~]+$/i.test(String(text || '').trim())) {
    return 'en';
  }

  return DEFAULT_SOURCE_LANGUAGE;
}

async function translateText(text, options = {}) {
  const original = normalizeText(text);
  if (!original) {
    throw new Error('No text was provided for translation.');
  }

  const sourceLang = normalizeLanguage(options.sourceLang || detectLanguage(original), DEFAULT_SOURCE_LANGUAGE);
  const targetLang = normalizeLanguage(options.targetLang, DEFAULT_TARGET_LANGUAGE);

  if (sourceLang === targetLang) {
    return {
      original,
      translation: original,
      sourceLang,
      targetLang,
      provider: 'local'
    };
  }

  const cacheKey = `${sourceLang}:${targetLang}:${original}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const chunks = splitText(original);
  const translatedChunks = [];
  let provider = 'MyMemory';
  const errors = [];

  for (const chunk of chunks) {
    try {
      translatedChunks.push(await translateWithMyMemory(chunk, sourceLang, targetLang));
    } catch (error) {
      errors.push(`MyMemory: ${error.message}`);
      try {
        provider = 'LibreTranslate';
        translatedChunks.push(await translateWithLibreTranslate(chunk, sourceLang, targetLang));
      } catch (fallbackError) {
        errors.push(`LibreTranslate: ${fallbackError.message}`);
        throw new Error(`Translation failed. ${errors.join(' | ')}`);
      }
    }
  }

  const result = {
    original,
    translation: translatedChunks.join('\n').trim(),
    sourceLang,
    targetLang,
    provider
  };

  cacheResult(cacheKey, result);
  return result;
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
  const response = await client.get('https://api.mymemory.translated.net/get', {
    params: {
      q: text,
      langpair: `${sourceLang}|${targetLang}`
    }
  });

  const translatedText = response.data?.responseData?.translatedText;
  if (!translatedText || response.data?.responseStatus >= 400) {
    throw new Error(response.data?.responseDetails || 'No translation returned.');
  }

  return decodeHtmlEntities(translatedText);
}

async function translateWithLibreTranslate(text, sourceLang, targetLang) {
  const endpoint = process.env.LIBRETRANSLATE_URL || 'https://libretranslate.com/translate';
  const response = await client.post(endpoint, {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: 'text'
  });

  if (!response.data?.translatedText) {
    throw new Error('No translation returned.');
  }

  return decodeHtmlEntities(response.data.translatedText);
}

function splitText(text) {
  if (text.length <= MAX_CHUNK_LENGTH) {
    return [text];
  }

  const parts = [];
  let current = '';

  for (const sentence of text.split(/(?<=[。！？.!?])\s*/).filter(Boolean)) {
    if ((current + sentence).length <= MAX_CHUNK_LENGTH) {
      current += sentence;
    } else {
      if (current) {
        parts.push(current);
      }
      current = sentence;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts.flatMap((part) => {
    if (part.length <= MAX_CHUNK_LENGTH) {
      return part;
    }

    const chunks = [];
    for (let index = 0; index < part.length; index += MAX_CHUNK_LENGTH) {
      chunks.push(part.slice(index, index + MAX_CHUNK_LENGTH));
    }
    return chunks;
  });
}

function cacheResult(key, result) {
  cache.set(key, result);
  if (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
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

module.exports = {
  translateText,
  containsJapanese,
  detectLanguage,
  normalizeText
};
