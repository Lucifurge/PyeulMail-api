const express = require('express');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');

// Supabase Configuration
const SUPABASE_URL = 'https://ocdcqlcqeqrizxbvfiwp.supabase.co'; // Replace with your Supabase URL
const SUPABASE_KEY = 'your_supabase_key'; // Replace with your Supabase Key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
const PORT = 465;

// CORS Middleware
const allowedOrigins = ['https://pyeulmails.onrender.com'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors()); // Preflight requests handling

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

// SMTP Server Configuration
const smtpServer = new SMTPServer({
  secure: false, // Disable SSL/TLS for now
  onData(stream, session, callback) {
    simpleParser(stream, async (err, parsed) => {
      if (err) {
        console.error('Error parsing email:', err);
        return callback(err);
      }

      console.log('Received email:', parsed);

      const { from, subject } = parsed;
      const recipientEmail = session.envelope.rcptTo[0].address;

      console.log('Parsed email details:', {
        recipientEmail,
        from: from.text,
        subject,
      });

      // Process and store the email message in your database
      try {
        const { data: tempEmail, error: emailError } = await supabase
          .from('temp_emails')
          .select('expires_at')
          .eq('email', recipientEmail)
          .single();

        if (emailError || !tempEmail) {
          console.error('Temporary email not found or error fetching it:', emailError);
          return callback(new Error('Temporary email not found.'));
        }

        const { data, error } = await supabase
          .from('email_messages')
          .insert([{ email: recipientEmail, sender: from.text, subject, received_at: new Date().toISOString() }]);

        if (error) {
          console.error('Error inserting email message:', error);
          return callback(error);
        }

        console.log('Email message inserted successfully:', data);
        callback(null, 'Message received');
      } catch (err) {
        console.error('Error handling email:', err);
        callback(err);
      }
    });
  },
  disabledCommands: ['AUTH'],
  onConnect(session, callback) {
    console.log(`Connection from ${session.remoteAddress}`);
    callback();
  },
  name: 'smtp.jadepremiumservices.com'
});

app.listen(PORT, () => {
  console.log(`Temp Mail API and SMTP server running on port ${PORT}`);
});

smtpServer.listen(PORT, () => {
  console.log('SMTP server listening on port 465');
});
