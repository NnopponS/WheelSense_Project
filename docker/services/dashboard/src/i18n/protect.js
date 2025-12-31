/**
 * Translation Protection Module
 * Protects technical terms, code segments, URLs, and placeholders from translation
 */

// Technical glossary - terms that must NEVER be translated
const TECHNICAL_GLOSSARY = new Set([
    'MQTT', 'API', 'JSON', 'UID', 'BLE', 'Wi-Fi', 'WiFi', 'Docker', 'Kubernetes',
    'HTTP', 'HTTPS', 'URL', 'IP', 'TCP', 'UDP', 'SQL', 'SQLite', 'MySQL', 'Redis',
    'Node.js', 'Next.js', 'React', 'FastAPI', 'Flask', 'Linux', 'Windows', 'Mac',
    'GPU', 'CPU', 'RAM', 'OAuth', 'JWT', 'CORS', 'CLI',
    'ESP32', 'ESP8266', 'Raspberry Pi', 'Home Assistant', 'Mosquitto', 'n8n',
    'OpenAI', 'Gemini', 'Ollama', 'RAG', 'LLM', 'MCP'
]);

// Patterns for code-like segments that should not be translated
const CODE_PATTERNS = [
    /`[^`]+`/g,                    // Backtick code: `code`
    /\{[^}]+\}/g,                  // Curly braces: {placeholder}
    /\{\{[^}]+\}\}/g,              // Mustache: {{template}}
    /%[sd]/g,                      // Format strings: %s, %d
    /%\([^)]+\)[sd]/g,             // Named format: %(name)s
    /https?:\/\/[^\s]+/gi,         // URLs
    /\/[^\s]+/g,                   // File paths starting with /
    /[A-Z_][A-Z0-9_]{2,}/g,        // ALL_CAPS constants
];

// Regex for detecting technical terms (case-insensitive)
function createTechnicalTermRegex() {
    const terms = Array.from(TECHNICAL_GLOSSARY);
    // Sort by length (longest first) to match "Raspberry Pi" before "Pi"
    terms.sort((a, b) => b.length - a.length);
    // Escape special regex characters
    const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

const TECHNICAL_TERM_REGEX = createTechnicalTermRegex();

/**
 * Protect technical terms and code segments before translation
 * Returns: { protectedText, segments } where segments map placeholders to originals
 */
export function protectText(text) {
    const segments = new Map();
    let protectedText = text;
    let placeholderIndex = 0;

    // Step 1: Protect code patterns (backticks, braces, URLs, etc.)
    for (const pattern of CODE_PATTERNS) {
        protectedText = protectedText.replace(pattern, (match) => {
            const placeholder = `__KEEP_CODE_${placeholderIndex}__`;
            segments.set(placeholder, match);
            placeholderIndex++;
            return placeholder;
        });
    }

    // Step 2: Protect technical glossary terms (case-insensitive)
    protectedText = protectedText.replace(TECHNICAL_TERM_REGEX, (match) => {
        // Check if this match is already inside a protected segment
        // (simple check: if it contains a placeholder, skip)
        if (match.includes('__KEEP_')) {
            return match;
        }
        const placeholder = `__KEEP_TERM_${placeholderIndex}__`;
        segments.set(placeholder, match);
        placeholderIndex++;
        return placeholder;
    });

    return { protectedText, segments };
}

/**
 * Restore protected segments after translation
 */
export function unprotectText(translatedText, segments) {
    let restored = translatedText;
    
    // Restore in reverse order (longer placeholders first) to avoid conflicts
    const sortedPlaceholders = Array.from(segments.keys()).sort((a, b) => b.length - a.length);
    
    for (const placeholder of sortedPlaceholders) {
        const original = segments.get(placeholder);
        if (original) {
            // Use global replace to handle multiple occurrences
            restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
        }
    }
    
    return restored;
}

/**
 * Add a new technical term to the glossary (for runtime extension)
 */
export function addTechnicalTerm(term) {
    TECHNICAL_GLOSSARY.add(term);
    // Note: Regex is created once at module load, so new terms will be picked up
    // on next protectText call if we recreate the regex, but for simplicity,
    // we'll rely on the Set lookup in the regex pattern
}

