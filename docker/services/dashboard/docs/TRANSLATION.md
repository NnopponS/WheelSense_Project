# UI Language & Auto-Translation (EN/TH)

## Overview

WheelSense dashboard supports bilingual UI: English (EN) and Thai (TH). Translation happens automatically via a transformer-based translation service, with technical terms preserved in English.

## Language State

- **Storage**: Language preference is stored in `localStorage` under key `wheelsense_language`
- **Default**: English (`'en'`)
- **Toggle**: Use the EN/TH buttons in the top-right corner of the app
- **Persistence**: Language choice persists across page refreshes

## How to Use Translation

### Method 1: `t()` Hook (Recommended for Dynamic Content)

```jsx
import { useTranslation } from '../hooks/useTranslation';
import { useApp } from '../context/AppContext';

function MyComponent() {
    const { language } = useApp();
    const { t } = useTranslation(language);
    
    return (
        <div>
            <h1>{t('Page Title')}</h1>
            <button>{t('Save')}</button>
        </div>
    );
}
```

### Method 2: `<Text>` Component (For Static Strings)

```jsx
import { Text } from '../components/Text';

function MyComponent() {
    return (
        <div>
            <Text>Page Title</Text>
            <button><Text>Save</Text></button>
        </div>
    );
}
```

### ⚠️ Important Rules

1. **All visible UI strings MUST go through `t()` or `<Text>`**
   - ✅ Correct: `<button>{t('Save')}</button>`
   - ❌ Wrong: `<button>Save</button>`

2. **Do NOT translate:**
   - Technical terms (MQTT, API, JSON, etc.) - automatically preserved
   - Code snippets, URLs, file paths - automatically preserved
   - Placeholders like `{id}`, `{{name}}` - automatically preserved
   - Data values (patient names, IDs, etc.)

3. **Always use English as the source text**
   - ✅ Correct: `t('Hello World')`
   - ❌ Wrong: `t('สวัสดี')` (don't translate Thai back to Thai)

## Technical Terms Protection

Technical terms are automatically preserved in English during translation. The glossary is maintained in:

**File**: `src/i18n/protect.js`

**Protected Terms Include:**
- Protocols: MQTT, HTTP, HTTPS, TCP, UDP
- Formats: JSON, XML, SQL
- Technologies: Docker, Kubernetes, Node.js, React, FastAPI
- Hardware: ESP32, ESP8266, Raspberry Pi
- Services: OpenAI, Gemini, Ollama
- And more...

**To Add New Terms:**
Edit `TECHNICAL_GLOSSARY` in `src/i18n/protect.js`:

```javascript
const TECHNICAL_GLOSSARY = new Set([
    // ... existing terms
    'YourNewTerm',  // Add here
]);
```

## Translation Architecture

### Client-Side (`src/i18n/`)
- **`translate.js`**: Core translation service with caching
- **`protect.js`**: Technical term protection algorithm
- **`language.js`**: Language state management

### Server-Side (`docker/backend/src/`)
- **`translation_service.py`**: Transformer-based translation (Helsinki-NLP/opus-mt-en-th)
- **`main.py`**: `/translate` API endpoint

### Caching
- **Client**: In-memory Map cache (per session)
- **Server**: LRU cache (prevents repeated translation compute)
- **In-flight deduplication**: Prevents concurrent duplicate requests

## Testing EN/TH

### Quick Test Checklist

1. **Start the application:**
   ```bash
   cd docker
   docker-compose up
   ```

2. **Test EN mode (default):**
   - Open `http://localhost:3000`
   - Verify all text appears in English
   - Navigate through pages

3. **Test TH mode:**
   - Click "TH" button in top-right
   - Verify UI text translates to Thai
   - Verify technical terms remain in English (MQTT, API, JSON, etc.)
   - Refresh page - TH should persist

4. **Test caching:**
   - Toggle TH → EN → TH
   - Check browser Network tab - same strings should not trigger new API calls

5. **Test layout stability:**
   - Toggle EN → TH rapidly
   - Verify no layout shift or flicker

### Sanity Test Script

Run this quick sanity check:

```bash
# 1. Clear browser cache
# Open DevTools → Application → Clear Storage → Clear site data

# 2. Start app
cd docker && docker-compose up

# 3. Manual checks:
# - Open http://localhost:3000
# - Click "TH" button
# - Navigate to "Wheelchairs & Patients" page
# - Verify translations appear
# - Refresh page
# - Verify TH persists
# - Check browser console for errors
```

## Docker Reproducibility

### Required Services

1. **Backend** (`docker/backend/`)
   - FastAPI server with translation endpoint
   - Requires: Python, transformers library, torch
   - Model: Helsinki-NLP/opus-mt-en-th (downloaded on first use)

2. **Dashboard** (`docker/dashboard/`)
   - React frontend
   - Requires: Node.js, Vite

### Fresh Build Steps

```bash
# 1. Build from scratch
cd docker
docker-compose build --no-cache

# 2. Start services
docker-compose up

# 3. First translation will download model (~200MB)
# Subsequent translations use cached model
```

### Empty Cache Test

```bash
# Clear all caches
docker-compose down -v
docker-compose build --no-cache
docker-compose up

# In browser:
# - Clear localStorage
# - Clear browser cache
# - Test translation
```

## Troubleshooting

### Translations Not Appearing
- Check browser console for errors
- Verify backend is running: `curl http://localhost:8000/health`
- Check translation endpoint: `curl -X POST http://localhost:8000/translate -H "Content-Type: application/json" -d '{"text":"Hello","from_lang":"en","to_lang":"th"}'`

### Technical Terms Being Translated
- Check `src/i18n/protect.js` - term should be in glossary
- Add term to `TECHNICAL_GLOSSARY` if missing

### Layout Shift
- Check CSS: buttons and table headers should have `white-space: nowrap`
- See `src/components.css` for layout stability rules

## Files Reference

- **Translation Hook**: `src/hooks/useTranslation.js`
- **Translation Service**: `src/i18n/translate.js`
- **Protection Algorithm**: `src/i18n/protect.js`
- **Language State**: `src/i18n/language.js`
- **Text Component**: `src/components/Text.jsx`
- **Backend Translation**: `docker/backend/src/translation_service.py`
- **API Endpoint**: `docker/backend/src/main.py` (POST `/translate`)

