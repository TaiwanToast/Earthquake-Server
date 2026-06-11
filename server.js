// npm start
// quake 花蓮縣近海 24.03 121.65 17.5 5.7 4 50
const WebSocket = require("ws");
const readline = require("readline");
const sqlite3 = require("sqlite3").verbose(); // 引入 SQLite3

const PORT = 8080;
const HOST = "127.0.0.1";

// ==========================================
// 1. 資料庫初始化設定 (非同步)
// ==========================================
const db = new sqlite3.Database("reports.db", (err) => {
    if (err) {
        console.error("資料庫連線失敗:", err.message);
    } else {
        console.log("已成功連線到 SQLite 資料庫 (reports.db)");
    }
});

// 建立資料表 (使用 db.serialize 確保按順序執行)
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS user_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            earthquake_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            status TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            message TEXT,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(earthquake_id, device_id)
        );
    `);
});

// 定義 SQL 語法常數
const upsertSQL = `
    INSERT INTO user_reports (earthquake_id, device_id, status, latitude, longitude, message)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(earthquake_id, device_id) 
    DO UPDATE SET 
        status = excluded.status,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        message = excluded.message,
        update_time = CURRENT_TIMESTAMP;
`;

const selectSQL = `SELECT * FROM user_reports WHERE earthquake_id = ?;`;


// ==========================================
// 2. 伺服器狀態與輔助函式
// ==========================================
const wss = new WebSocket.Server({ host: HOST, port: PORT });
let clientIdCounter = 1;
let currentEarthquakeId = null; // 記錄目前最新的地震事件 ID

function generateEarthquakeId() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `eq_${yyyy}${MM}${dd}_${HH}${mm}${ss}`;
}

function getTaipeiIsoStringNow() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).formatToParts(now);

    const map = {};
    for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+08:00`;
}

function broadcast(data) {
    const payload = JSON.stringify(data);
    let sentCount = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            sentCount++;
        }
    });
    console.log(`\n[Broadcast] 已送出給 ${sentCount} 個 client`);
}

function createDefaultEarthquake() {
    currentEarthquakeId = generateEarthquakeId();
    return {
        type: "earthquake", version: 1, id: currentEarthquakeId,
        originTime: getTaipeiIsoStringNow(), location: "台東縣近海",
        latitude: 22.85, longitude: 121.31, depthKm: 42.0,
        magnitude: 4.4, intensity: 3, pgaGal: 85.0
    };
}

function createCustomEarthquake(params) {
    currentEarthquakeId = params.id || generateEarthquakeId();
    return {
        type: "earthquake", version: 1, id: currentEarthquakeId,
        originTime: params.originTime || getTaipeiIsoStringNow(), location: params.location || "未知位置",
        latitude: Number(params.latitude), longitude: Number(params.longitude),
        depthKm: Number(params.depthKm), magnitude: Number(params.magnitude),
        intensity: Number(params.intensity), pgaGal: Number(params.pgaGal)
    };
}

function isValidNumber(value) { return typeof value === "number" && !Number.isNaN(value); }

function printHelp() {
    console.log(`
可用命令：
1. help        顯示所有命令
2. clients     顯示目前連線 client 數量
3. quake       發送預設地震資料
4. quake <loc> <lat> <lon> <depth> <mag> <int> <pga> 發送自訂地震資料
5. heartbeat   發送心跳訊息
6. raw <json>  直接發送原始 JSON
7. exit        關閉伺服器
`);
}

// ==========================================
// 3. WebSocket 連線與事件處理
// ==========================================
wss.on("connection", (ws, req) => {
    const clientId = clientIdCounter++;
    const ip = req.socket.remoteAddress;

    console.log(`[Client Connected] clientId=${clientId}, ip=${ip}`);

    ws.send(JSON.stringify({
        type: "welcome",
        version: 1,
        clientId: clientId,
        serverTime: getTaipeiIsoStringNow(),
        currentEarthquakeId: currentEarthquakeId,
        message: "已成功連線到地震模擬伺服器"
    }));

    ws.on("message", (message) => {
        const text = message.toString();

        if (text === "ping") {
            ws.send(JSON.stringify({ type: "pong", time: getTaipeiIsoStringNow() }));
            return;
        }

        try {
            const data = JSON.parse(text);

            // 處理：使用者上傳狀態回報
            if (data.type === "report_status") {
                if (!data.earthquakeId || !data.deviceId || !data.status || !data.latitude || !data.longitude) {
                    ws.send(JSON.stringify({ type: "error", message: "回報資料缺少必要參數" }));
                    return;
                }

                // 使用 sqlite3 的 run 進行寫入 (非同步 Callback)
                db.run(upsertSQL, [
                    data.earthquakeId,
                    data.deviceId,
                    data.status,
                    Number(data.latitude),
                    Number(data.longitude),
                    data.message || ""
                ], function(err) {
                    if (err) {
                        console.error(`[DB Error] 寫入失敗: ${err.message}`);
                        ws.send(JSON.stringify({ type: "error", message: "資料庫寫入失敗" }));
                        return;
                    }

                    console.log(`[DB Insert/Update] ${data.deviceId} 回報狀態: ${data.status}`);

                    // 確保資料庫寫入成功後，才回傳成功給 Client 並廣播
                    ws.send(JSON.stringify({ type: "report_ack", message: "回報成功" }));

                    broadcast({
                        type: "map_update",
                        data: {
                            earthquakeId: data.earthquakeId,
                            deviceId: data.deviceId,
                            status: data.status,
                            latitude: Number(data.latitude),
                            longitude: Number(data.longitude),
                            message: data.message || "",
                            updateTime: getTaipeiIsoStringNow()
                        }
                    });
                });
            }

            // 處理：App 請求初始地圖資料
            if (data.type === "get_map_data") {
                if (!data.earthquakeId) {
                    ws.send(JSON.stringify({ type: "error", message: "需提供 earthquakeId" }));
                    return;
                }

                // 使用 sqlite3 的 all 撈取該地震的所有回報 (非同步 Callback)
                db.all(selectSQL, [data.earthquakeId], (err, rows) => {
                    if (err) {
                        console.error(`[DB Query Error] 查詢失敗: ${err.message}`);
                        ws.send(JSON.stringify({ type: "error", message: "資料庫查詢失敗" }));
                        return;
                    }

                    ws.send(JSON.stringify({
                        type: "map_data_init",
                        earthquakeId: data.earthquakeId,
                        data: rows
                    }));
                    console.log(`[DB Query] 送出 ${rows.length} 筆資料給 clientId=${clientId}`);
                });
            }

        } catch (err) {
            console.log(`[JSON Parse Error] clientId=${clientId}, 錯誤: ${err.message}`);
        }
    });

    ws.on("close", () => console.log(`[Client Disconnected] clientId=${clientId}`));
    ws.on("error", (err) => console.error(`[Client Error] clientId=${clientId}`, err.message));
});

wss.on("listening", () => {
    console.log(`WebSocket server is running on ws://0.0.0.0:${PORT}`);
    printHelp();
});
wss.on("error", (err) => console.error("[Server Error]", err.message));


// ==========================================
// 4. 終端機互動指令介面
// ==========================================
const rl = readline.createInterface({
    input: process.stdin, output: process.stdout, prompt: "server> "
});

rl.prompt();

rl.on("line", (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    const [command, ...args] = input.split(" ");

    switch (command) {
        case "help": printHelp(); break;
        case "clients": console.log(`目前連線數量：${wss.clients.size}`); break;
        case "quake":
            if (args.length === 0) { broadcast(createDefaultEarthquake()); break; }
            if (args.length < 7) { console.log("參數不足"); break; }
            const location = args[0], lat = Number(args[1]), lon = Number(args[2]);
            const depth = Number(args[3]), mag = Number(args[4]), int = Number(args[5]), pga = Number(args[6]);
            if (![lat, lon, depth, mag, int, pga].every(isValidNumber)) { console.log("數值格式錯誤"); break; }
            broadcast(createCustomEarthquake({ location, latitude: lat, longitude: lon, depthKm: depth, magnitude: mag, intensity: int, pgaGal: pga }));
            break;
        case "heartbeat": broadcast({ type: "heartbeat", version: 1, time: getTaipeiIsoStringNow() }); break;
        case "raw":
            const rawText = input.slice(4).trim();
            if (!rawText) { console.log("請輸入 JSON"); break; }
            try { broadcast(JSON.parse(rawText)); } catch (err) { console.log("JSON 錯誤:", err.message); }
            break;
        case "exit":
            console.log("正在關閉伺服器...");
            // 非同步關閉資料庫
            db.close((err) => {
                if (err) console.error("關閉資料庫時發生錯誤:", err.message);
                rl.close();
                wss.close(() => process.exit(0));
            });
            return;
        default: console.log("未知命令"); break;
    }
    rl.prompt();
});
rl.on("close", () => console.log("終端介面已關閉"));