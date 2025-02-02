# Ollama Semantic Search

AI-powered search assistant using Ollama embeddings and SearXNG search engine.

## Features

- Web search with SearXNG
- Semantic ranking with Nomic embeddings
- Real-time answer generation
- Source citation
- Error resilience

## Requirements

- Deno 1.30+
- Ollama (running locally)
- SearXNG instance

## Installation

1. **Install Dependencies**
```bash
# Install Deno
curl -fsSL https://deno.land/x/install/install.sh | sh

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull required models
ollama pull nomic-embed-text
ollama pull deepseek-optimized
```

2. **Clone Repository**
```bash
git clone https://github.com/yourusername/ollama-semantic-search.git
cd ollama-semantic-search
```

3. **Start Services**
```bash
# Start Ollama in separate terminal
ollama serve

# Start SearXNG (adjust based on your setup)
docker run -d -p 8888:8080 searxng/searxng
```

## Usage

```bash
deno task start
```

Follow the interactive prompts to search. Example:
```
🔍 Enter your search query: What's the latest version of Python?
```

## Configuration

Environment variables (optional):
```bash
export SEARXNG_INSTANCE="http://localhost:8888"
export OLLAMA_HOST="http://localhost:11434"
```

## Possible Errors & Solutions

**1. Embedding Model Not Found**
```
Error: Model "nomic-embed-text" not found
```
Solution:
```bash
ollama pull nomic-embed-text
```

**2. HTTP/2 Stream Errors**
```
stream error received: unspecific protocol error
```
Solution:
- Add delay between requests
- Reduce MAX_CONTENT_LENGTH in main.ts

**3. Invalid URLs**
```
dns error: failed to lookup address information
```
Solution:
- Script automatically skips invalid URLs
- Check SearXNG results quality

**4. Permission Denied**
```
Deno permission denied
```
Solution: Run with required flags:
```bash
deno run --allow-net --allow-read --allow-env --allow-run src/main.ts
```

**5. Generation Timeouts**
```
Timeout fetching URL
```
Solution:
- Increase FETCH_TIMEOUT in main.ts
- Check network connectivity

**6. Empty Responses**
```
No valid web content found
```
Solution:
- Try different search query
- Check SearXNG instance configuration

## Troubleshooting

**Q: Answers seem inaccurate**
- Try different ranking models
- Adjust TEMPERATURE in main.ts
- Verify web content is being fetched properly

**Q: Slow performance**
- Reduce MAX_CONTENT_LENGTH
- Process fewer links (adjust slice(0, 10))
- Use GPU-accelerated Ollama

**Q: Streaming not working**
- Ensure Deno 1.30+
- Check Ollama API version
- Verify network connectivity

## License
MIT
# ollama-semantic-search
