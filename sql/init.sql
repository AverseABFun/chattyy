CREATE TABLE IF NOT EXISTS chats (
    id uuid PRIMARY KEY,
    users text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    chatStartTs text[] NOT NULL,
    chatStartChannel text[] NOT NULL
);