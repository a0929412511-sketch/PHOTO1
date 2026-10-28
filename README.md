# 手勢偵測

以 Flask 提供網站與健康檢查，並在使用者瀏覽器透過 MediaPipe Tasks Vision 偵測手部關鍵點，控制圖片相簿。攝影機影像不會上傳到伺服器。

## 相簿與操作

- 左側啟動攝影機並顯示手部骨架提示，右側顯示目前相片。
- 手掌向左：上一張；手掌向右：下一張。
- 單獨伸出食指：第一張；單獨伸出小指：最後一張。
- 手心與手背翻轉：展示圖片左右翻轉；雙手同時比讚：回到第一頁。
- 張開手掌連續左右招手：圖片上出現閃電動畫。
- 握拳後在短時間內再張開手掌：放大／還原圖片。
- 可使用「第一張 / 上一張 / 下一張 / 最後一張」按鈕、縮圖或鍵盤左右鍵輔助操作。
- 圖庫會自動讀取 `img/` 中符合 `00-1-故事標題.png` 格式的 PNG，按章節及張數排序；新增圖檔後重新整理即可載入，不必修改 JavaScript 清單。頭像素材位於 `static/gallery/avatar.png`。

## 本機啟動

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
flask --app main run --debug
```

開啟 http://127.0.0.1:5000。瀏覽器需允許攝影機權限。模型與 WASM 執行檔由 jsDelivr 載入，模型檔由 Google Cloud Storage 載入，因此首次使用需要網路連線。

## Render 部署

將專案推送至 GitHub，在 Render 建立 Blueprint 並選取此 repo 的 `render.yaml`。Render 依 `requirements.txt` 安裝套件，並以 Gunicorn 啟動 Flask；Render 網址提供 HTTPS，讓瀏覽器可以使用攝影機。健康檢查端點為 `/health`。

## MVP 規劃流程

1. 確認需求：支援桌面及手機瀏覽器，第一版先偵測手部與 21 個關鍵點。
2. 建置介面：攝影機啟停、即時預覽、狀態提示及手部骨架疊圖。
3. 接入辨識：使用 MediaPipe Hand Landmarker 在瀏覽器本機推論，避免影像上傳及伺服器 GPU 費用。
4. 驗收體驗：確認攝影機權限拒絕/允許、無手/一手/雙手、手機直向畫面與停止後釋放攝影機。
5. 部署 Render：推送 GitHub、建立 Blueprint、檢查 HTTPS 首頁與 `/health`。
6. 後續擴充：以關鍵點規則或自訂模型加入手勢分類（如比讚、比 OK、揮手），再做跨裝置測試與效能調校。

## 套件安裝清單

Python 伺服器套件（`requirements.txt`）：

- `Flask==3.1.3`：網站路由與健康檢查 API
- `gunicorn==26.2.0`：Render 上的 WSGI 網頁伺服器

瀏覽器端套件由 CDN ES module 載入，無需 npm 建置：

- `@mediapipe/tasks-vision@0.10.34`：手部關鍵點偵測與 WASM 執行環境
- Hand Landmarker 模型檔：從 Google Cloud Storage 載入

本機及 Render 安裝指令：`python -m pip install -r requirements.txt`（Render Blueprint 使用 `pip install -r requirements.txt`）。套件版本已確認為 PyPI 發佈版本，專案以 `main.py` 作為 Flask 應用程式入口，不需另外建置 Python 套件。
