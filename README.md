# 震守相助 (QuakeGuardian) - Backend Server 🖧

> 「震守相助」行動應用系統的核心通訊與資料交換伺服器。基於 Node.js 與 WebSocket 技術打造，提供極低延遲的雙向通訊、即時災情廣播與地震模擬推播功能。

## 📖 系統簡介
本專案為「震守相助」系統的後端服務。它主要負責扮演三個關鍵角色：
1. **地震預警廣播中心**：發送模擬地震參數，觸發 App 端的邊緣運算（倒數與震度推估）。
2. **災情數據匯流排**：接收來自四面八方的使用者一鍵安危回報（免登入機制）。
3. **即時地圖同步引擎**：將最新的災情點位廣播給所有連線中的使用者，確保資訊同步。

---

## 🛠️ 技術棧 (Tech Stack)

* **Runtime**: Node.js (v18+)
* **WebSocket**: `ws` (提供全雙工、低延遲連線)
* **Database**: `sqlite3` (輕量級資料持久化)

---

## 🚀 系統部署與啟動

### 1. 安裝依賴套件
請確保您的開發環境已安裝 Node.js，接著在終端機進入伺服器目錄，執行：
```bash
npm install ws sqlite3
```

### 2. 啟動伺服器
```bash
npm start
```
伺服器啟動後，將預設監聽 `ws://127.0.0.1:8080`，並自動於同目錄下建立或讀取 `reports.db` 作為資料庫。

---

## 📡 WebSocket 通訊協定 (API 規格)

Client 與 Server 之間的通訊皆採用 JSON 格式。以下為核心事件定義：

### 1. 連線歡迎訊息 (Server -> Client)
當 App 成功連線時，伺服器會主動發送當前狀態與最新的地震 ID。
```json
{
  "type": "welcome",
  "version": 1,
  "clientId": 1,
  "serverTime": "2026-06-12T02:45:02+08:00",
  "currentEarthquakeId": "eq_20260612_024500",
  "message": "已成功連線到地震模擬伺服器"
}
```

### 2. 使用者安危回報 (Client -> Server)
App 端免登入上傳使用者狀態。伺服器透過 `deviceId` 與 `earthquakeId` 進行資料庫 Upsert，防範重複寫入。
```json
{
  "type": "report_status",
  "earthquakeId": "eq_20260612_024500",
  "deviceId": "uuid-550e8400-e29b-41d4-a716",
  "status": "需要協助",  // 安全, 未知, 需要協助
  "latitude": 24.18,
  "longitude": 120.65,
  "message": "受困於房間內"
}
```

### 3. 請求/接收初始地圖資料 (Client <-> Server)
App 端請求某次地震的所有歷史回報紀錄。
**請求 (Client -> Server)**:
```json
{
  "type": "get_map_data",
  "earthquakeId": "eq_20260612_024500"
}
```
**回應 (Server -> Client)**:
```json
{
  "type": "map_data_init",
  "earthquakeId": "eq_20260612_024500",
  "data": [
    { /* 回報物件陣列 */ }
  ]
}
```

### 4. 即時災情地圖更新廣播 (Server -> All Clients)
當任一使用者更新狀態時，伺服器會即時廣播給所有連線者。
```json
{
  "type": "map_update",
  "data": {
    "earthquakeId": "eq_20260612_024500",
    "deviceId": "uuid-550e8400...",
    "status": "需要協助",
    "latitude": 24.18,
    "longitude": 120.65,
    "updateTime": "2026-06-12T02:46:00+08:00"
  }
}
```

---

## 💻 終端機指令介面 (CLI Commands)

伺服器運行期間，提供互動式命令列介面供管理者/開發者進行測試：

* `help`：顯示所有可用指令。
* `clients`：查看目前已連線的 App 數量。
* `quake`：發送預設的測試地震警報（台東縣近海）。
* `quake <地點> <緯度> <經度> <深度> <規模> <震度> <PGA>`：發送自訂地震模擬參數。
  * *範例 (921大地震模擬)*：`quake 南投縣集集鎮 23.85 120.82 8.0 7.3 7 989`
* `heartbeat`：手動發送心跳測試封包。
* `exit`：安全關閉資料庫連線並結束伺服器運行。

---

## 🗄️ 資料庫設計 (Database Schema)

採用 SQLite 建立單一資料表 `user_reports`。核心設計為使用 `UNIQUE(earthquake_id, device_id)` 作為複合唯一鍵。
配合 `INSERT ... ON CONFLICT` 語法，確保同一裝置在同一次地震事件中，無論點擊幾次回報，永遠只保留最新狀態，有效防止惡意刷頻與資料庫膨脹。

---

## ⚠️ 測試環境聲明
本伺服器專為開發測試與展示所設計。內建的推播系統皆為模擬數據，請勿將其公開部署於正式環境並發送可能引起恐慌之測試警報。
