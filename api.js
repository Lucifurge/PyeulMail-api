// Required Packages
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// In-memory data store for temp emails and messages
const tempEmails = {}; // { email: { createdAt, expiresAt } }
const emailMessages = {}; // { email: [{ sender, subject, content, receivedAt }] }

// Helper function to check if email is expired
const isExpired = (email) => {
  const now = Date.now();
  return tempEmails[email] && tempEmails[email].expiresAt <= now;
};

// API Routes

// Generate a new temp email
app.post('/generate', (req, res) => {
  const uniqueId = uuidv4();
  const tempEmail = `${uniqueId}@pyeul.reyzhaven.com`;

  // Set expiration to 10 minutes (600000 ms)
  const expiresAt = Date.now() + 600000;

  tempEmails[tempEmail] = { createdAt: Date.now(), expiresAt };
  emailMessages[tempEmail] = [];

  res.status(201).json({ tempEmail, expiresAt });
});

// Fetch emails for a temp email
app.get('/emails/:email', (req, res) => {
  const email = req.params.email;

  if (!tempEmails[email]) {
    return res.status(404).json({ error: 'Email address not found.' });
  }

  if (isExpired(email)) {
    delete tempEmails[email];
    delete emailMessages[email];
    return res.status(410).json({ error: 'Email address has expired.' });
  }

  res.status(200).json({ emails: emailMessages[email] });
});

// Simulate receiving an email (for testing purposes)
app.post('/emails/:email', (req, res) => {
  const email = req.params.email;
  const { sender, subject, content } = req.body;

  if (!tempEmails[email]) {
    return res.status(404).json({ error: 'Email address not found.' });
  }

  if (isExpired(email)) {
    delete tempEmails[email];
    delete emailMessages[email];
    return res.status(410).json({ error: 'Email address has expired.' });
  }

  emailMessages[email].push({ sender, subject, content, receivedAt: new Date() });
  res.status(200).json({ message: 'Email received.' });
});

// Clean up expired emails (optional background job simulation)
setInterval(() => {
  const now = Date.now();
  for (const email in tempEmails) {
    if (tempEmails[email].expiresAt <= now) {
      delete tempEmails[email];
      delete emailMessages[email];
    }
  }
}, 60000); // Run every minute

// Start the server
app.listen(PORT, () => {
  console.log(`Temp Mail API running on port ${PORT}`);
});
