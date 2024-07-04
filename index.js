import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import express from 'express';
import pg from 'pg'
const { Client } = pg

const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);
const app = express();
const port = process.env.PORT;
const client = new Client()
await client.connect()

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/commands/chat', (req, res) => {
    web.chat.postEphemeral({
        "channel": req.body.channel_id,
        "user": req.body.user_id,
        "text": ":spin-loading: Setting up chat..."
    })
    res.statusCode = 200;
    res.send();
});
  
app.listen(port, () => {
    console.log(`Chattyy listening on port ${port}`)
});