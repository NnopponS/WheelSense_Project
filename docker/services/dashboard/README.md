# WheelSense Dashboard

React-based dashboard for WheelSense smart home system.

## Quick Start

```bash
# Development
npm install
npm run dev

# Production build
npm run build
```

## UI Language & Translation

The dashboard supports bilingual UI (English/Thai) with automatic translation.

**📖 See [docs/TRANSLATION.md](./docs/TRANSLATION.md) for complete translation guide.**

### Quick Reference

- **Use `t()` hook** for all visible UI strings
- **Technical terms** (MQTT, API, JSON) are automatically preserved
- **Language toggle** in top-right corner (EN/TH)
- **Translation glossary**: `src/i18n/protect.js`

### Testing Translation

```bash
# Run sanity test
bash scripts/test-translation.sh

# Or manually:
# 1. Start app: docker-compose up
# 2. Open http://localhost:3000
# 3. Click "TH" button
# 4. Verify translations work
```

## Development Guidelines

### Adding New UI Strings

**✅ CORRECT:**
```jsx
const { t } = useTranslation(language);
<h1>{t('Page Title')}</h1>
```

**❌ WRONG:**
```jsx
<h1>Page Title</h1>  // Bypasses translation!
```

See `docs/TRANSLATION.md` for full guidelines.

## Project Structure

```
src/
├── components/       # Reusable components
├── pages/          # Page components
├── hooks/          # React hooks (useTranslation, etc.)
├── i18n/           # Translation system
│   ├── translate.js    # Translation service
│   ├── protect.js      # Technical term protection
│   └── language.js     # Language state
├── services/       # API services
└── context/        # React context (AppContext)
```

## Docker

See parent `docker-compose.yml` for full stack setup.

**Required services:**
- Backend (translation API)
- Dashboard (this app)

**Translation model:** Helsinki-NLP/opus-mt-en-th (downloaded automatically on first use)

