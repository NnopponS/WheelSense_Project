import { useCallback, useState, useEffect, useRef } from 'react';
import { translate } from '../i18n/translate.js';

/**
 * Hook for translations with async support
 * 
 * ⚠️ IMPORTANT: All visible UI strings MUST go through t()
 * 
 * Usage:
 * ```jsx
 * const { t } = useTranslation(language);
 * <h1>{t('Page Title')}</h1>
 * ```
 * 
 * For static strings, consider using the <Text> component instead.
 * 
 * @param {string} language - Current language ('en' | 'th')
 * @returns {Object} { t, ready, hasPending }
 *   - t: Translation function (string) => string
 *   - ready: Whether translations are ready (boolean)
 *   - hasPending: Whether translations are currently pending (boolean)
 * 
 * @example
 * // ✅ CORRECT
 * const { t } = useTranslation(language);
 * <button>{t('Save')}</button>
 * 
 * @example
 * // ❌ WRONG - Hardcoded string bypasses translation
 * <button>Save</button>
 */
export function useTranslation(language) {
    const [translations, setTranslations] = useState(new Map());
    const [updateCounter, setUpdateCounter] = useState(0); // Counter to force re-renders
    const [ready, setReady] = useState(language === 'en');
    const [hasPending, setHasPending] = useState(false);
    const pendingTranslations = useRef(new Set());
    const translationsRef = useRef(new Map());
    
    // Keep ref in sync with state for immediate lookups
    useEffect(() => {
        translationsRef.current = translations;
    }, [translations]);

    // Translate function that handles async updates
    const t = useCallback((englishText) => {
        if (!englishText) return englishText;
        if (language === 'en') return englishText;

        // Check if we have a cached translation (check ref for performance, state for reactivity)
        const cached = translationsRef.current.get(englishText);
        if (cached) return cached;

        // Avoid duplicate translation requests
        if (pendingTranslations.current.has(englishText)) {
            return englishText;
        }

        // Mark as pending
        pendingTranslations.current.add(englishText);
        setHasPending(true);

        // Start async translation
        translate(englishText, language).then((translated) => {
            console.log('[useTranslation] Translation received:', englishText, '->', translated);
            setTranslations((prev) => {
                const next = new Map(prev);
                next.set(englishText, translated);
                translationsRef.current = next; // Update ref immediately
                return next;
            });
            // Increment counter to force re-render
            setUpdateCounter(c => c + 1);
            pendingTranslations.current.delete(englishText);
            
            // Update pending state
            if (pendingTranslations.current.size === 0) {
                setHasPending(false);
            }
            
            setReady(true);
        }).catch((error) => {
            console.error('[useTranslation] Translation failed:', error);
            // Fallback: use English
            setTranslations((prev) => {
                const next = new Map(prev);
                next.set(englishText, englishText);
                translationsRef.current = next; // Update ref immediately
                return next;
            });
            // Increment counter to force re-render
            setUpdateCounter(c => c + 1);
            pendingTranslations.current.delete(englishText);
            
            // Update pending state
            if (pendingTranslations.current.size === 0) {
                setHasPending(false);
            }
        });

        // Return English immediately (will update when translation arrives)
        return englishText;
    }, [language, updateCounter]); // Depend on updateCounter to force re-render when translations update

    // Clear translations when language changes
    useEffect(() => {
        console.log('[useTranslation] Language changed to:', language);
        setTranslations(new Map());
        translationsRef.current = new Map();
        pendingTranslations.current.clear();
        setReady(language === 'en');
        setHasPending(false);
        setUpdateCounter(0); // Reset counter
    }, [language]);

    return { t, ready, hasPending };
}
