# Preflight

A project with Codex integration capabilities.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your API keys and configuration.

4. Start the development server:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with auto-reload
- `npm test` - Run tests (placeholder)

## Endpoints

- `GET /` - Basic status endpoint
- `GET /health` - Health check endpoint

## Codex Integration

This project is set up to work with Codex from ChatGPT. Make sure to:

1. Set your OpenAI API key in the `.env` file
2. Configure the appropriate endpoints for your Codex integration
3. Follow the Codex documentation for proper initialization

## Development

The project uses:
- Express.js for the web server
- CORS for cross-origin requests
- dotenv for environment variable management
- nodemon for development auto-reload
