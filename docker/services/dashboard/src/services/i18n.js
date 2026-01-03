/**
 * i18n Service - Static implementation to avoid TDZ errors
 */

// Static functions defined at module level
const getTranslationStatic = function getTranslation(text) {
    return text ? String(text) : '';
};

const tSyncStatic = function tSync(text) {
    return text ? String(text) : '';
};

const translatorStatic = function translator(text) {
    return text ? String(text) : '';
};

const translatorObj = Object.freeze({
    t: translatorStatic
});

export function getTranslation(text) {
    return getTranslationStatic(text);
}

export function createTranslator() {
    return translatorObj;
}

export const thaiTranslations = Object.freeze({});

export function preloadTranslator() {
    // No-op
}

export function clearCache() {
    // No-op
}

export function tSync(text) {
    return tSyncStatic(text);
}

export const t = tSyncStatic;
