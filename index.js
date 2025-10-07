const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// === Default fallback (kalau gagal ambil dari M3U) ===
let BASE_URL = "https://d2tjypxxy769fn.cloudfront.net/out/v1/3c619ecc120b46e999d1eaa627cc544f/";

// === Data Channel + ClearKey Dinamis ===
let CHANNELS = {};
let CLEARKEYS = {}; // <-- tiap channel punya clearKey berbeda

async function loadM3U() {
    try {
        const res = await fetch("https://raw.githubusercontent.com/Bintang73/tv/refs/heads/main/bola.m3u");
        const text = await res.text();
        const lines = text.split("\n");

        let currentName = null;
        let currentKey = null;

        for (const line of lines) {
            if (line.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
                currentKey = line.split("=")[1].trim();
            } else if (line.startsWith("#EXTINF")) {
                const nameMatch = line.match(/,(.+)$/);
                currentName = nameMatch ? nameMatch[1].trim() : "Unknown";
            } else if (line.startsWith("http")) {
                const url = line.trim();
                if (currentName) CHANNELS[currentName] = url;
                if (currentName && currentKey) {
                    const [kid, key] = currentKey.split(":");
                    CLEARKEYS[currentName] = { [kid]: key };
                }
                currentKey = null;
                currentName = null;
            }
        }

        console.log(`✅ Loaded ${Object.keys(CHANNELS).length} channels from M3U`);
    } catch (err) {
        console.error("⚠️ Failed to load M3U:", err);
    }
}

loadM3U();
setInterval(loadM3U, 1000 * 60 * 10); // refresh tiap 10 menit

// === Halaman utama ===
app.get("/", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NontonAja</title>
<style>
body {margin:0;font-family:'Inter',Arial,sans-serif;background:#000;color:#fff;display:flex;justify-content:center;}
.app {width:100%;max-width:420px;background:#000;min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;position:relative;padding-bottom:80px;}
header {background:#111;color:#f44336;text-align:center;font-size:1.4em;font-weight:bold;padding:12px 0;border-bottom:1px solid #222;position:sticky;top:0;z-index:10;}
.tabs {display:flex;overflow-x:auto;background:#111;scrollbar-width:none;-ms-overflow-style:none;border-bottom:1px solid #222;}
.tabs::-webkit-scrollbar{display:none;}
.tab {flex:0 0 auto;padding:10px 16px;cursor:pointer;color:#bbb;font-size:0.9em;white-space:nowrap;transition:0.3s;}
.tab.active {color:#f44336;border-bottom:2px solid #f44336;}
video {width:100%;border-radius:12px;background:#000;box-shadow:0 0 20px rgba(0,0,0,0.6);margin:10px 0;}
#status {text-align:center;margin-bottom:10px;color:#0f0;font-family:monospace;font-size:14px;}
.channels {display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px;}
.channel {background:#1a1a1a;border-radius:8px;display:flex;align-items:center;justify-content:center;height:65px;cursor:pointer;transition:transform 0.2s ease,background 0.2s ease;}
.channel:hover {transform:scale(1.05);background:#252525;}
.channel img {max-width:90%;max-height:90%;object-fit:contain;}
.bottom-nav {position:fixed;bottom:0;width:100%;max-width:420px;display:flex;justify-content:space-around;background:#111;border-top:1px solid #222;padding:8px 0;z-index:20;}
.bottom-nav div {text-align:center;font-size:0.8em;color:#888;transition:color 0.2s;}
.bottom-nav div.active {color:#f44336;}
.fade {opacity:0;transform:translateY(10px);transition:opacity 0.3s ease, transform 0.3s ease;}
.fade.show {opacity:1;transform:translateY(0);}

video::-webkit-media-controls-panel {
    display: flex !important;
}

video::-webkit-media-controls-play-button,
video::-webkit-media-controls-timeline,
video::-webkit-media-controls-current-time-display,
video::-webkit-media-controls-time-remaining-display {
    display: none !important;
}
</style>
</head>
<body>
<div class="app">
<header>NontonAja</header>
<div class="tabs" id="tabs"></div>
<video id="video" autoplay playsinline controls></video>
<div id="status">Select a channel...</div>
<div class="channels fade show" id="channels"></div>
<div class="bottom-nav">
  <div class="active">🏠 Home</div>
  <div>🔍 Search</div>
  <div>❤️ Favorite</div>
  <div>⚙️ Settings</div>
</div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.8.5/shaka-player.compiled.js"></script>
<script>
const video = document.getElementById("video");
const status = document.getElementById("status");
const channelsDiv = document.getElementById("channels");
const tabsDiv = document.getElementById("tabs");
const player = new shaka.Player(video);
let currentUri = null;

player.addEventListener('error', e => {
  console.warn("⚠️ Shaka Error:", e.detail);
  status.innerText = "Reconnecting...";
  if(currentUri) setTimeout(()=>player.load(currentUri),3000);
});

async function loadChannels() {
  const res = await fetch("https://raw.githubusercontent.com/Bintang73/tv/refs/heads/main/bola.m3u");
  const text = await res.text();
  const lines = text.split("\\n").map(l=>l.trim()).filter(l=>l);
  const channels = [];
  let currentMeta = {};
  for(let line of lines){
    if(line.startsWith("#EXTINF")){
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const nameMatch = line.split(",").pop().trim();
      currentMeta = {name:nameMatch,logo:logoMatch?logoMatch[1]:"",group:groupMatch?groupMatch[1]:"Other"};
    } else if(!line.startsWith("#") && currentMeta.name){
      currentMeta.url = line;
      channels.push({...currentMeta});
      currentMeta = {};
    }
  }

  // --- Buat tabs kategori ---
  const groups = [...new Set(channels.map(c=>c.group))];
  tabsDiv.innerHTML = '<div class="tab active" data-cat="All">ALL</div>' + 
  groups.map(g => '<div class="tab" data-cat="' + g + '">' + g.toUpperCase() + '</div>').join('');

  // --- Render channels berdasarkan kategori default "All" ---
  renderChannels(channels, "All");

  document.querySelectorAll(".tab").forEach(tab=>{
    tab.addEventListener("click", ()=>{
      document.querySelector(".tab.active").classList.remove("active");
      tab.classList.add("active");
      renderChannels(channels, tab.dataset.cat);
    });
  });
}

function renderChannels(channels, category){
  channelsDiv.classList.remove("show");
  setTimeout(()=>{
    const filtered = category==="All"?channels:channels.filter(c=>c.group===category);
    channelsDiv.innerHTML = filtered.map(c=>"<div class='channel' data-name='"+c.name+"'><img src='"+c.logo+"' alt='"+c.name+"' title='"+c.name+"'></div>").join("");
    channelsDiv.classList.add("show");

    // --- Tambahkan click untuk load ClearKey Shaka ---
    document.querySelectorAll(".channel").forEach(div=>{
      div.addEventListener("click", async ()=>{
        const name = div.dataset.name;
        status.innerText = "Loading "+name+"...";
        const keyRes = await fetch("/clearkey?ch="+encodeURIComponent(name));
        const keyData = await keyRes.json();
        player.configure({
          streaming:{lowLatencyMode:true,rebufferingGoal:1,bufferingGoal:3},
          manifest:{dash:{ignoreMinBufferTime:true}},
          drm:{clearKeys:keyData}
        });
        const uri = "/index.mpd?ch="+encodeURIComponent(name);
        currentUri = uri;
        try{
          await player.load(uri);
          status.innerText = name+" 🔴 Live";
        }catch(err){
          console.error(err);
          status.innerText = "Retrying...";
          setTimeout(()=>player.load(uri),5000);
        }
      });
    });
  },150);
}

loadChannels();
</script>
</body>
</html>`);
});


// === Endpoint ambil ClearKey dinamis ===
app.get("/clearkey", (req, res) => {
    const ch = decodeURIComponent(req.query.ch || "");
    res.json(CLEARKEYS[ch] || {});
});

// === Proxy handler dinamis ===
app.use(async (req, res) => {
    try {
        // Deteksi channel dari query ?ch=
        const ch = decodeURIComponent(req.query.ch || "");
        if (ch && CHANNELS[ch]) {
            const url = CHANNELS[ch];
            const base = url.substring(0, url.lastIndexOf("/") + 1);
            BASE_URL = base; // update base
        }

        const target = BASE_URL + req.originalUrl.replace(/^\//, "").split("?")[0];
        console.log("Proxy →", target);

        const response = await fetch(target, {
            headers: {
                "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
                "Accept": "*/*",
                "Accept-Encoding": "identity",
                Range: req.headers.range || undefined,
            },
        });

        res.status(response.status);
        response.headers.forEach((v, n) => res.setHeader(n, v));
        response.body.pipe(res);
    } catch (err) {
        console.error("Proxy error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// === Start server ===
app.listen(PORT, () => {
    console.log(`✅ Server running → http://localhost:${PORT}`);
});
