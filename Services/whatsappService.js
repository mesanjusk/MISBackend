import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import normalizeWhatsAppNumber from '../utils/normalizeNumber';

const BASE_URL = 'https://misbackend-e078.onrender.com';

const WhatsAppSession = () => {
  const [number, setNumber] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/messages`);
      if (Array.isArray(res.data)) {
        setMessages(res.data.reverse()); // newest first
      }
    } catch (err) {
      console.error('Error loading message history:', err);
      toast.error('Failed to load message history');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!number || !message) {
      toast.error("Please fill all fields");
      return;
    }

    setSending(true);
    try {
      const normalized = normalizeWhatsAppNumber(number);
      const res = await axios.post(`${BASE_URL}/whatsapp/send-test`, {
        number: normalized,
        message,
      });
      toast.success(`✅ Sent! ID: ${res.data.messageId || 'N/A'}`);
      setMessage('');
      fetchMessages(); // refresh history
    } catch (err) {
      console.error(err);
      toast.error("❌ Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 p-4">
      <ToastContainer />
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4 text-center">📲 Send WhatsApp Message</h2>

        <form onSubmit={handleSend} className="space-y-4">
          <input
            type="text"
            placeholder="Phone number (e.g., 91XXXXXXXXXX)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <textarea
            rows="4"
            placeholder="Enter your message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="submit"
            disabled={sending}
            className={`w-full py-2 rounded text-white ${
              sending ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>
      </div>

      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-semibold mb-4 text-center">📜 Message History</h3>
        {loadingMessages ? (
          <p className="text-center text-gray-500">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-gray-500">No messages found.</p>
        ) : (
          <ul className="divide-y">
            {messages.map((msg, idx) => (
              <li key={idx} className="py-2 text-sm">
                <p><strong>From:</strong> {msg.from}</p>
                <p><strong>To:</strong> {msg.to}</p>
                <p><strong>Message:</strong> {msg.text}</p>
                <p className="text-gray-500 text-xs">
                  {new Date(msg.time).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default WhatsAppSession;
