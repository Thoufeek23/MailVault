// backend/src/controllers/nlpController.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const storageService = require('../services/storageService'); // Your Supabase client instance

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.askEmailQuestion = async (req, res) => {
  try {
    // Ensure you are extracting the user ID from your auth middleware
    const userId = req.user ? req.user._id.toString() : req.user; 
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required." });
    }

    // 1. Turn the user's question into an embedding using Gemini
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embedResult = await embeddingModel.embedContent(question);
    const questionEmbedding = embedResult.embedding.values;

    // 2. Search Supabase for the most relevant emails
    // You MUST have an RPC function named 'match_emails' in your Supabase SQL
    const { data: matchedEmails, error } = await storageService.supabase.rpc('match_emails', {
      query_embedding: questionEmbedding,
      match_threshold: 0.4, // Adjust between 0.0 and 1.0 depending on desired strictness
      match_count: 5,       // Retrieve top 5 matching emails
      p_user_id: userId     // STRICT PRIVACY: Only search this user's emails
    });

    if (error) throw error;

    if (!matchedEmails || matchedEmails.length === 0) {
      return res.json({ 
        answer: "I couldn't find any emails related to your question in your backup.",
        sources: [] 
      });
    }

    // 3. Construct a context block from the retrieved emails
    const context = matchedEmails.map((email, index) => {
      return `Email ${index + 1} (Message ID: ${email.message_id}):\n${email.content}`;
    }).join("\n\n---\n\n");
    
    // 4. Create the prompt for the LLM
    const prompt = `
      You are MailVault's intelligent AI assistant. Your job is to answer the user's question based ONLY on the provided email contexts.
      
      Instructions:
      - Read the email contexts carefully.
      - If the answer is not contained in the contexts, politely state: "I cannot find the answer in your backed-up emails."
      - Do not make up information or use outside knowledge.
      - Be concise and helpful.
      
      Emails Context:
      ${context}
      
      User Question: ${question}
    `;

    // 5. Generate the final answer using Gemini 1.5 Flash (Fast and capable)
    const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await chatModel.generateContent(prompt);
    const answer = result.response.text();

    // 6. Send the answer and the sources back to the frontend
    res.json({ 
      answer: answer,
      sources: matchedEmails.map(m => m.message_id) 
    });

  } catch (error) {
    console.error("NLP Query Error:", error);
    res.status(500).json({ error: "Failed to process your question." });
  }
};