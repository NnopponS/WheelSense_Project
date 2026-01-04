"""
Translation Service with Caching
Uses deep-translator for English to Thai translation with LRU cache.
"""

from functools import lru_cache
from deep_translator import GoogleTranslator
import logging

logger = logging.getLogger(__name__)

# LRU cache for translation results (max 1000 entries)
@lru_cache(maxsize=1000)
def _cached_translate(text: str, source_lang: str, target_lang: str) -> str:
    """
    Internal cached translation function.
    Uses Google Translate via deep-translator.
    """
    try:
        # Normalize language codes
        source = source_lang.lower()[:2]  # 'en', 'th', etc.
        target = target_lang.lower()[:2]
        
        # If same language, return original
        if source == target:
            return text
        
        # Translate using Google Translate
        translator = GoogleTranslator(source=source, target=target)
        translated = translator.translate(text)
        
        return translated
    except Exception as e:
        logger.error(f"Translation error: {e}")
        # Fallback: return original text
        return text


def translate_with_cache(text: str, source_lang: str = "en", target_lang: str = "th") -> str:
    """
    Translate text with caching.
    
    Args:
        text: Text to translate
        source_lang: Source language code (default: "en")
        target_lang: Target language code (default: "th")
    
    Returns:
        Translated text, or original text if translation fails
    """
    if not text or not text.strip():
        return text
    
    try:
        return _cached_translate(text.strip(), source_lang, target_lang)
    except Exception as e:
        logger.error(f"Translation cache error: {e}")
        # Fallback: try direct translation without cache
        try:
            translator = GoogleTranslator(source=source_lang[:2], target=target_lang[:2])
            return translator.translate(text)
        except Exception:
            return text


