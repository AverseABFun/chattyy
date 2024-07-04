import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import express from 'express';

// Read a token from the environment variables
const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);
const app = express()
const port = process.env.PORT