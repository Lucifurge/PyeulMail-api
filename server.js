const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Supabase Configuration
const SUPABASE_URL = 'https://ocdcqlcqeqrizxbvfiwp.supabase.co'; // Replace with your Supabase URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZGNxbGNxZXFyaXp4YnZmaXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc1MzkwOTEsImV4cCI6MjA1MzExNTA5MX0.g9rGkVFMxI8iqBNtGzeDvkDGfbmSZhq7J32LITaTkq0'; // Replace with your Supabase Key
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  console.log(`Temp Mail API running on port ${PORT}`);
});

smtpServer.listen(465, () => {
  console.log('SMTP server listening on port 465');
});
