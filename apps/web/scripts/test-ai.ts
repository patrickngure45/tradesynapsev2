
import 'dotenv/config';
import Groq from "groq-sdk";

async function main() {
    console.log("Checking environment...");
    const apiKey = process.env.GROQ_API_KEY;
    console.log("GROQ_API_KEY present:", !!apiKey);
    
    if (!apiKey) {
        console.error("No API KEY FOUND in process.env!");
        // Try loading from .env manually just in case dotenv/config didn't pick it up from the CWD
        // But usually it does. 
        process.exit(1);
    }

    console.log("Key starts with:", apiKey.substring(0, 4) + "...");

    const groq = new Groq({ apiKey });

    try {
        console.log("Sending request to Groq...");
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: "Test connection. Say 'Hello World'."
                }
            ],
            model: "llama3-8b-8192",
        });
        console.log("Response:", completion.choices[0]?.message?.content);
    } catch (e: any) {
        console.error("Groq Error Object:", e);
        if (e.message) console.error("Error Message:", e.message);
    }
}

main();
