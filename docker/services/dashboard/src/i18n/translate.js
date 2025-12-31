/**
 * Translation Service
 * Handles EN->TH translation with caching and protection
 */

import { protectText, unprotectText } from './protect.js';
import * as api from '../services/api.js';

// In-memory cache for translations
const translationCache = new Map();

// In-flight requests deduplication (prevents concurrent duplicate requests)
const inFlightRequests = new Map();

// Cache key generator
function getCacheKey(text, targetLang) {
    return `${targetLang}::${text}`;
}

/**
 * Translate text from English to Thai (or return original if EN)
 * @param {string} text - English text to translate
 * @param {string} targetLang - Target language ('en' | 'th')
 * @returns {Promise<string>} Translated text (or original if targetLang is 'en')
 */
export async function translate(text, targetLang = 'th') {
    // If English, return as-is
    if (targetLang === 'en' || !text || text.trim().length === 0) {
        return text;
    }

    // Check cache first
    const cacheKey = getCacheKey(text, targetLang);
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    // Check if there's already an in-flight request for this text
    if (inFlightRequests.has(cacheKey)) {
        // Return the existing promise
        return inFlightRequests.get(cacheKey);
    }

    // Create a new translation promise
    const translationPromise = (async () => {
        try {
            console.log('[translate] Starting translation:', text);
            // Step 1: Protect technical terms and code segments
            const { protectedText, segments } = protectText(text);
            console.log('[translate] Protected text:', protectedText);

            // Step 2: Call translation API
            const response = await api.translateText(protectedText, 'en', targetLang);
            console.log('[translate] API response:', response);
            let translated = response.translated || protectedText;

            // Step 3: Restore protected segments
            translated = unprotectText(translated, segments);
            console.log('[translate] Final translated:', translated);

            // Step 4: Cache the result
            translationCache.set(cacheKey, translated);

            return translated;
        } catch (error) {
            console.error('[translate] Translation failed:', error);
            // Fallback: return original text
            return text;
        } finally {
            // Remove from in-flight requests
            inFlightRequests.delete(cacheKey);
        }
    })();

    // Store the promise for deduplication
    inFlightRequests.set(cacheKey, translationPromise);

    return translationPromise;
}

/**
 * Synchronous wrapper for translation (returns English immediately, updates async)
 * For use in React components that need immediate rendering
 */
export function tSync(text, targetLang = 'en') {
    if (targetLang === 'en') {
        return text;
    }
    // Return cached translation if available, otherwise return English
    const cacheKey = getCacheKey(text, targetLang);
    return translationCache.get(cacheKey) || text;
}

/**
 * Clear translation cache
 */
export function clearCache() {
    translationCache.clear();
}

/**
 * Preload translator (warm up the translation service)
 */
export async function preloadTranslator() {
    // Pre-translate some common UI strings
    const commonStrings = [
        // General UI
        'Loading...',
        'Save',
        'Cancel',
        'Delete',
        'Edit',
        'Add',
        'Search',
        'Settings',
        'Close',
        'Filter',
        'All',
        'View Details',
        'Refresh',

        // Navigation
        'Admin Panel',
        'User Portal',
        'Admin',
        'User',
        'Main',
        'Management',
        'Tracking',
        'Tools',
        'Health',
        'Control',
        'More',
        'Live Monitoring',
        'Map & Zones',
        'Wheelchairs & Patients',
        'Devices & Nodes',
        'Timeline & Alerts',
        'Routines',
        'Analytics',
        'Appliance Control',
        'AI Assistant',
        'Home',
        'My Location',
        'My Schedule',
        'Appliances',
        'Camera',
        'Alerts',

        // Rooms
        'Bedroom',
        'Bathroom',
        'Kitchen',
        'Living Room',

        // Timeline
        'Timeline & Location History',
        'Track user movements and events',
        'Live',
        'Historical Analysis',
        'Location',
        'Enter',
        'Exit',
        'Appliance',
        'Select Date',
        'Daily Summary',
        'Total Events',
        'Time in',
        'No Events Found',
        'No events match the selected criteria',
        'Events',
        'Moved from',
        'Detected at',
        'in previous room',

        // Status
        'Connected',
        'Disconnected',
        'Online',
        'Offline',
        'Active',
        'Inactive',

        // Time
        'Just now',
        'ago',
        'minutes ago',
        'hours ago',
        'Last Seen',

        // Devices
        'Nodes',
        'Gateways',
        'Video Streams',
        'Devices Online',
        'Devices Offline',
        'Add Node',
        'No devices connected. Connect a TsimCam-Controller to see devices here.',

        // Notifications
        'Notifications',
        'Mark All Read',
        'No Notifications',
        'Device Registered',
        'Device Updated',
        'Device Deleted',
        'Config Mode Activated',
        'has been registered',
        'has been updated',
        'has been deleted from the system',
        'Config mode command sent to',
        'Device will enter configuration mode',
    ];

    try {
        await Promise.all(
            commonStrings.map(str => translate(str, 'th'))
        );
        console.log('[preloadTranslator] Preloaded common translations');
    } catch (error) {
        console.warn('[preloadTranslator] Preload failed:', error);
    }
}

/**
 * Preload page-specific strings (warm-up for a specific page)
 * @param {string[]} strings - Array of English strings to preload
 * @param {string} targetLang - Target language (default: 'th')
 */
export async function preloadPageStrings(strings, targetLang = 'th') {
    if (!strings || strings.length === 0 || targetLang === 'en') {
        return;
    }

    try {
        // Filter out already cached strings
        const uncached = strings.filter(str => {
            const cacheKey = getCacheKey(str, targetLang);
            return !translationCache.has(cacheKey);
        });

        if (uncached.length === 0) {
            return;
        }

        // Preload uncached strings in parallel
        await Promise.all(
            uncached.map(str => translate(str, targetLang))
        );
        console.log(`[preloadPageStrings] Preloaded ${uncached.length} page strings`);
    } catch (error) {
        console.warn('[preloadPageStrings] Preload failed:', error);
    }
}

