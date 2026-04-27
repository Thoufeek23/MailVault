# MailVault

> A robust full-stack web application designed to securely archive, manage, and analyze your Gmail data using intelligent AI embeddings.

## About

MailVault is an utility for automated Gmail backups. It safely extracts emails and attachments via the Gmail API, stores them efficiently using Supabase and MongoDB, and utilizes advanced NLP embeddings to enable smart, contextual searches of your inbox history. 

## Features

- ** Secure Authentication:** Seamless Google OAuth 2.0 integration to securely access your inbox without storing raw passwords.
- ** Real-Time Monitoring:** Active WebSocket connections provide live updates to the frontend dashboard as new emails are processed.
- ** Reliable Storage:** Hybrid storage model utilizing MongoDB for metadata and Supabase for raw email JSON and attachment blobs.
- ** AI-Powered Search:** Natural language processing creates embeddings of your emails, allowing for intelligent querying using the Gemini API.
- ** Interactive Dashboard:** Visually track backup statistics, recent imports, and deleted emails across different timeframes.
- ** Restoration:** Easily restore backed-up emails directly back into your live Gmail inbox.

##  Tech Stack

**Frontend:**
- React.js
- React Router DOM
- WebSocket API
- Custom CSS

**Backend:**
- Node.js & Express.js
- MongoDB & Mongoose
- Google APIs (`googleapis`)
- Passport.js (Google OAuth)
- JSON Web Tokens (JWT)
- Supabase (Blob Storage)
- Node NLP / Gemini API (Embeddings)
