# Translation System - Quick Start

## For Developers

### ✅ DO THIS

```jsx
import { useTranslation } from '../hooks/useTranslation';
import { useApp } from '../context/AppContext';

function MyPage() {
    const { language } = useApp();
    const { t } = useTranslation(language);
    
    return <h1>{t('Page Title')}</h1>;
}
```

### ❌ DON'T DO THIS

```jsx
// Hardcoded string - bypasses translation!
return <h1>Page Title</h1>;
```

## Sanity Test (Copy-Paste)

```bash
# 1. Start services
cd docker
docker-compose up

# 2. In browser:
# - Open http://localhost:3000
# - Click "TH" button
# - Navigate to any page
# - Verify translations appear
# - Refresh - TH should persist
# - Check console for errors

# 3. Test translation API
curl -X POST http://localhost:8000/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello World","from_lang":"en","to_lang":"th"}'
```

## Key Files

- **Hook**: `src/hooks/useTranslation.js`
- **Service**: `src/i18n/translate.js`
- **Glossary**: `src/i18n/protect.js`
- **Docs**: `docs/TRANSLATION.md`

