// npm start
// quake 花蓮縣近海 24.03 121.65 17.5 5.7 4 50
const WebSocket = require("ws");
const readline = require("readline");

const PORT = 8080;
const HOST = "0.0.0.0";

// 建立 WebSocket Server
const wss = new WebSocket.Server({ host: HOST, port: PORT });

// 儲存 client 資訊
let clientIdCounter = 1;

// 產生地震事件 ID
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

// 取得台北時區 ISO 字串
function getTaipeiIsoStringNow() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(now);

    const map = {};
    for (const p of parts) {
        if (p.type !== "literal") {
            map[p.type] = p.value;
        }
    }

    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+08:00`;
}

// 廣播訊息給所有 client
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
    console.log(payload);
}

// 建立預設地震資料
function createDefaultEarthquake() {
    return {
        type: "earthquake",
        version: 1,
        id: generateEarthquakeId(),
        originTime: getTaipeiIsoStringNow(),
        location: "台東縣近海",
        latitude: 22.85,
        longitude: 121.31,
        depthKm: 42.0,
        magnitude: 4.4,
        intensity: 3,
        pgaGal: 85.0
    };
}

// 建立自訂地震資料
function createCustomEarthquake(params) {
    return {
        type: "earthquake",
        version: 1,
        id: params.id || generateEarthquakeId(),
        originTime: params.originTime || getTaipeiIsoStringNow(),
        location: params.location || "未知位置",
        latitude: Number(params.latitude),
        longitude: Number(params.longitude),
        depthKm: Number(params.depthKm),
        magnitude: Number(params.magnitude),
        intensity: Number(params.intensity),
        pgaGal: Number(params.pgaGal)
    };
}

// 檢查是否為有效數字
function isValidNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
}

// 顯示 help
function printHelp() {
    console.log(`
可用命令：

1. help
   顯示所有命令

2. clients
   顯示目前連線 client 數量

3. quake
   發送一筆預設地震資料

4. quake <location> <lat> <lon> <depthKm> <magnitude> <intensity> <pgaGal>
   發送一筆自訂地震資料
   範例：
   quake 台東縣近海 22.85 121.31 42 4.4 3 85

5. heartbeat
   發送心跳訊息

6. raw <json>
   直接發送原始 JSON
   範例：
   raw {"type":"test","message":"這是一筆測試訊息"}

7. exit
   關閉伺服器
`);
}

// WebSocket 連線事件
wss.on("connection", (ws, req) => {
    const clientId = clientIdCounter++;
    const ip = req.socket.remoteAddress;

    console.log(`[Client Connected] clientId=${clientId}, ip=${ip}`);

    // 連線成功後回傳歡迎訊息
    ws.send(JSON.stringify({
        type: "welcome",
        version: 1,
        clientId: clientId,
        serverTime: getTaipeiIsoStringNow(),
        message: "已成功連線到地震模擬伺服器"
    }));

    ws.on("message", (message) => {
        const text = message.toString();
        console.log(`[Client Message] clientId=${clientId}, message=${text}`);

        // 這邊可依需求擴充
        // 例如 client 傳 "ping"，伺服器回 "pong"
        if (text === "ping") {
            ws.send(JSON.stringify({
                type: "pong",
                time: getTaipeiIsoString()
            }));
        }
    });

    ws.on("close", () => {
        console.log(`[Client Disconnected] clientId=${clientId}`);
    });

    ws.on("error", (err) => {
        console.error(`[Client Error] clientId=${clientId}`, err.message);
    });
});

wss.on("listening", () => {
    console.log(`WebSocket server is running on ws://0.0.0.0:${PORT}`);
    printHelp();
});

wss.on("error", (err) => {
    console.error("[Server Error]", err.message);
});

// 建立終端機輸入介面
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "server> "
});

rl.prompt();

rl.on("line", (line) => {
    const input = line.trim();

    if (!input) {
        rl.prompt();
        return;
    }

    const [command, ...args] = input.split(" ");

    switch (command) {
        case "help":
            printHelp();
            break;

        case "clients":
            console.log(`目前連線數量：${wss.clients.size}`);
            break;

        case "quake": {
            if (args.length === 0) {
                const quakeData = createDefaultEarthquake();
                broadcast(quakeData);
                break;
            }

            if (args.length < 7) {
                console.log("參數不足");
                console.log("格式：quake <location> <lat> <lon> <depthKm> <magnitude> <intensity> <pgaGal>");
                console.log("範例：quake 台東縣近海 22.85 121.31 42 4.4 3 85");
                break;
            }

            const location = args[0];
            const latitude = Number(args[1]);
            const longitude = Number(args[2]);
            const depthKm = Number(args[3]);
            const magnitude = Number(args[4]);
            const intensity = Number(args[5]);
            const pgaGal = Number(args[6]);

            if (
                !isValidNumber(latitude) ||
                !isValidNumber(longitude) ||
                !isValidNumber(depthKm) ||
                !isValidNumber(magnitude) ||
                !isValidNumber(intensity) ||
                !isValidNumber(pgaGal)
            ) {
                console.log("數值參數格式錯誤");
                break;
            }

            const quakeData = createCustomEarthquake({
                location,
                latitude,
                longitude,
                depthKm,
                magnitude,
                intensity,
                pgaGal
            });

            broadcast(quakeData);
            break;
        }

        case "heartbeat": {
            const heartbeatData = {
                type: "heartbeat",
                version: 1,
                time: getTaipeiIsoString()
            };
            broadcast(heartbeatData);
            break;
        }

        case "raw": {
            const rawText = input.slice(4).trim();

            if (!rawText) {
                console.log("請輸入 JSON 內容");
                break;
            }

            try {
                const jsonData = JSON.parse(rawText);
                broadcast(jsonData);
            } catch (err) {
                console.log("JSON 格式錯誤:", err.message);
            }
            break;
        }

        case "exit":
            console.log("正在關閉伺服器...");
            rl.close();
            wss.close(() => {
                process.exit(0);
            });
            return;

        default:
            console.log("未知命令，輸入 help 查看可用命令");
            break;
    }

    rl.prompt();
});

rl.on("close", () => {
    console.log("終端介面已關閉");
});