"""
Translation Service using deep-translator (Google Translate)
Uses deep-translator for English to Thai translation with fallback options
"""

import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# Global translator instance
_translator = None
_translator_load_attempted: bool = False


def load_translator():
    """Load the Google Translate translator (lazy loading)."""
    global _translator, _translator_load_attempted
    
    # Return cached translator if available
    if _translator is not None:
        return _translator
    
    # If already attempted and failed, don't try again
    if _translator_load_attempted:
        return None
    
    _translator_load_attempted = True
    
    try:
        from deep_translator import GoogleTranslator
        
        logger.info("Initializing deep-translator (Google Translate)...")
        _translator = GoogleTranslator(source='en', target='th')
        
        # Test the translator with a simple phrase
        test_result = _translator.translate("hello")
        logger.info(f"✅ Translator initialized successfully (test: hello -> {test_result})")
        
        return _translator
        
    except Exception as e:
        logger.error(f"Failed to initialize translator: {e}")
        logger.warning("Translation will fallback to original text (will not retry)")
        return None


def translate_text(text: str, source_lang: str = "en", target_lang: str = "th") -> str:
    """
    Translate text using Google Translate via deep-translator.
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: "en")
        target_lang: Target language code (default: "th")
    
    Returns:
        Translated text, or original text if translation fails
    """
    # If empty text, return as-is
    if not text or not text.strip():
        return text
    
    # If same language, return as-is
    if source_lang == target_lang:
        return text
    
    try:
        from deep_translator import GoogleTranslator
        
        # Create a new translator instance for the specific language pair
        # (the cached instance might have different src/target)
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        result = translator.translate(text)
        
        if result:
            return result
        else:
            return text
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text


# Server-side cache for translations
_translation_cache: Dict[str, str] = {}
_cache_max_size = 1000


def get_cached_translation(text: str, source_lang: str, target_lang: str) -> Optional[str]:
    """Get cached translation if available."""
    cache_key = f"{source_lang}::{target_lang}::{text}"
    return _translation_cache.get(cache_key)


def cache_translation(text: str, translated: str, source_lang: str, target_lang: str):
    """Cache a translation result."""
    cache_key = f"{source_lang}::{target_lang}::{text}"
    
    # Simple LRU: if cache is full, remove oldest entry (simple FIFO)
    if len(_translation_cache) >= _cache_max_size:
        # Remove first item (oldest)
        first_key = next(iter(_translation_cache))
        del _translation_cache[first_key]
    
    _translation_cache[cache_key] = translated


def translate_with_cache(text: str, source_lang: str = "en", target_lang: str = "th") -> str:
    """
    Translate text with caching.
    
    Args:
        text: Text to translate
        source_lang: Source language (default: "en")
        target_lang: Target language (default: "th")
    
    Returns:
        Translated text
    """
    # Check cache first
    cached = get_cached_translation(text, source_lang, target_lang)
    if cached is not None:
        return cached
    
    # Translate
    translated = translate_text(text, source_lang, target_lang)
    
    # Cache result (only if translation was successful - i.e., text changed)
    if translated != text:
        cache_translation(text, translated, source_lang, target_lang)
    
    return translated
