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
var _premadeBlocksCache = {}
function loadPremadeBlocks(name, substitutions = []) {
    function substitute(value) {
        var out = value;
        for (var item of substitutions.keys()) {
            out = out.replaceAll(item, substitutions[item])
        }
        return out
    }
    if (Object.keys(_premadeBlocksCache).includes(name)) {
        return substitute(_premadeBlocksCache[name])
    }
    if (!fs.existsSync("blocks/"+name+".json")) {
        throw new Error("Premade blocks file does not exist");
    }
    const value = fs.readFileSync("blocks/"+name+".json").toString("utf8");
    _premadeBlocksCache[name] = value;
    return substitute(value);
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
    const statusTs = (await web.chat.postMessage({
        "channel": req.body.channel_id,
        "text": ":spin-loading: Setting up chat..."
    })).ts;
    console.log(statusTs);
    res.statusCode = 200;
    res.send();
    var chat = (await client.query(loadPremadeQuery("chats/getRandom"), [req.body.user_id])).rows[0];
    if (chat == undefined) {
        if (!(await web.conversations.info({"channel": req.body.channel_id})).channel.is_private) {
            web.chat.postEphemeral({
                "channel": req.body.channel_id,
                "user": req.body.user_id,
                "text": ":warning: Error: Command ran in public channel. Please run command in private channel, dm, or group."
            });
            web.chat.delete({
                "channel": req.body.channel_id,
                "ts": statusTs
            })
            return;
        }
        var members = (await web.conversations.members({
            "channel": req.body.channel_id
        })).members;
        members.splice(members.indexOf(process.env.SLACK_APP_USER_ID), 1);
        chat = (await client.query(loadPremadeQuery("chats/create"), [req.body.user_id]));
        for (var member of members) {
            var userData = await client.query(loadPremadeQuery("userRow/get"), [member]);
            if (userData.rowCount == 0) {
                await client.query(loadPremadeQuery("userRow/create"), [member]);
                continue;
            }
            if (userData.rows[0].unsubscribed_all || userData.rows[0].unsubscribed_in.includes(req.body.channel_id)) {
                continue;
            }
            const convoId = (await web.conversations.open({
                "users": [member]
            })).channel.id
            web.chat.postMessage({
                "blocks": loadPremadeBlocks("new_chatty_chat", {
                    "{1}": req.body.channel_id,
                    "{2}": member
                }),
                "channel": convoId
            })
        }
        web.chat.update({
            "channel": req.body.channel_id,
            "ts": statusTs,
            "text": "Sent out invites to chatty chat. Remember to keep it anonymous!"
        })
    }
});

app.post('/commands/unsubscribe', async (req, res) => {
    
    res.statusCode = 200;
    res.send();
    var channel = req.body.channel_id;
    const regex = /<#(C[A-Z0-9]*)\|[a-zA-Z0-9_\-]*>/gm;
    var regexMatch = req.body.text.matchAll(regex)[0];
    if (regexMatch != undefined) {
        regexMatch = regexMatch[0];
    }
    channel = regexMatch == undefined ? channel : regexMatch;
    if (req.body.text == "all") {
        channel = "all"
    }
    if (!(await web.conversations.info({"channel": req.body.channel_id})).channel.is_private) {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": ":warning: Error: Command ran in public channel. Please run command in private channel, dm, or group."
        });
        
        return;
    }
    var userData = await client.query(loadPremadeQuery("userRow/get"), [req.body.user_id]);
    if (userData.rowCount == 0) {
        await client.query(loadPremadeQuery("userRow/create"), [req.body.user_id]);
    }
    if (userData.rows[0].unsubscribed_all) {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You are already unsubscribed from all channels!"
        });
        
        return;
    }
    if (userData.rows[0].unsubscribed_in.includes(req.body.channel_id)) {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You are already unsubscribed from this channel!"
        });
        
        return;
    }
    if (channel == "all") {
        await client.query(loadPremadeQuery("userRow/unsubscribeAll"), [req.body.user_id]);
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You have been unsubscribed from all channels. To undo this, run /resubscribe all."
        });
        
    } else {
        await client.query(loadPremadeQuery("userRow/unsubscribe"), [channel, req.body.user_id]);
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": `You have been unsubscribed from channel <#${channel}>. To undo this, run /resubscribe <#${channel}>.`
        });
        
    }
});

app.post('/commands/resubscribe', async (req, res) => {
    res.statusCode = 200;
    res.send();
    var channel = req.body.channel_id;
    const regex = /<#(C[A-Z0-9]*)\|[a-zA-Z0-9_\-]*>/gm;
    var regexMatch = req.body.text.matchAll(regex)[0][1];
    channel = regexMatch == undefined ? channel : regexMatch;
    if (req.body.text == "all") {
        channel = "all"
    }
    if (!(await web.conversations.info({"channel": req.body.channel_id})).channel.is_private) {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": ":warning: Error: Command ran in public channel. Please run command in private channel, dm, or group."
        });
        
        return;
    }
    var userData = await client.query(loadPremadeQuery("userRow/get"), [req.body.user_id]);
    if (userData.rowCount == 0) {
        await client.query(loadPremadeQuery("userRow/create"), [req.body.user_id]);
    }
    if (!userData.rows[0].unsubscribed_all && channel == "all") {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You aren't unsubscribed from all channels!"
        });
        
        return;
    }
    if (!userData.rows[0].unsubscribed_in.includes(req.body.channel_id)) {
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You aren't unsubscribed from this channel!"
        });
        
        return;
    }
    if (channel == "all") {
        await client.query(loadPremadeQuery("userRow/resubscribeAll"), [req.body.user_id]);
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": "You have been resubscribed to all channels. To undo this, run /unsubscribe all."
        });
        
    } else {
        await client.query(loadPremadeQuery("userRow/resubscribe"), [channel, req.body.user_id]);
        web.chat.postEphemeral({
            "channel": req.body.channel_id,
            "user": req.body.user_id,
            "text": `You have been resubscribed to channel <#${channel}>. To undo this, run /unsubscribe <#${channel}>.`
        });
        
    }
});

app.get('/', (req, res) => {
    console.log("Status request")
    res.send("Chattyy is online!")
})

app.listen(port, () => {
    console.log(`Chattyy listening on port ${port}`)
});