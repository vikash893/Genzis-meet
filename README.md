# Genzis-meet

A browser-based video meeting and collaboration platform built with React, Node.js, Express, MongoDB, Socket.IO, and WebRTC.

## Highlights

- HD peer-to-peer video and audio meetings
- Instant meeting creation and code-based joining
- Screen sharing, chat, reactions, hand raising, and recording
- Host controls and privacy mode
- Admin dashboard for user management and announcements
- Responsive interface for desktop, tablet, and mobile browsers

## Project Structure

```text
Genzis-meet/
├── backend/       Express API, MongoDB models, authentication, and Socket.IO
├── frontend/      React client and meeting interface
├── LICENSE
├── README.md
└── .gitignore
```

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- MongoDB running locally or a MongoDB connection string
- A modern browser with camera and microphone permissions

## Setup

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment variables

Create `backend/.env` locally:

```env
MONGO_URL=mongodb://127.0.0.1:27017/g4g5_db
JWT_SECRET=replace-this-with-a-long-random-secret
CHAT_ENCRYPTION_KEY=replace-this-with-a-different-long-random-secret
PORT=8000
```

Create `frontend/.env` only when the API is not running on the default URL:

```env
REACT_APP_API_URL=http://localhost:8000
```

Never commit either `.env` file. Use different secrets for development and production.
Keep `CHAT_ENCRYPTION_KEY` stable in production; changing it makes previously stored chat messages unreadable.

### 3. Start the application

In one terminal:

```bash
cd backend
node server.js
```

In another terminal:

```bash
cd frontend
npm start
```

Open `http://localhost:3000` in a browser.

## Available Commands

### Backend

- `node server.js` - start the API and Socket.IO server

### Frontend

- `npm start` - run the development server
- `npm run build` - create an optimized production build
- `npm test` - run the test suite

## Authentication

Public users can sign in to join meetings. User accounts are created by an administrator through the protected admin dashboard. Keep admin credentials and JWT secrets private.

## Security Notes

- Do not commit `.env` files, private keys, database dumps, or production build artifacts.
- Use HTTPS in production so camera, microphone, and WebRTC features work reliably.
- Replace development secrets before deployment.
- Restrict CORS origins to trusted domains in production.
- Review authentication and authorization settings before exposing the server publicly.

## License

This project is available under the [MIT License](LICENSE).
