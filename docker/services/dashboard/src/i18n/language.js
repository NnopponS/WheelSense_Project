/**
 * Language State Management
 * Handles language preference storage and retrieval
 */

const LANGUAGE_STORAGE_KEY = 'wheelsense_language';

/**
 * Get current language from localStorage
 */
export function getLanguage() {
    if (typeof window === 'undefined') return 'en';
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (saved === 'th' ? 'th' : 'en');
}

/**
 * Save language preference to localStorage
 */
export function setLanguage(lang) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

/**
 * Check if current language is Thai
 */
export function isThai() {
    return getLanguage() === 'th';
}

