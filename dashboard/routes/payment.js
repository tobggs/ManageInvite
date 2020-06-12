const express = require("express"),
CheckAuth = require("../auth/CheckAuth"),
fetch = require("node-fetch"),
router = express.Router(),
utils = require("../utils"),
Discord = require("discord.js");

let notSentSignup = [];

router.get("/", CheckAuth, async (_req, res) => {
    res.redirect("/selector");
});

router.get("/callback", async (req, res) => {
    const config = req.client.config.paypal.mode === "live" ? req.client.config.paypal.live : req.client.config.paypal.sandbox;

    // Mark the guild as waiting for verification
    const parsedCM = (req.query.cm || "").split(",");
    parsedCM.shift();
    const guildID = parsedCM[0];
    const userID = parsedCM[1];
    const guildName = parsedCM[2];
    if(!guildID) return res.redirect("/");
    req.client.waitingForVerification.push(guildID);
    res.redirect("/selector");

    req.client.users.fetch(userID).then((user) => {
        const logEmbed = JSON.stringify(new Discord.MessageEmbed()
        .setAuthor(`${user.tag} purchased ManageInvite Premium`, user.displayAvatarURL())
        .setDescription(`Server **${guildName}** is waiting for verification... :clock7:`)
        .setColor("#ff9966")).replace(/[\/\(\)\']/g, "\\$&");
        let { premiumLogs } = req.client.config;
        req.client.shard.broadcastEval(`
            let aLogs = this.channels.cache.get('${premiumLogs}');
            if(aLogs) aLogs.send({ embed: JSON.parse('${logEmbed}')});
        `);
    });

    /* Verify payment and enable premium on the guild
    const payload = new URLSearchParams();
    payload.set('cmd', '_notify-synch')
    payload.set('tx', req.query.tx);
    payload.set('at', config.pdtToken);
    fetch(config.formURL, {
        method: "POST",
        body: payload.toString()
    }).then(async (paypalRes) => {
        transactionsHandled.push(req.query.tx);
        const data = await paypalRes.text();
        const success = data.split('\n').shift() === 'SUCCESS';
        const transaction = {};
        data.split('\n').forEach((raw) => transaction[raw.split('=')[0]] = transaction[raw.split('=')[1]]);
    }); */

});

router.post("/ipn", async (req, res) => {
    const payload = req.body;
    res.sendStatus(200);
    const payloadCopy = new URLSearchParams(payload);
    payloadCopy.set("cmd", "_notify-validate");
    payloadCopy.set("custom", unescape(payload.custom));
    fetch(req.client.config.paypal.mode === "live" ? req.client.config.paypal.live.fetchURL : req.client.config.paypal.sandbox.fetchURL, {
        method: "POST",
        body: payloadCopy.toString()
    }).then(async (paypalRes) => {
        const valid = await paypalRes.text() === "VERIFIED";
        console.log(payload, valid);
        if(!valid) return console.log("Invalid payment");
        if(payload.txn_type === "subscr_signup"){
            if(
                (payload.amount3 !== '2.00') ||
                (payload.receiver_email !== (req.client.config.paypal.mode === "live" ? req.client.config.paypal.live.email : req.client.config.paypal.sandbox.email))
            ) return;
            const paymentData = (payload.custom || "").split(",");
            paymentData.shift();
            if(!paymentData[0]) return;
            const guildID = paymentData[0];
            const userID = paymentData[1];
            const guildName = paymentData[2];
            notSentSignup.push({
                guildID,
                userID,
                guildName,
                payload
            });
            // const guild = await req.client.database.fetchGuild(guildID);
            // await guild.addPremiumDays(30, "sub_dash_paypal", paymentData[1]);
            // await guild.setTrialPeriodEnabled(false);
            req.client.users.fetch(userID).then((user) => {
                /* const embed = new Discord.MessageEmbed()
                .setAuthor(`Thanks for purchasing ManageInvite Premium, ${user.tag}`, user.displayAvatarURL())
                .setDescription(`Congratulations, your server **${guildName}** is now premium! :crown:`)
                .setColor("#F4831B");
                user.send(embed); */
                const logEmbed = JSON.stringify(new Discord.MessageEmbed()
                .setAuthor(`${user.tag} created a subscription`, user.displayAvatarURL())
                .setDescription(`Subscription for guild **${guildName}** created... ${req.client.config.emojis.success}`)
                .setColor("#339900")).replace(/[\/\(\)\']/g, "\\$&");
                let { premiumLogs } = req.client.config;
                req.client.shard.broadcastEval(`
                    let aLogs = this.channels.cache.get('${premiumLogs}');
                    if(aLogs) aLogs.send({ embed: JSON.parse('${logEmbed}')});
                `);
            });
        }
        if(payload.txn_type === "subscr_payment") {
            console.log(payload);
            if(
                (payload.mc_gross !== '2.00') ||
                (payload.receiver_email !== (req.client.config.paypal.mode === "live" ? req.client.config.paypal.live.email : req.client.config.paypal.sandbox.email))
            ) return;
            const paymentData = (payload.custom || "").split(",");
            paymentData.shift();
            const guildID = paymentData[0];
            const userID = paymentData[1];
            const guildName = paymentData[2];
            const paymentDate = new Date();
            req.client.users.fetch(userID).then(async (user) => {
                const signupData = notSentSignup.find((s) => s.guildID === guildID);
                if (signupData) {
                    const embed = new Discord.MessageEmbed()
                    .setAuthor(`Thanks for purchasing ManageInvite Premium, ${user.tag}`, user.displayAvatarURL())
                    .setDescription(`Congratulations, your server **${guildName}** is now premium! :crown:`)
                    .setColor("#F4831B");
                    user.send(embed);
                    notSentSignup = notSentSignup.filter((s) => s.guildID !== guildID);
                    const signupID = await req.client.database.createPayment({
                        payerDiscordID: paymentData[1],
                        payerDiscordUsername: user.tag,
                        payerEmail: signupData.payload.payer_email,
                        transactionID: signupData.payload.txn_id,
                        amount: parseInt(signupData.payload.mc_amount3),
                        createdAt: paymentDate,
                        type: "paypal_dash_signup",
                        details: signupData.payload
                    });
                    const paymentID = await req.client.database.createPayment({
                        payerDiscordID: paymentData[1],
                        payerDiscordUsername: user.tag,
                        payerEmail: payload.payer_email,
                        transactionID: payload.txn_id,
                        amount: parseInt(payload.mc_gross),
                        createdAt: paymentDate,
                        type: "paypal_dash_pmnt",
                        details: payload,
                        signupID
                    });
                    const subscription = await req.client.database.createSubscription({
                        expiresAt: new Date(Date.now()+2592000000),
                        createdAt: paymentDate,
                        subLabel: "Premium Monthly 1 Guild",
                        guildsCount: 1
                    }, false);
                    await req.client.database.createSubPaymentLink(subscription.id, paymentID);
                    await req.client.database.createGuildSubLink(guildID, subscription.id);
                    await subscription.fetchGuilds();
                } else {
                    const paymentID = await req.client.database.createPayment({
                        payerDiscordID: paymentData[1],
                        payerDiscordUsername: user.tag,
                        payerEmail: payload.payer_email,
                        transactionID: payload.txn_id,
                        amount: parseInt(payload.mc_gross),
                        createdAt: paymentDate,
                        type: "paypal_dash_pmnt",
                        details: payload
                    });
                    const guild = await req.client.database.fetchGuild(guildID);
                    await req.client.database.createSubPaymentLink(guild.subscription.id, paymentID);
                    await guild.subscription.addDays(30);
                    if(guild.subscription.isTrial){
                        guild.subscription.changeLabel("Premium Monthly 1 Guild");
                    }
                }
                const logEmbed = JSON.stringify(new Discord.MessageEmbed()
                .setAuthor(`${user.tag} paid for ManageInvite Premium`, user.displayAvatarURL())
                .setDescription(`Recurring payment for **${paymentData[2]}** was paid (**$2**) :crown:`)
                .setColor("#F4831B")).replace(/[\/\(\)\']/g, "\\$&");
                let { premiumLogs } = req.client.config;
                req.client.shard.broadcastEval(`
                    let aLogs = this.channels.cache.get('${premiumLogs}');
                    if(aLogs) aLogs.send({ embed: JSON.parse('${logEmbed}')});
                `);
            });
        }
    });
});

module.exports = router;
