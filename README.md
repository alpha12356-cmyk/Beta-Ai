# Beta V4 Backend

Node.js + Express backend for Beta.

## Run locally
```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY privately
npm install
npm start
```

Health check: `GET /health`
Chat: `POST /chat` with `{ "message": "..." }`
Memory: `GET /memory`, `POST /memory`
Document: `POST /pdf`, `POST /pdf/ask`

The backend uses the OpenAI Responses API with model `gpt-5.6-luna` and the current `web_search` tool name.
