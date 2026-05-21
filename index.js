
const fetch = require("node-fetch");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const MIN_LIQ = parseFloat(process.env.MIN_LIQ || "30000");
const MAX_LIQ = parseFloat(process.env.MAX_LIQ || "80000");
const MAX_MCAP = parseFloat(process.env.MAX_MCAP || "100000");
const INTERVAL = parseInt(process.env.INTERVAL || "60") * 1000;

const alerted = new Set();

function fmt(n) {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

async function sendTelegram(text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    return data.ok;
  } catch (e) {
    console.error("Telegram error:", e.message);
    return false;
  }
}

async function scan() {
  console.log(`[${new Date().toISOString()}] Scanning...`);
  let pairs = [];

  try {
    const urls = [
      "https://api.dexscreener.com/latest/dex/search?q=solana",
      "https://api.dexscreener.com/token-boosts/latest/v1",
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          const d = await r.json();
          const p = Array.isArray(d) ? d : d.pairs || [];
          pairs = pairs.concat(p);
        }
      } catch (e) {}
    }

    const solPairs = pairs.filter((p) => p.chainId === "solana");
    console.log(`Found ${solPairs.length} Solana pairs`);

    const matched = solPairs.filter((p) => {
      const liq = p.liquidity?.usd || 0;
      const mcap = p.fdv || p.marketCap || 0;
      return liq >= MIN_LIQ && liq <= MAX_LIQ && mcap > 0 && mcap <= MAX_MCAP;
    });

    console.log(`Matched: ${matched.length}`);

    for (const p of matched) {
      const key = p.pairAddress;
      if (!key || alerted.has(key)) continue;

      const name = p.baseToken?.name || "Unknown";
      const sym = p.baseToken?.symbol || "?";
      const liq = fmt(p.liquidity?.usd || 0);
      const mcap = fmt(p.fdv || p.marketCap || 0);
      const ch24 = parseFloat(p.priceChange?.h24 || 0).toFixed(2);
      const url = `https://dexscreener.com/solana/${key}`;

      const msg =
        `🚨 <b>SOLANA MEMECOIN ALERT</b>\n\n` +
        `🪙 <b>${name}</b> (<code>${sym}</code>)\n` +
        `📊 Liquidity: <b>${liq}</b>\n` +
        `💰 Market Cap: <b>${mcap}</b>\n` +
        `📈 24h Change: <b>${ch24 >= 0 ? "+" : ""}${ch24}%</b>\n` +
        `🔑 Pair: <code>${key}</code>\n` +
        `🔗 <a href="${url}">View on DexScreener</a>`;

      const ok = await sendTelegram(msg);
      if (ok) {
        alerted.add(key);
        console.log(`✅ Alert sent: ${sym} Liq:${liq} MCap:${mcap}`);
      } else {
        console.log(`❌ Failed to send alert for ${sym}`);
      }
    }
  } catch (e) {
    console.error("Scan error:", e.message);
  }
}

console.log("🚀 Solana Memecoin Scanner started");
console.log(`Filters: Liq $${MIN_LIQ}-$${MAX_LIQ} | MCap <$${MAX_MCAP}`);
console.log(`Interval: ${INTERVAL / 1000}s`);

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("❌ Missing BOT_TOKEN or CHAT_ID environment variables!");
  process.exit(1);
}

scan();
setInterval(scan, INTERVAL);
