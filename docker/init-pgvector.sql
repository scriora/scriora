-- Scriora PostgreSQL Init Script
-- Enables pgvector for Semantic Memory (T4) cosine similarity search
-- Enables pgcrypto for gen_random_uuid() and cryptographic functions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
