// Quick connectivity and inference test for the deployed Ollama Qwen 2.5:14b model
const OLLAMA_HOST = process.env.OLLAMA_BASE_URL || "http://92.4.87.178:11434"
const OPENAI_BASE = process.env.OPENAI_BASE_URL || `${OLLAMA_HOST}/v1`
const MODEL = process.env.MODEL_NAME || "qwen2.5:14b"

async function runTest() {
  console.log(`Connecting to deployed model at: ${OLLAMA_HOST}`)
  console.log(`Model: ${MODEL}`)

  // 1. Check tags
  try {
    const tagsRes = await fetch(`${OLLAMA_HOST}/api/tags`)
    if (!tagsRes.ok) {
      throw new Error(`HTTP ${tagsRes.status}`)
    }
    const tagsData = await tagsRes.json()
    console.log("Available models:", tagsData.models?.map((m) => m.name).join(", "))
  } catch (err) {
    console.error("Failed to fetch /api/tags:", err.message)
  }

  // 2. Test chat completion via OpenAI-compatible endpoint
  console.log("\nTesting /v1/chat/completions ...")
  const start = Date.now()
  try {
    const chatRes = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ollama",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a helpful coding assistant." },
          { role: "user", content: "Reply with 'CONNECTED' and your model name in 1 sentence." },
        ],
        temperature: 0.2,
        max_tokens: 50,
      }),
    })

    if (!chatRes.ok) {
      throw new Error(`HTTP ${chatRes.status}: ${await chatRes.text()}`)
    }

    const chatData = await chatRes.json()
    const content = chatData.choices?.[0]?.message?.content
    const duration = ((Date.now() - start) / 1000).toFixed(2)
    console.log(`Response (${duration}s):`, content)
    console.log("\nSUCCESS: Deployed model is active and responding!")
  } catch (err) {
    console.error("Chat completion test failed:", err.message)
  }
}

runTest()
