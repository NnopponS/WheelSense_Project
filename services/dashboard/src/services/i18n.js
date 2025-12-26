/**
 * i18n Service - Static Translation
 * Uses dictionary for UI translations - fast and reliable
 * Dynamic translation (deep-translator) is only used in AI chat
 */

// Re-export static translation functions
export { getTranslation, createTranslator, thaiTranslations } from '../i18n/dictionary.js';

// Preload is no longer needed since translations are static
export function preloadTranslator() {
    console.log('[i18n] Using static translations - no preload needed');
}

// Clear cache is no longer needed
export function clearCache() {
    console.log('[i18n] Static translations - no cache to clear');
}

// Simple sync translation function
export function tSync(text, language = 'en') {
    if (language === 'en' || !text) return text;

    // Import and use the dictionary
    const { thaiTranslations } = require('../i18n/dictionary.js');
    return thaiTranslations[text] || text;
}

// Alias for tSync
export const t = tSync;

// NOTE: Dynamic translation via deep-translator is ONLY used in AIChatPopup.jsx
// for translating user input and AI responses
