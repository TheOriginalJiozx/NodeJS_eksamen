# NodeJS eksamen

This project contains both a frontend (SvelteKit) and a backend (Express + Socket.IO). The README below explains how to install dependencies and run the backend and frontend for development.

**Prerequisites**

- Node.js 18+ (recommended)
- npm (or yarn / pnpm)

**Install dependencies**

Run this from the repository root:

```bash
npm install
```

**Start backend (Express + WebSocket)**

The backend is implemented in `server.js` and listens on port 3000 by default.

```bash
# Run backend with nodemon (auto-restart on changes)
nodemon server.js

# Or run directly with node
node server.js
```

**Start frontend (SvelteKit)**

The frontend uses Vite/SvelteKit and runs on port 5173 by default.

```bash
npm run dev
```

**Notes**

- The frontend expects the backend at `http://localhost:3000` (CORS configured).
- If you change ports, update the client fetch/socket URLs accordingly.
- Database and environment configuration lives in `src/*` files and `server.js` — ensure your DB is available and configured before running the backend.

**Linting**

Run the linter with:

```bash
npm run lint

# Fix problems automatically where possible
npm run lint:fix
```

**Building**

To build the frontend for production:

```bash
npm run build
```

**Support**

If you need help starting the backend or connecting to your database, tell me which database you're using and any connection errors from the server console and I will help debug.
