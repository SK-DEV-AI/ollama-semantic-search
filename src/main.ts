import { getEmbedding } from "./embedding.ts";
import * as cheerio from "https://esm.sh/cheerio";

const SEARXNG_INSTANCE = "http://localhost:8888";
const OLLAMA_HOST = "http://localhost:11434";
const GENERATION_MODEL = "deepseek-optimized";
const FETCH_TIMEOUT = 5000;
const MAX_CONTENT_LENGTH = 3000;
const NUM_CTX = 4096;
const TEMPERATURE = 0.3;
const REQUIRED_LINKS = 10;

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
        console.log(`⏭ Skipping failed link: ${url}`);
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

async function generateWebAnswer(query: string, sources: Array<{ url: string, text: string, embedding: number[] }>) {
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

    return generateStreamingAnswer(prompt);
}

async function generateGeneralAnswer(query: string) {
    const prompt = `
    [SYSTEM] You are an AI assistant. Answer the following question based on your knowledge.

    Question: ${query}

    Answer (concise):`;

    return generateStreamingAnswer(prompt);
}

async function generateStreamingAnswer(prompt: string) {
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
    console.log("🚀 Smart Search Assistant (type 'exit' to quit)");

    while (true) {
        const query = prompt("\n🔍 Enter your question: ");
        if (!query || query.toLowerCase() === "exit") break;

        if (!query.toLowerCase().includes("search")) {
            console.log("\n📝 Generating general answer...");
            await generateGeneralAnswer(query);
            continue;
        }

        console.log("\n🔄 Performing web search...");
        try {
            const results = await searchWeb(query.replace("search", "").trim());
            console.log(`\n✅ Found ${results.length} results.`);

            const sources = [];
            let currentIndex = 0;

            while (sources.length < REQUIRED_LINKS && currentIndex < results.length) {
                const result = results[currentIndex];
                console.log(`\n📡 Processing link ${currentIndex + 1} of ${results.length}: ${result.url}`);

                try {
                    const content = await fetchPageContent(result.url);
                    if (content.text.length > 100) {
                        sources.push(content);
                        console.log(`✓ Added valid source (${sources.length}/${REQUIRED_LINKS})`);
                    }
                } catch (error) {
                    console.log(`⏭ Skipping problematic link: ${result.url}`);
                }

                currentIndex++;

                // If we've exhausted results but need more links
                if (currentIndex >= results.length && sources.length < REQUIRED_LINKS) {
                    console.log("⚠️ Insufficient valid sources found");
                    break;
                }
            }

            if (sources.length === 0) {
                console.log("❌ No valid web content found, generating general answer...");
                await generateGeneralAnswer(query);
            } else {
                console.log("\n📝 Generating web-based answer...");
                await generateWebAnswer(query, sources);
            }
        } catch (error) {
            console.error("❌ Error during search:", error);
            console.log("\n🔄 Generating general answer instead...");
            await generateGeneralAnswer(query);
        }
    }

    console.log("\n👋 Exiting search.");
}

main();
