import React, { useState } from 'react';
import axios from '../api/axiosConfig';
import toast from 'react-hot-toast';
import { MessageCircle, X, Send } from 'lucide-react';

export default function AskGemini() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const res = await axios.post('/api/backup/ask', { question });
      setResponse(res.data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to get an answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ask-gemini-wrapper">
      {isOpen && (
        <div className="ask-gemini-popup shadow-lg">
          <div className="ask-gemini-header">
            <h3>✨ Ask MailVault AI</h3>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <X size={20} />
            </button>
          </div>
          
          <div className="ask-gemini-body">
            <p className="helper-text">Ask a question about your backed-up emails.</p>
            
            {response && (
              <div className="gemini-response">
                <strong>Answer:</strong>
                <p>{response.answer}</p>
                {response.sources && response.sources.length > 0 && (
                  <div className="gemini-sources">
                    <strong>Sources (Message IDs):</strong>
                    <ul>
                      {response.sources.map(id => (
                        <li key={id}>{id}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleAsk} className="ask-gemini-footer">
            <input 
              type="text" 
              value={question} 
              onChange={(e) => setQuestion(e.target.value)} 
              placeholder="Ask something..."
              disabled={loading}
            />
            <button type="submit" disabled={loading || !question.trim()}>
              {loading ? <div className="spinner-small" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}

      <button 
        className="ask-gemini-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Ask MailVault AI"
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
      </button>
    </div>
  );
}