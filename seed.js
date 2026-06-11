const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("reports.db", (err) => {
    if (err) {
        console.error("資料庫連線失敗:", err.message);
        process.exit(1);
    }
    console.log("已連線到資料庫，準備大量寫入 921 模擬資料...");
});

// 921 大地震的專屬 ID
const earthquakeId = "eq_19990921_014712";

// ==========================================
// 參數設定區
// ==========================================
const TOTAL_RECORDS = 1500; // 你可以在這裡調整數量，例如 500、2000 甚至 10000 筆

// 台灣中部的經緯度範圍 (涵蓋南投、台中、彰化、雲林)
// 中心點大約是集集 (Lat: 23.85, Lon: 120.82)
const LAT_MIN = 23.5;
const LAT_MAX = 24.3;
const LON_MIN = 120.4;
const LON_MAX = 121.1;

// 隨機訊息庫
const dangerMessages = ["房屋倒塌", "有人受困", "橋樑斷裂", "發生火災", "急需醫療支援", "道路受阻", "大樓傾斜", "停水停電且無通訊"];
const safeMessages = ["全家平安", "已疏散到空曠處", "在公園避難", "一切安全", "只有物品掉落", "虛驚一場", "目前在防空避難所", "人沒事"];

// 輔助函式：產生範圍內的隨機小數
function getRandomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

// 輔助函式：從陣列中隨機抽出一句話
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

db.serialize(() => {
    // 【重要】為了加速大量寫入，必須開啟 Transaction (交易模式)
    // 這樣 1500 筆資料會在瞬間寫入完畢，否則 SQLite 預設每一筆都會做一次硬碟寫入，會非常慢。
    db.run("BEGIN TRANSACTION");

    const insertSQL = `
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
    const stmt = db.prepare(insertSQL);

    for (let i = 1; i <= TOTAL_RECORDS; i++) {
        // 生成流水號裝置 ID，例如: user_sim_00001
        const deviceId = `user_sim_${i.toString().padStart(5, '0')}`;

        // 模擬災情比例：設定約 15% 的人處於危險狀態 (danger)，85% 安全 (safe)
        const isDanger = Math.random() < 0.15;
        const status = isDanger ? "danger" : "safe";
        const message = isDanger ? getRandomItem(dangerMessages) : getRandomItem(safeMessages);

        // 隨機生成經緯度
        const lat = getRandomInRange(LAT_MIN, LAT_MAX);
        const lon = getRandomInRange(LON_MIN, LON_MAX);

        stmt.run([earthquakeId, deviceId, status, lat, lon, message]);
    }

    stmt.finalize();

    // 提交 Transaction，正式將資料寫入資料庫
    db.run("COMMIT", (err) => {
        if (err) {
            console.error("寫入失敗:", err.message);
        } else {
            console.log(`✅ 成功大量寫入 ${TOTAL_RECORDS} 筆 921 模擬回報資料！`);
        }
        db.close();
    });
});