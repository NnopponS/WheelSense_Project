/**
 * useTranslation Hook
 * Ultra-minimal implementation to avoid TDZ errors
 * No dependencies, no closures, no object creation
 */

// Define function at module level - no TDZ possible
function translate(text) {
    if (text == null) return '';
    return String(text);
}

// Create object once at module load
const hookResult = { t: translate };

// Export function - returns pre-created object
export function useTranslation() {
    return hookResult;
}

export default useTranslation;
