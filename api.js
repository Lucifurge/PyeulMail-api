const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors'); // Import the CORS package

// Supabase Configuration
const SUPABASE_URL = 'https://ocdcqlcqeqrizxbvfiwp.supabase.co'; // Replace with your Supabase URL
const SUPABASE_KEY = 'YOUR_SUPABASE_KEY'; // Replace with your Supabase key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());

// Helper function to check expiration
const isExpired = (expiresAt) => {
  return new Date(expiresAt) <= new Date();
};

// API Routes

// Generate a new temp email
app.post('/generate', async (req, res) => {
  const { username, domain } = req.body; // Expecting username and domain from frontend

  if (!username || !domain) {
    return res.status(400).json({ error: 'Username and domain are required.' });
  }

  const tempEmail = `${username}${domain}`;
  
  // Set expiration to 1 day (24 hours)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expires in 1 day

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
    if (isExpired(email.expires_at)) {
      // Skip expired emails
      continue;
    }

    const { data: messages, error: messagesError } = await supabase
      .from('email_messages')
      .select('sender, subject, content, received_at')
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

// Endpoint to simulate receiving an email (for testing purposes)
app.post('/emails/:email', async (req, res) => {
  const { email } = req.params;
  const { sender, subject, content } = req.body;

  // Check if the temporary email exists
  const { data: tempEmail, error: emailError } = await supabase
    .from('temp_emails')
    .select('expires_at')
    .eq('email', email)
    .single();

  if (!tempEmail) {
    return res.status(404).json({ error: 'Email address not found.' });
  }

  if (emailError || isExpired(tempEmail.expires_at)) {
    return res.status(410).json({ error: 'Email address has expired.' });
  }

  // Insert the email message into the database
  const { data, error } = await supabase
    .from('email_messages')
    .insert([{ email, sender, subject, content }]);

  if (error) {
    return res.status(500).json({ error: 'Failed to save email message.', details: error });
  }

  // Extract the code from the email content (for authentication codes)
  const codeMatch = content.match(/(\d{6,})/);  // Assuming the code is a 6-digit number
  if (codeMatch) {
    const code = codeMatch[0];  // Extracted code
    console.log(`Authentication Code: ${code}`);
    // You can store this code or send it back as part of the response
    res.status(200).json({ message: 'Email received with code', code });
  } else {
    res.status(200).json({ message: 'Email received without code.' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Temp Mail API running on port ${PORT}`);
});
