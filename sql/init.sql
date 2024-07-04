CREATE TABLE IF NOT EXISTS chats (
    id uuid PRIMARY KEY,
    users text[] NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    unsubscribed_all boolean NOT NULL,
    unsubscribed_in text[] NOT NULL
);