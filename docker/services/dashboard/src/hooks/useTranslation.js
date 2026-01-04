/**
 * useTranslation Hook
 * Provides translation functionality with caching and React state updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { translateText } from '../services/api';

// In-memory cache for translations (shared across all instances)
const translationCache = new Map();
const pendingTranslations = new Map(); // Prevent duplicate concurrent requests

// Cache key generator
function getCacheKey(text, fromLang, toLang) {
    return `${fromLang}:${toLang}:${text}`;
}

// Translate function with caching
async function translateWithCache(text, fromLang, toLang, onComplete) {
    if (!text || typeof text !== 'string' || !text.trim()) {
        if (onComplete) onComplete(text);
        return text;
    }
    
    // If same language, return as-is
    if (fromLang === toLang) {
        if (onComplete) onComplete(text);
        return text;
    }
    
    const cacheKey = getCacheKey(text, fromLang, toLang);
    
    // Check cache first
    if (translationCache.has(cacheKey)) {
        const cached = translationCache.get(cacheKey);
        if (onComplete) onComplete(cached);
        return cached;
    }
    
    // Check if translation is already in progress
    if (pendingTranslations.has(cacheKey)) {
        const pending = pendingTranslations.get(cacheKey);
        pending.then(result => {
            if (onComplete) onComplete(result);
        });
        return pending;
    }
    
    // Create promise for translation
    const translationPromise = translateText(text, fromLang, toLang)
        .then(translated => {
            // Cache the result
            translationCache.set(cacheKey, translated);
            // Remove from pending
            pendingTranslations.delete(cacheKey);
            if (onComplete) onComplete(translated);
            return translated;
        })
        .catch(error => {
            console.error('Translation failed:', error);
            // Remove from pending on error
            pendingTranslations.delete(cacheKey);
            // Return original text on error
            if (onComplete) onComplete(text);
            return text;
        });
    
    // Store promise in pending
    pendingTranslations.set(cacheKey, translationPromise);
    
    return translationPromise;
}

export function useTranslation() {
    const { language } = useApp();
    const [translationUpdates, setTranslationUpdates] = useState(0);
    const translationsRef = useRef(new Map());
    
    // Translation function
    const t = useCallback((text) => {
        if (!text || typeof text !== 'string') {
            return text || '';
        }
        
        // If language is English, return as-is
        if (language === 'en') {
            return text;
        }
        
        // For Thai, check if we have a cached translation
        const cacheKey = getCacheKey(text, 'en', 'th');
        
        // Check global cache first
        if (translationCache.has(cacheKey)) {
            const translated = translationCache.get(cacheKey);
            // Store in ref for quick access
            translationsRef.current.set(cacheKey, translated);
            return translated;
        }
        
        // Check ref cache
        if (translationsRef.current.has(cacheKey)) {
            return translationsRef.current.get(cacheKey);
        }
        
        // Start async translation
        translateWithCache(text, 'en', 'th', (translated) => {
            // Update ref
            translationsRef.current.set(cacheKey, translated);
            // Trigger re-render by updating state
            setTranslationUpdates(prev => prev + 1);
        });
        
        // Return original text for now (will update when translation completes)
        return text;
    }, [language, translationUpdates]);
    
    return { t };
}

export default useTranslation;
