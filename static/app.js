import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34";

const $ = (selector) => document.querySelector(selector);
const video = $("#camera");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const status = $("#status");
const badge = $("#badge");
const placeholder = $("#placeholder");
let photos = [];
let index = 0;
let stream;
let landmarker;
let running = false;
let lastVideoTime = -1;
let lastCommand = 0;
let anchorX = null;
let handOrientation = null;
let orientationCandidate = null;
let orientationCandidateAt = 0;
let thumbsUpLatched = false;
let flipEnabled = false;
let waveDirection = 0;
let waveExtremeX = null;
let waveLastX = null;
let waveTurns = 0;
let waveStartedAt = 0;
let lastWaveAt = 0;
let waveFeedbackUntil = 0;
let fistPrimed = false;
let fistAt = 0;
let zoomEnabled = false;
const movementThreshold = 0.18;
const cooldown = 900;

function showPhoto(nextIndex, feedback = true) {
  const oldIndex = index;
  index = Math.max(0, Math.min(photos.length - 1, nextIndex));
  const photo = photos[index];
  $("#photo").src = photo.src;
  $("#photo").alt = photo.alt;
  $("#photo-title").textContent = photo.title;
  $("#current").textContent = String(index + 1).padStart(2, "0");
  $("#total").textContent = String(photos.length).padStart(2, "0");
  document.querySelectorAll(".thumb").forEach((thumb, i) => thumb.classList.toggle("active", i === index));
  $("#previous").disabled = index === 0;
  $("#first").disabled = index === 0;
  $("#next").disabled = index === photos.length - 1;
  $("#last").disabled = index === photos.length - 1;
  if (feedback && (index !== oldIndex || nextIndex === index)) showPinkBubbles();
}

function showPinkBubbles() {
  const layer = $("#pink-bubbles");
  if (!layer) return;
  for (let i = 0; i < 9; i++) {
    const bubble = document.createElement("span");
    bubble.className = "pink-bubble";
    bubble.style.setProperty("--x", `${8 + Math.random() * 84}%`);
    bubble.style.setProperty("--size", `${9 + Math.random() * 16}px`);
    bubble.style.setProperty("--delay", `${Math.random() * 220}ms`);
    layer.append(bubble);
    bubble.addEventListener("animationend", () => bubble.remove(), { once: true });
  }
}

function showLightning() {
  const layer = $("#lightning-effects");
  if (!layer) return;
  layer.replaceChildren();
  for (const [x, y, scale, delay] of [[25, 22, 1, 0], [72, 34, 0.72, 120], [54, 67, 0.58, 230]]) {
    const bolt = document.createElement("span");
    bolt.className = "lightning-bolt";
    bolt.style.setProperty("--x", `${x}%`);
    bolt.style.setProperty("--y", `${y}%`);
    bolt.style.setProperty("--scale", scale);
    bolt.style.setProperty("--delay", `${delay}ms`);
    layer.append(bolt);
  }
  layer.classList.remove("active");
  void layer.offsetWidth;
  layer.classList.add("active");
  lastCommand = performance.now();
  waveFeedbackUntil = lastCommand + 1100;
  status.textContent = "招手偵測成功：閃電！";
  window.setTimeout(() => layer.classList.remove("active"), 1100);
}

function isOpenPalm(points) {
  return classifyPose(points).every(Boolean);
}

function isFist(points) {
  const fingersCurled = [8, 12, 16, 20].every((tip, i) => {
    const pip = [6, 10, 14, 18][i];
    return points[tip].y > points[pip].y - 0.005;
  });
  const thumbFolded = Math.hypot(points[4].x - points[17].x, points[4].y - points[17].y) < 0.22;
  return fingersCurled && thumbFolded;
}

function toggleImageZoom() {
  zoomEnabled = !zoomEnabled;
  $("#photo").classList.toggle("zoomed", zoomEnabled);
  showPinkBubbles();
  lastCommand = performance.now();
  status.textContent = zoomEnabled ? "握拳再展開：圖片已放大" : "握拳再展開：已恢復原尺寸";
}

function detectWave(points) {
  const openPalm = isOpenPalm(points);
  const now = performance.now();
  if (!openPalm) {
    waveDirection = 0;
    waveExtremeX = null;
    waveLastX = null;
    waveTurns = 0;
    waveStartedAt = 0;
    return false;
  }
  const x = (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5;
  if (!waveStartedAt || now - waveStartedAt > 3000) {
    waveStartedAt = now;
    waveExtremeX = x;
    waveLastX = x;
    waveDirection = 0;
    waveTurns = 0;
    return false;
  }
  if (waveExtremeX === null || waveLastX === null) { waveExtremeX = x; waveLastX = x; return false; }
  waveLastX = x;
  const turnDistance = 0.05;
  if (waveDirection === 0) {
    if (x > waveExtremeX + 0.045) { waveDirection = 1; waveExtremeX = x; }
    else if (x < waveExtremeX - 0.045) { waveDirection = -1; waveExtremeX = x; }
    return false;
  }
  if (waveDirection > 0) {
    if (x > waveExtremeX) waveExtremeX = x;
    else if (waveExtremeX - x >= turnDistance) { waveDirection = -1; waveExtremeX = x; waveTurns++; }
  } else {
    if (x < waveExtremeX) waveExtremeX = x;
    else if (x - waveExtremeX >= turnDistance) { waveDirection = 1; waveExtremeX = x; waveTurns++; }
  }
  if (waveTurns > 0) {
    waveFeedbackUntil = now + 700;
    status.textContent = `招手偵測中 ${waveTurns}/2`;
  }
  if (waveTurns >= 2 && now - lastWaveAt > 1200) {
    lastWaveAt = now;
    waveTurns = 0;
    waveDirection = 0;
    waveExtremeX = x;
    waveLastX = x;
    return true;
  }
  return false;
}

function buildThumbnails() {
  const holder = $("#thumbs");
  holder.replaceChildren();
  if (!photos.length) {
    $("#photo-title").textContent = "圖庫中沒有可展示的圖片";
    $("#status").textContent = "請確認 img 資料夾中有編號格式的 PNG 圖片。";
    $("#photo").hidden = true;
    return;
  }
  $("#photo").hidden = false;
  photos.forEach((photo, i) => {
    const button = document.createElement("button");
    button.className = "thumb";
    button.type = "button";
    button.setAttribute("aria-label", `顯示第 ${i + 1} 張：${photo.title}`);
    button.innerHTML = `<img src="${photo.src}" alt=""><span>${String(i + 1).padStart(2, "0")}</span>`;
    button.addEventListener("click", () => showPhoto(i));
    holder.append(button);
  });
  showPhoto(0, false);
}

function act(command) {
  const now = performance.now();
  if (now - lastCommand < cooldown) return false;
  lastCommand = now;
  if (command === "previous") { showPhoto(index - 1); status.textContent = "手勢：上一張"; }
  if (command === "next") { showPhoto(index + 1); status.textContent = "手勢：下一張"; }
  if (command === "first") { showPhoto(0); status.textContent = "手勢：回到第一張"; }
  if (command === "last") { showPhoto(photos.length - 1); status.textContent = "手勢：跳到最後一張"; }
  anchorX = null;
  return true;
}

function isThumbsUp(points) {
  const thumbRaised = points[4].y < points[2].y - 0.08;
  const otherFingersCurled = [8, 12, 16, 20].every((tip, i) => {
    const pip = [6, 10, 14, 18][i];
    return points[tip].y > points[pip].y - 0.015;
  });
  return thumbRaised && otherFingersCurled;
}

function updateImageFlip(worldPoints) {
  if (!worldPoints?.length) return;
  const wrist = worldPoints[0];
  const indexBase = worldPoints[5];
  const pinkyBase = worldPoints[17];
  const ax = indexBase.x - wrist.x;
  const ay = indexBase.y - wrist.y;
  const az = indexBase.z - wrist.z;
  const bx = pinkyBase.x - wrist.x;
  const by = pinkyBase.y - wrist.y;
  const bz = pinkyBase.z - wrist.z;
  const normalZ = ax * by - ay * bx;
  const magnitude = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz);
  if (!magnitude || Math.abs(normalZ / magnitude) < 0.16) return;
  const side = Math.sign(normalZ);
  if (handOrientation === null) {
    handOrientation = side;
    return;
  }
  if (side === handOrientation) {
    orientationCandidate = null;
    return;
  }
  if (orientationCandidate !== side) {
    orientationCandidate = side;
    orientationCandidateAt = performance.now();
    return;
  }
  if (performance.now() - orientationCandidateAt >= 350) {
    handOrientation = side;
    orientationCandidate = null;
    flipEnabled = !flipEnabled;
    $("#photo").classList.toggle("flipped", flipEnabled);
    showPinkBubbles();
    lastCommand = performance.now();
    status.textContent = flipEnabled ? "手心／手背翻轉：圖片已左右翻轉" : "手心／手背翻轉：圖片已恢復";
  }
}

function classifyPose(points) {
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];
  return fingerTips.map((tip, i) => points[tip].y < points[fingerPips[i]].y - 0.035);
}

function handleHand(points) {
  const [indexUp, middleUp, ringUp, pinkyUp] = classifyPose(points);
  const raisedCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  if (indexUp && !middleUp && !ringUp && !pinkyUp) { act("first"); return "食指：第一張"; }
  if (pinkyUp && !indexUp && !middleUp && !ringUp) { act("last"); return "小指：最後一張"; }

  // The preview is mirrored, so invert raw x movement to match the user's visible left/right.
  const palmX = (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5;
  if (anchorX === null) anchorX = palmX;
  const visibleMovement = anchorX - palmX;
  if (visibleMovement < -movementThreshold) { act("next"); return "手掌向右：下一張"; }
  if (visibleMovement > movementThreshold) { act("previous"); return "手掌向左：上一張"; }
  return "手掌移動左右切換";
}

async function startCamera() {
  $("#toggle").disabled = true;
  status.textContent = "正在載入手部辨識模型…";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm");
    const options = {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
      runningMode: "VIDEO", numHands: 2,
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: "GPU" } });
    } catch (gpuError) {
      console.warn("MediaPipe GPU initialization failed; retrying with CPU.", gpuError);
      landmarker = await HandLandmarker.createFromOptions(vision, options);
    }
    running = true;
    anchorX = null;
    handOrientation = null;
    orientationCandidate = null;
    thumbsUpLatched = false;
    waveDirection = 0;
    waveExtremeX = null;
    waveLastX = null;
    waveTurns = 0;
    waveStartedAt = 0;
    placeholder.hidden = true;
    $("#toggle").innerHTML = "◉ 停止攝影機";
    badge.textContent = "即時偵測中";
    status.textContent = "手掌向左/右移動切換圖片；單獨伸食指回第一張、伸小指到最後一張。";
    resizeCanvas();
    requestAnimationFrame(loop);
  } catch (error) {
    status.textContent = error.name === "NotAllowedError"
      ? "攝影機權限未開啟，請在網址列旁的網站設定中允許攝影機，然後重新啟動。"
      : error.name === "NotFoundError"
        ? "找不到攝影機。請連接攝影機後重新啟動。"
        : `啟動失敗：${error.message}（請確認網路可載入辨識模型，並查看瀏覽器網站權限）`;
    badge.textContent = "無法啟動";
    landmarker?.close();
    landmarker = undefined;
  } finally { $("#toggle").disabled = false; }
}

async function loadGallery() {
  try {
    const response = await fetch("/api/gallery");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    photos = await response.json();
    $("#total").textContent = String(photos.length).padStart(2, "0");
    buildThumbnails();
  } catch (error) {
    console.error("Unable to load gallery", error);
    $("#photo-title").textContent = "圖庫載入失敗";
    $("#status").textContent = "無法讀取圖庫，請重新整理頁面。";
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function loop() {
  if (!running || video.readyState < 2) { if (running) requestAnimationFrame(loop); return; }
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, performance.now());
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const hands = result.landmarks ?? [];
    const bothThumbsUp = hands.length >= 2 && isThumbsUp(hands[0]) && isThumbsUp(hands[1]);
    if (bothThumbsUp && !thumbsUpLatched) {
      thumbsUpLatched = act("first");
      status.textContent = "雙手比讚：回到第一頁";
    } else if (!bothThumbsUp) {
      thumbsUpLatched = false;
    }
    const hand = hands[0];
    if (hand) {
      drawHand(hand, rect.width, rect.height);
      updateImageFlip(result.worldLandmarks?.[0]);
      const now = performance.now();
      if (isFist(hand) && !fistPrimed) {
        fistPrimed = true;
        fistAt = now;
        lastCommand = now;
        status.textContent = "已偵測握拳，請在 2.5 秒內張開手掌放大圖片。";
      }
      let fistExpanded = false;
      if (isOpenPalm(hand) && fistPrimed && now - fistAt <= 2500) {
        fistPrimed = false;
        fistExpanded = true;
        toggleImageZoom();
      } else if (fistPrimed && now - fistAt > 2500) {
        fistPrimed = false;
      }
      if (!fistExpanded && detectWave(hand)) showLightning();
      if (!bothThumbsUp) {
        const hint = handleHand(hand);
        if (!fistPrimed && performance.now() > waveFeedbackUntil && performance.now() - lastCommand > 300) status.textContent = `已偵測到手掌 · ${hint}`;
      }
    } else {
      anchorX = null;
      handOrientation = null;
      orientationCandidate = null;
      waveDirection = 0;
      waveExtremeX = null;
      waveLastX = null;
      waveTurns = 0;
      waveStartedAt = 0;
      fistPrimed = false;
      status.textContent = "尚未偵測到手掌，請將手放入鏡頭畫面。";
    }
  }
  requestAnimationFrame(loop);
}

function drawHand(points, width, height) {
  const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f17d82";
  for (const [a,b] of links) { ctx.beginPath(); ctx.moveTo(points[a].x*width,points[a].y*height); ctx.lineTo(points[b].x*width,points[b].y*height); ctx.stroke(); }
  for (const point of points) { ctx.beginPath(); ctx.arc(point.x*width,point.y*height,3.5,0,Math.PI*2); ctx.fillStyle="#ffd16d"; ctx.fill(); }
}

function stopCamera() {
  running = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  video.srcObject = null;
  landmarker?.close();
  landmarker = undefined;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  placeholder.hidden = false;
  handOrientation = null;
  orientationCandidate = null;
  thumbsUpLatched = false;
  $("#toggle").innerHTML = "◉ 啟動攝影機";
  badge.textContent = "尚未啟動";
  status.textContent = "允許攝影機權限即可開始，或使用右側按鈕操作。";
}

$("#toggle").addEventListener("click", () => running ? stopCamera() : startCamera());
$("#previous").addEventListener("click", () => showPhoto(index - 1));
$("#next").addEventListener("click", () => showPhoto(index + 1));
$("#first").addEventListener("click", () => showPhoto(0));
$("#last").addEventListener("click", () => showPhoto(photos.length - 1));
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") showPhoto(index - 1);
  if (event.key === "ArrowRight") showPhoto(index + 1);
});
window.addEventListener("resize", resizeCanvas);
loadGallery();
