import 'dotenv/config'
const { WebClient } = require('@slack/web-api');

// Read a token from the environment variables
const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);

