// backend/src/services/nlpService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

exports.createAndStoreEmbedding = async (userId, messageId, emailBody, supabaseClient) => {
  try {
    // 1. Clean the HTML out of the email body to get plain text
    // A simple regex helps, but you can also use libraries like 'html-to-text' for better formatting
    const plainText = String(emailBody).replace(/<[^>]*>?/gm, '').trim(); 
    
    if (!plainText) return; // Skip if email is empty

    // 2. Generate the Vector Embedding using Gemini
    const result = await embeddingModel.embedContent(plainText);
    const embedding = result.embedding.values;

    // 3. Store in Supabase pgvector database
    // Assuming you have a table named 'email_embeddings' configured with pgvector
    const { error } = await supabaseClient.from('email_embeddings').insert({
      user_id: userId,
      message_id: messageId,
      content: plainText.substring(0, 5000), // Store up to 5000 chars for context retrieval
      embedding: embedding
    });

    if (error) throw error;

  } catch (error) {
    console.error(`Gemini embedding failed for message ${messageId}:`, error.message);
  }
};