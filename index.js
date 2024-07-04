import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import express from 'express';
import pg from 'pg'
import fs from 'fs';
const { Client } = pg

var _premadeQueryCache = {}
function loadPremadeQuery(name) {
    if (Object.keys(_premadeQueryCache).includes(name)) {
        return _premadeQueryCache[name]
    }
    if (!fs.existsSync("sql/"+name+".sql")) {
        throw new Error("Premade query file does not exist");
    }
    const value = fs.readFileSync("sql/"+name+".sql").toString("utf8");
    _premadeQueryCache[name] = value;
    return value;
}

const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);
const app = express();
const port = process.env.PORT;
const client = new Client()
await client.connect(function (_err) {
    if (process.argv.includes("--DROP_ALL_NO_UNDO")) {
        client.query(loadPremadeQuery("dropall"))
    }
    client.query(loadPremadeQuery("init"));
})

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/commands/chat', async (req, res) => {
    const ephemeralTs = (await web.chat.postEphemeral({
        "channel": req.body.channel_id,
        "user": req.body.user_id,
        "text": ":spin-loading: Setting up chat..."
    })).message_ts;
    console.log(ephemeralTs);
    var userData = await client.query(loadPremadeQuery("userRow/get"), [req.body.user_id]);
    var userRow;
    console.log(userData.rows.length)
    if (userData.rows.length == 0) {
        await client.query(loadPremadeQuery("userRow/create"), [req.body.user_id, [ephemeralTs], [req.body.channel_id]]);
        userData = await client.query(loadPremadeQuery("userRow/get"), [req.body.user_id]);
        userRow = userData.rows[0];
    } else {
        userRow = userData.rows[0];
        userRow.chatstartts.push(ephemeralTs);
        userRow.chatstartchannel.push(req.body.channel_id);
        await client.query(loadPremadeQuery("userRow/modify"), [userRow.chatstartts, userRow.chatstartchannel, req.body.user_id]);
        userData = await client.query(loadPremadeQuery("userRow/get"), [req.body.user_id]);
        userRow = userData.rows[0];
    }
    console.log(userRow)
    res.statusCode = 200;
    res.send();
});

app.get('/', (req, res) => {
    console.log("Status request")
    res.send("Chattyy is online!")
})

app.listen(port, () => {
    console.log(`Chattyy listening on port ${port}`)
});