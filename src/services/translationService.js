const axios = require('axios');

// Free translation API - MyMemory (free tier: 10000 words/day)
// Alternative: Google Translate API (paid), DeepL API (paid), or OpenAI API
const TRANSLATION_API = {
  // Using MyMemory Translation API (free)
  myMemory: async (text, sourceLang, targetLang) => {
    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: text,
        langpair: `${sourceLang}|${targetLang}`
      }
    });
    return response.data.responseData.translatedText;
  },
  
  // Using LibreTranslate (free, self-hostable)
  libreTranslate: async (text, sourceLang, targetLang) => {
    // You can use public LibreTranslate instance or host your own
    const response = await axios.post('https://libretranslate.de/translate', {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: 'text'
    });
    return response.data.translatedText;
  }
};

let currentProvider = 'myMemory';

async function translateText(text, sourceLang = 'ja', targetLang = 'en') {
  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for translation');
  }

  try {
    // Try MyMemory first (free)
    const translation = await TRANSLATION_API.myMemory(text, sourceLang, targetLang);
    return translation;
  } catch (error) {
    console.error('Translation error:', error);
    // Fallback to LibreTranslate
    try {
      const translation = await TRANSLATION_API.libreTranslate(text, sourceLang, targetLang);
      return translation;
    } catch (fallbackError) {
      throw new Error(`Translation failed: ${fallbackError.message}`);
    }
  }
}

async function detectLanguage(text) {
  // Simple detection based on character patterns
  // For production, use a proper language detection library
  const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  const englishRegex = /^[a-zA-Z\s.,!?;:'"()-]+$/;
  
  if (japaneseRegex.test(text)) {
    return 'ja';
  } else if (englishRegex.test(text)) {
    return 'en';
  }
  return 'auto';
}

// For production use, consider integrating:
// - Google Cloud Translation API (paid, accurate)
// - DeepL API (paid, excellent quality)
// - Azure Translator (paid, good quality)
// - AWS Translate (paid)
// Or use a free library like: 'google-translate-api-x' (unofficial)

module.exports = {
  translateText,
  detectLanguage,
  setProvider: (provider) => { currentProvider = provider; }
};
