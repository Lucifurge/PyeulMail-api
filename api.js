const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');

// Supabase Configuration
const SUPABASE_URL = 'https://ocdcqlcqeqrizxbvfiwp.supabase.co'; // Replace with your Supabase URL
const SUPABASE_KEY = 'your_supabase_key'; // Replace with your Supabase Key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = ['https://pyeulmails.onrender.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(bodyParser.json());

const isExpired = (expiresAt) => {
  return new Date(expiresAt) <= new Date();
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Generate a new temp email
app.post('/generate', async (req, res) => {
  const { username, domain } = req.body;

  if (!username || !domain) {
    return res.status(400).json({ error: 'Username and domain are required.' });
  }

  const tempEmail = `${username}@${domain}`;

  if (!isValidEmail(tempEmail)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('temp_emails')
    .insert([{ email: tempEmail, inbox: username, expires_at: expiresAt }]);

  if (error) {
    return res.status(500).json({ error: 'Failed to create temp email.', details: error });
  }

  res.status(201).json({ tempEmail, expiresAt });
});

// Fetch all emails for a specific inbox
app.get('/inbox/:inbox', async (req, res) => {
  const { inbox } = req.params;

  const { data: emails, error } = await supabase
    .from('temp_emails')
    .select('email, created_at, expires_at')
    .eq('inbox', inbox);

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch inbox emails.', details: error });
  }

  const result = [];
  for (const email of emails) {
    if (isExpired(email.expires_at)) continue;

    const { data: messages, error: messagesError } = await supabase
      .from('email_messages')
      .select('sender, subject, received_at')
      .eq('email', email.email);

    if (messagesError) {
      return res.status(500).json({ error: 'Failed to fetch email messages.', details: messagesError });
    }

    result.push({ email: email.email, messages });
  }

  res.status(200).json(result);
});

// Delete the temporary email
app.delete('/delete/:email', async (req, res) => {
  const { email } = req.params;

  const { data, error } = await supabase
    .from('temp_emails')
    .delete()
    .eq('email', email);

  if (error) {
    return res.status(500).json({ error: 'Failed to delete temp email.', details: error });
  }

  res.status(200).json({ message: `Email ${email} deleted successfully.` });
});

// Clean up expired emails
app.delete('/cleanup', async (req, res) => {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('temp_emails')
    .delete()
    .lte('expires_at', now);

  if (error) {
    return res.status(500).json({ error: 'Failed to clean up expired emails.', details: error });
  }

  res.status(200).json({ message: 'Expired emails cleaned up.' });
});

app.listen(PORT, () => {
  console.log(`Temp Mail API running on port ${PORT}`);
});
