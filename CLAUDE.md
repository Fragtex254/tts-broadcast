# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TTS Broadcast is a full-stack application for automated AI news broadcasting using Xiaomi MiMo TTS API. It fetches daily AI news from AI HOT, rewrites them into broadcast scripts using MiMo LLM, and generates TTS audio.

## Tech Stack

**Backend (Node.js)**
- Express 5 web framework
- better-sqlite3 for embedded database
- OpenAI SDK (compatible with MiMo API)
- node-cron for scheduled tasks
- Jest for testing

**Frontend (React + TypeScript)**
- React 19 with TypeScript
- Vite 8 build tool
- Tailwind CSS 4 for styling
- Zustand for state management
- React Router 7 for routing

## Common Commands

### Backend (from `tts-broadcast/backend/`)

```bash
npm run dev          # Start dev server with hot reload (port 3001)
npm start            # Start production server
npm test             # Run all tests with Jest
npm test -- --watch  # Run tests in watch mode
```

### Frontend (from `tts-broadcast/frontend/`)

```bash
npm run dev          # Start dev server (port 5173)
npm run build        # Build for production (runs tsc + vite build)
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

## Architecture

```
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express app entry, middleware setup, route mounting
│   │   ├── db/               # SQLite initialization and schema
│   │   ├── routes/           # Express routes (broadcast, settings, schedule)
│   │   └── services/         # Business logic (aihot, mimo, scheduler)
│   ├── tests/                # Jest tests mirroring src/ structure
│   ├── audio/                # Generated audio files (gitignored)
│   └── data/                 # SQLite database files (gitignored)
├── frontend/
│   ├── src/
│   │   ├── pages/            # Route components (Dashboard, History, Settings)
│   │   ├── components/       # Reusable UI components
│   │   ├── services/         # API client layer
│   │   └── store/            # Zustand state management
│   └── vite.config.ts
└── .gitignore
```

## Database Schema

SQLite with 3 tables:
- `broadcasts`: Generated broadcasts with audio paths, status tracking
- `settings`: Key-value store for API keys, voice preferences, scripts
- `schedules`: Cron-based scheduled tasks for automated broadcasting

## External APIs

- **MiMo TTS API** (`https://api.xiaomimimo.com/v1`): Text-to-speech synthesis
- **MiMo LLM API**: Text rewriting for broadcast scripts
- **AI HOT API**: Daily AI news data source

## Environment Variables

Backend requires `.env` file in `tts-broadcast/backend/`:
```env
MIMO_API_KEY=your_api_key_here
PORT=3001
NODE_ENV=development
```

## Key Patterns

- Backend uses OpenAI SDK with custom base_url for MiMo API compatibility
- Frontend uses Zustand store pattern for global state
- Tests use supertest for HTTP endpoint testing
- Audio files are served as static files from `/audio` route
