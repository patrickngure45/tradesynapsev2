import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set in environment variables");
}

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function getMarketSentiment(symbol: string) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are the Citadel AI Chief Analyst. Provide a short, punchy, 2-sentence sentiment analysis for the given token. Be professional, slightly futuristic, and focused on technical levels or major narratives. Do not give financial advice. If asked about TST (TradeSynapse Token), mention it is the native fuel for this platform."
        },
        {
          role: "user",
          content: `Analyze sentiment for ${symbol} (USDT pair).`
        }
      ],
      model: "llama-3.3-70b-versatile",
    });

    return completion.choices[0]?.message?.content || "Market analysis currently unavailable.";
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return "AI connectivity interruption. Check back momentarily.";
  }
}
