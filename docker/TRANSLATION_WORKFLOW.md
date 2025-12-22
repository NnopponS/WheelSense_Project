# Translation Workflow & Server Architecture

## Server Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React App (Static HTML/JS/CSS)                          │   │
│  │  - Built by Vite                                         │   │
│  │  - Served as static files                                │   │
│  │  - Runs entirely in browser                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           ↕ HTTP                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY (Port 80)                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Routes:                                                  │   │
│  │  /          → Dashboard (static files)                   │   │
│  │  /api/*     → Backend API                                │   │
│  │  /mcp/*     → MCP Server                                 │   │
│  │  /mqtt      → MQTT WebSocket                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Dashboard      │  │  Backend API    │  │  MCP Server     │
│  (Port 3000)    │  │  (Port 8000)    │  │  (Port 8080)    │
│  Nginx serves   │  │  FastAPI        │  │  FastAPI        │
│  static files   │  │  Python         │  │  Python         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Translation Workflow (Client-Side)

### 1. Application Initialization

```
Browser loads index.html
    ↓
React app starts (main.jsx)
    ↓
AppProvider initializes (AppContext.jsx)
    ↓
Language state loaded from localStorage
    - Default: 'th' (Thai)
    - Or saved preference: 'en' (English)
```

### 2. Component Rendering Flow

```
AppContent renders
    ↓
Components use useTranslation hook:
    - Navigation.jsx (Sidebar, BottomNav)
    - MonitoringPage.jsx
    - TopBar.jsx (language toggle)
    ↓
Each component calls t('Thai text')
    ↓
useTranslation hook checks:
    1. Is language === 'th'? → Return original
    2. Is text already English? → Return as-is
    3. Is translation cached? → Return cached
    4. Start async translation
```

### 3. Translation Process (When EN is selected)

```
User clicks "EN" button in TopBar
    ↓
setLanguage('en') called
    ↓
AppContext updates language state
    ↓
localStorage saves 'en'
    ↓
All components re-render with language='en'
    ↓
useTranslation hook triggers for each t() call
    ↓
For each Thai text:
    ├─ Check cache (memory + localStorage)
    ├─ If not cached:
    │   ├─ Load transformer model (if not loaded)
    │   │   └─ Download from HuggingFace CDN
    │   │       - Model: Xenova/helsinki-nlp/opus-mt-th-en
    │   │       - Or fallback: Xenova/nllb-200-distilled-600M
    │   ├─ Run translation
    │   ├─ Cache result (memory + localStorage)
    │   └─ Update component state
    └─ Component re-renders with translated text
```

### 4. Translation Service Location

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT-SIDE (Browser)                                      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  src/services/i18n.js                                 │ │
│  │  - Translation service                                │ │
│  │  - Uses @xenova/transformers                          │ │
│  │  - Loads model from CDN (HuggingFace)                 │ │
│  │  - Caches in memory + localStorage                    │ │
│  └───────────────────────────────────────────────────────┘ │
│                           ↕                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  src/hooks/useTranslation.js                          │ │
│  │  - React hook for components                          │ │
│  │  - Manages translation state                          │ │
│  │  - Triggers re-renders                                │ │
│  └───────────────────────────────────────────────────────┘ │
│                           ↕                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Components (Navigation, MonitoringPage, etc.)        │ │
│  │  - Call t('Thai text')                                │ │
│  │  - Display translated result                          │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SERVER-SIDE (Fallback Only)                                │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  backend/src/main.py                                  │ │
│  │  - /api/translate endpoint                            │ │
│  │  - Currently returns placeholder                      │ │
│  │  - Can be enhanced with server-side model             │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## File Locations

### Translation Files
- **Service**: `docker/dashboard/src/services/i18n.js`
- **Hook**: `docker/dashboard/src/hooks/useTranslation.js`
- **Context**: `docker/dashboard/src/context/AppContext.jsx` (language state)

### Components Using Translation
- `docker/dashboard/src/components/Navigation.jsx`
- `docker/dashboard/src/components/TopBar.jsx`
- `docker/dashboard/src/pages/MonitoringPage.jsx`

### Server Configuration
- **Dashboard Nginx**: `docker/dashboard/nginx.conf`
- **Main Nginx**: `docker/nginx/nginx.conf`
- **Docker Compose**: `docker/docker-compose.yml`

## Translation Model Loading

1. **First Translation (EN mode)**:
   - Model downloads from HuggingFace CDN (~50-100MB)
   - Loads into browser memory
   - Takes 5-30 seconds depending on connection

2. **Subsequent Translations**:
   - Model already in memory
   - Instant translation
   - Results cached in localStorage

3. **Cache Strategy**:
   - Memory cache: Fast access during session
   - localStorage: Persists across page reloads
   - Never re-translates cached text

## Current Status

✅ **Working**:
- Language toggle buttons (TH/EN) visible
- Language state management
- Translation service setup
- Caching mechanism

⚠️ **Needs Verification**:
- Transformer model loading (requires internet/CDN access)
- Component re-rendering after translation
- Error handling for model load failures

## Debugging

Check browser console for:
- `[AppContext] Language changed to: en`
- `Loading translation model...`
- `Translation model loaded successfully`
- `[i18n] Translation result: ...`
- `[useTranslation] Translation complete: ...`
