const WebSocket = require("ws");

// 連線到你的伺服器
const ws = new WebSocket("ws://127.0.0.1:8080");

const EARTHQUAKE_ID = "eq_19990921_014712";

// ==========================================
// 1. 定義 921 真實災情熱區 (Hotspots)
// ==========================================
const zones = [
    { name: "南投集集/名間 (震央周邊)", lat: 23.83, lon: 120.78, radius: 0.05, dangerRate: 0.8, reports: 30 },
    { name: "南投埔里 (嚴重受創)", lat: 23.96, lon: 120.96, radius: 0.04, dangerRate: 0.7, reports: 40 },
    { name: "台中霧峰/大里 (斷層帶)", lat: 24.08, lon: 120.69, radius: 0.03, dangerRate: 0.85, reports: 50 },
    { name: "台中東勢/石岡 (嚴重受創)", lat: 24.26, lon: 120.82, radius: 0.04, dangerRate: 0.75, reports: 35 },
    { name: "台北松山 (東星大樓)", lat: 25.048, lon: 121.576, radius: 0.005, dangerRate: 0.9, reports: 15 },
    { name: "台中市區 (一般狀況)", lat: 24.14, lon: 120.67, radius: 0.05, dangerRate: 0.1, reports: 60 },
    { name: "彰化市區 (一般狀況)", lat: 24.08, lon: 120.54, radius: 0.06, dangerRate: 0.05, reports: 50 },
    { name: "雲林斗六 (一般狀況)", lat: 23.70, lon: 120.54, radius: 0.05, dangerRate: 0.05, reports: 30 }
];

const dangerMessages = ["房屋倒塌，有人受困！", "一樓被壓扁了", "橋樑斷裂無法通行", "發生火災，急需消防車", "大樓嚴重傾斜", "停電且有人受傷", "通訊中斷，借用衛星網路回報", "路面隆起兩公尺"];
const safeMessages = ["已逃出室外，全家平安", "在空曠處避難中", "搖得很大力但人沒事", "只有櫃子倒塌，人員安全", "目前待在車上", "社區廣場避難中", "平安，準備去買水"];

// 輔助函式：產生隨機經緯度偏移
function getJitteredCoord(base, radius) {
    return base + (Math.random() - 0.5) * radius * 2;
}

// 輔助函式：隨機抽樣
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// ==========================================
// 2. 預先生成所有使用者的回報隊列
// ==========================================
let reportQueue = [];
let userCounter = 1;

zones.forEach(zone => {
    for (let i = 0; i < zone.reports; i++) {
        const isDanger = Math.random() < zone.dangerRate;
        const status = isDanger ? "danger" : "safe";
        const message = isDanger ? getRandomItem(dangerMessages) : getRandomItem(safeMessages);
        
        reportQueue.push({
            type: "report_status",
            earthquakeId: EARTHQUAKE_ID,
            deviceId: `demo_user_${userCounter.toString().padStart(4, '0')}`,
            status: status,
            latitude: getJitteredCoord(zone.lat, zone.radius),
            longitude: getJitteredCoord(zone.lon, zone.radius),
            message: message
        });
        userCounter++;
    }
});

// 將陣列打亂 (Fisher-Yates Shuffle)，讓不同地區的回報交錯出現
for (let i = reportQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [reportQueue[i], reportQueue[j]] = [reportQueue[j], reportQueue[i]];
}

// ==========================================
// 3. 連線並開始「滴水式」發送資料
// ==========================================
ws.on("open", () => {
    console.log(`✅ 成功連線到伺服器！準備開始模擬發送 ${reportQueue.length} 筆資料...`);
    sendNextReport();
});

function sendNextReport() {
    if (reportQueue.length === 0) {
        console.log("🎉 所有模擬資料發送完畢！");
        ws.close();
        return;
    }

    const report = reportQueue.shift();
    ws.send(JSON.stringify(report));
    
    const statusIcon = report.status === "danger" ? "🚨" : "✅";
    console.log(`[發送] ${statusIcon} ${report.deviceId} (${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}) - ${report.message}`);

    // 設定隨機的延遲時間 (100毫秒 ~ 800毫秒之間)，模擬真實世界不規律的網路請求
    const delay = Math.floor(Math.random() * 700) + 100;
    setTimeout(sendNextReport, delay);
}

ws.on("error", (err) => console.error("連線錯誤:", err.message));