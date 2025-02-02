const OLLAMA_HOST = "http://localhost:11434";
const EMBEDDING_MODEL = "nomic-embed-text";
let modelEnsured = false;

async function ensureEmbeddingModelRunning() {
    try {
        const resp = await fetch(`${OLLAMA_HOST}/api/tags`);
        if (!resp.ok) throw new Error("Ollama not responding");

        const models = await resp.json();
        const hasModel = models.models.some((m: any) => m.name.includes(EMBEDDING_MODEL));

        if (!hasModel) {
            console.log("ℹ️ Downloading embedding model...");
            const process = Deno.run({
                cmd: ["ollama", "pull", EMBEDDING_MODEL],
                stdout: "piped",
                stderr: "piped"
            });
            const status = await process.status();
            if (!status.success) {
                const rawError = await process.stderrOutput();
                const errorString = new TextDecoder().decode(rawError);
                throw new Error(`Model download failed: ${errorString}`);
            }
        }

        console.log("✅ Embedding model is available");
        modelEnsured = true;
    } catch (error) {
        console.error("❌ Model setup error:", error);
        Deno.exit(1);
    }
}

export async function getEmbedding(text: string): Promise<number[]> {
    if (!modelEnsured) {
        await ensureEmbeddingModelRunning();
    }

    try {
        const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: EMBEDDING_MODEL,
                prompt: text
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding || [];
    } catch (error) {
        console.error("Embedding Error:", error);
        return [];
    }
}
