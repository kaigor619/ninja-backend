const { Telegraf, Markup } = require("telegraf");
const path = require("path");
const jws = require("jws");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const app = express();

const gameName = process.env.GAME_NAME;
const gameUrl = process.env.GAME_URL;
const jwsAlg = "HS256";
const jwsSecretKey = process.env.SECRET_KEY;

bot.start((ctx) => {
  ctx.sendGame(gameName);
});

bot.on("callback_query", function (query) {
  const token = jws.sign({
    header: { alg: jwsAlg },
    payload: {
      game: gameName,
      user: query.update.callback_query.from.id,
      imessage: undefined,
      message: query.update.callback_query.message.message_id,
      chat: query.update.callback_query.message.chat.id,
    },
    secret: jwsSecretKey,
  });

  query.answerGameQuery(`${gameUrl}?token=${token}`);
});

bot.launch();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*",
  })
);

const BOT_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

app.all("/score", (req, res, next) => {
  const token = req.headers.token;

  if (!jws.verify(token, jwsAlg, jwsSecretKey)) {
    res.statusCode = 403;
    return res.end();
  }
  req.microGame = JSON.parse(jws.decode(token).payload);
  next();
});

app.get("/score", (req, res) => {
  const { user, imessage, chat, message } = req.microGame;

  const searchParams = new URLSearchParams();
  searchParams.append("user_id", user);
  searchParams.append("message_id", message);
  searchParams.append("chat_id", chat);
  searchParams.append("inline_message_id", imessage);

  fetch(`${BOT_API_URL}/getGameHighScores?${searchParams.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.ok) throw data;

      res.setHeader("content-type", "application/json");
      res.statusCode = 200;
      res.end(JSON.stringify({ score: data.result[0].score }));
    })
    .catch((err) => {
      res.statusCode = err.error_code || 500;
      res.end(err.description);
    });
});

app.post("/score", (req, res) => {
  const scoreValue = parseInt(req.body.score);
  if (scoreValue <= 0) {
    res.statusCode = 400;
    return res.end();
  }
  const { user, imessage, chat, message } = req.microGame;

  const searchParams = new URLSearchParams();
  searchParams.append("user_id", user);
  searchParams.append("message_id", message);
  searchParams.append("chat_id", chat);
  searchParams.append("inline_message_id", imessage);
  searchParams.append("score", scoreValue);
  searchParams.append("force", true);

  fetch(`${BOT_API_URL}/setGameScore?${searchParams.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      if (!data.ok) throw data;

      res.statusCode = 200;
      res.end();
    })
    .catch((err) => {
      res.statusCode = err.error_code || 500;
      res.end(err.description);
    });
});

app.listen(3000, () => {
  console.log("Server beginning in port 3000");
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));

process.once("SIGTERM", () => bot.stop("SIGTERM"));
