const sqlite3 = require("sqlite3").verbose();

// 連線到與 server.js 相同的資料庫
const db = new sqlite3.Database("reports.db", (err) => {
    if (err) {
        console.error("資料庫連線失敗:", err.message);
        process.exit(1);
    }
    console.log("已連線到資料庫，準備寫入 921 模擬資料...");
});

// 定義 921 大地震的專屬 ID
const earthquakeId = "eq_19990921_014712";

// 模擬使用者資料 (涵蓋南投、台中、彰化等災區)
// 狀態設定: "danger" (需要協助), "safe" (安全)
const mockReports = [
    { device_id: "user_nantou_01", status: "danger", lat: 23.83, lon: 120.78, message: "房屋倒塌，有人受困！" }, // 集集附近
    { device_id: "user_nantou_02", status: "safe", lat: 23.90, lon: 120.68, message: "已逃出室外，目前在空曠處。" }, // 南投市
    { device_id: "user_nantou_03", status: "danger", lat: 23.97, lon: 120.96, message: "道路中斷，急需救援物資。" }, // 埔里
    { device_id: "user_taichung_01", status: "danger", lat: 24.14, lon: 120.68, message: "大樓傾斜，無法下樓。" }, // 台中市區
    { device_id: "user_taichung_02", status: "safe", lat: 24.17, lon: 120.64, message: "全家平安，在公園避難中。" }, // 台中西屯
    { device_id: "user_taichung_03", status: "danger", lat: 24.06, lon: 120.69, message: "橋樑斷裂，有人受傷。" }, // 霧峰
    { device_id: "user_changhua_01", status: "safe", lat: 24.08, lon: 120.54, message: "晃得很大但人平安。" }, // 彰化市
    { device_id: "user_yunlin_01", status: "safe", lat: 23.70, lon: 120.54, message: "停電中，人員安全。" } // 雲林斗六
];

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

db.serialize(() => {
    const stmt = db.prepare(insertSQL);
    mockReports.forEach((report) => {
        stmt.run([
            earthquakeId,
            report.device_id,
            report.status,
            report.lat,
            report.lon,
            report.message
        ]);
    });
    stmt.finalize(() => {
        console.log(`成功寫入 ${mockReports.length} 筆 921 模擬回報資料！`);
        db.close();
    });
});