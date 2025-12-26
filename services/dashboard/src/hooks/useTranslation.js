/**
 * useTranslation Hook
 * Uses static dictionary for UI translations - no API calls needed
 * Simple and fast - just looks up text in the dictionary
 */

import { useMemo, useCallback } from 'react';
import { getTranslation } from '../i18n/dictionary.js';

/**
 * Hook for translating UI text using static dictionary
 * @param {string} language - Current language ('en' | 'th')
 * @returns {{ t: function }} Translation function
 */
export function useTranslation(language = 'en') {
    // Create memoized translation function
    const t = useCallback((text) => {
        if (!text) return text;
        return getTranslation(text, language);
    }, [language]);

    return { t };
}

export default useTranslation;
