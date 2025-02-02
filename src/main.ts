import { getEmbedding } from "./embedding.ts";
import * as cheerio from "https://esm.sh/cheerio";

const SEARXNG_INSTANCE = "http://localhost:8888";
const OLLAMA_HOST = "http://localhost:11434";
const GENERATION_MODEL = "deepseek-optimized";
const FETCH_TIMEOUT = 5000;
const MAX_CONTENT_LENGTH = 3000;
const NUM_CTX = 4096;
const TEMPERATURE = 0.3;

async function searchWeb(query: string) {
    const url = new URL(`${SEARXNG_INSTANCE}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");

    const response = await fetch(url.toString(), {
        headers: { "Accept": "application/json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.results.map((result: any) => ({
        url: result.url,
        title: result.title || "",
        snippet: result.content || ""
    }));
}

async function fetchPageContent(url: string): Promise<{ url: string, text: string, embedding: number[] }> {
    try {
        console.log(`🔗 Fetching link: ${url}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        clearTimeout(timeoutId);
        const html = await response.text();
        const $ = cheerio.load(html);
        const mainContent = $("article, main, .content").first();
        const text = mainContent.length > 0 ? mainContent.text() : $("body").text();
        const processedText = text.replace(/[\s\n]+/g, " ").substring(0, MAX_CONTENT_LENGTH);
        const embedding = await getEmbedding(processedText);
        return { url, text: processedText, embedding };
    } catch (error) {
        console.error(`⚠️ Failed to fetch content for ${url}:`, error);
        return { url, text: "", embedding: [] };
    }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magA * magB);
}

async function generateAnswer(query: string, sources: Array<{ url: string, text: string, embedding: number[] }>) {
    const queryEmbedding = await getEmbedding(query);
    const ranked = sources.map(source => ({
        ...source,
        similarity: cosineSimilarity(queryEmbedding, source.embedding)
    })).sort((a, b) => b.similarity - a.similarity).slice(0, 3);

    const prompt = `
    [SYSTEM] You are an AI assistant. Use the following web content to answer the query accurately.

    Question: ${query}

    Web Context:
    ${ranked.map(source => `[Source: ${source.url}]\n${source.text}`).join("\n\n")}

    Answer (concise, cite sources):`;

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: GENERATION_MODEL,
            prompt,
            stream: true,
            num_ctx: NUM_CTX,
            temperature: TEMPERATURE,
            stop: ["\n\nYou:"]
        })
    });

    if (!response.ok) throw new Error(`Generation Error: ${response.statusText}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let answer = "";

    console.log("\n🤖 Generating Answer:\n");

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        answer += parsed.response;
                        Deno.stdout.write(new TextEncoder().encode(parsed.response));
                    }
                } catch (e) {
                    console.error("Error parsing response chunk:", e);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    console.log("\n");
    return answer;
}

async function main() {
    console.log("🚀 SearXNG Semantic Search with Nomic Embeddings");

    while (true) {
        const query = prompt("\n🔍 Enter your search query (or type 'exit' to quit): ");
        if (!query || query.toLowerCase() === "exit") break;

        console.log("\n🔄 Searching...");
        try {
            const results = await searchWeb(query);
            console.log(`\n✅ Found ${results.length} results.`);

            const linksToFetch = results.slice(0, 10);
            const sources = [];
            for (let i = 0; i < linksToFetch.length; i++) {
                console.log(`\n📡 Fetching link ${i + 1} of ${linksToFetch.length}: ${linksToFetch[i].url}`);
                const content = await fetchPageContent(linksToFetch[i].url);
                if (content.text.length > 100) {
                    sources.push(content);
                }
            }

            if (sources.length === 0) {
                console.log("❌ No valid web content found.");
            } else {
                console.log("\n📝 Generating answer...");
                const answer = await generateAnswer(query, sources);
                console.log("\n🔍 Final Answer:\n", answer);
            }
        } catch (error) {
            console.error("❌ Error during search:", error);
        }
    }

    console.log("\n👋 Exiting search.");
}

main();
