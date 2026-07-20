/* ============================================================
   NEXUS NODE — monitor
   Reads real session/device data. Gates the camera behind consent.
   Runs coco-ssd (object/person detection) and face-api.js (expression)
   on the live feed, and logs the dominant emotion to localStorage.
   ============================================================ */

(function () {
  const consentScreen = document.getElementById('consent-screen');
  const allowBtn = document.getElementById('consent-allow');
  const declineBtn = document.getElementById('consent-decline');
  const statusText = document.getElementById('status-text');
  const placeholder = document.getElementById('video-placeholder');
  const video = document.getElementById('webcam');
  const overlay = document.getElementById('overlay-canvas');
  const detectLog = document.getElementById('detect-log');

  const FACE_MODEL_SOURCES = [
    'https://justadudewhohacks.github.io/face-api.js/models',
    'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
  ];

  /* ---------------- session + device telemetry ---------------- */
  const loadedAt = new Date();
  document.getElementById('r-loadtime').textContent = loadedAt.toLocaleTimeString();

  function tickDuration() {
    const secs = Math.floor((Date.now() - loadedAt.getTime()) / 1000);
    const h = String(Math.floor(secs / 3600)).padStart(2, '0');
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    document.getElementById('r-duration').textContent = `${h}:${m}:${s}`;
  }
  setInterval(tickDuration, 1000);
  tickDuration();

  document.getElementById('r-screen').textContent = `${screen.width} × ${screen.height}`;
  document.getElementById('r-viewport').textContent = `${window.innerWidth} × ${window.innerHeight}`;
  document.getElementById('r-dpr').textContent = (window.devicePixelRatio || 1).toFixed(2) + 'x';
  document.getElementById('r-platform').textContent = navigator.platform || navigator.userAgentData?.platform || 'unknown';
  document.getElementById('r-cores').textContent = navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 'unreported';

  function setOnline() {
    document.getElementById('r-online').textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
  }
  setOnline();
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn) {
    document.getElementById('r-conn').textContent = `${conn.effectiveType || 'unknown'}`;
  }

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const setBattery = () => {
        document.getElementById('r-battery').textContent =
          `${Math.round(b.level * 100)}% ${b.charging ? '(charging)' : ''}`.trim();
      };
      setBattery();
      b.addEventListener('levelchange', setBattery);
      b.addEventListener('chargingchange', setBattery);
    }).catch(() => {});
  }

  /* ---------------- mouse trail ---------------- */
  const trailCanvas = document.getElementById('trail-canvas');
  const trailCtx = trailCanvas.getContext('2d');
  let trailPoints = [];

  function resizeTrail() {
    trailCanvas.width = trailCanvas.clientWidth;
    trailCanvas.height = trailCanvas.clientHeight;
  }
  window.addEventListener('resize', resizeTrail);
  resizeTrail();

  window.addEventListener('pointermove', (e) => {
    const rect = trailCanvas.getBoundingClientRect();
    const inBounds = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    trailPoints.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now(),
      inBounds
    });
    if (trailPoints.length > 200) trailPoints.shift();
  });

  function drawTrail() {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    const now = performance.now();
    trailPoints = trailPoints.filter(p => now - p.t < 3000);
    trailCtx.beginPath();
    let started = false;
    trailPoints.forEach((p) => {
      if (!p.inBounds) { started = false; return; }
      const age = (now - p.t) / 3000;
      trailCtx.globalAlpha = 1 - age;
      if (!started) { trailCtx.moveTo(p.x, p.y); started = true; }
      else trailCtx.lineTo(p.x, p.y);
    });
    trailCtx.strokeStyle = '#22D3EE';
    trailCtx.lineWidth = 1.5;
    trailCtx.stroke();
    trailCtx.globalAlpha = 1;
    requestAnimationFrame(drawTrail);
  }
  requestAnimationFrame(drawTrail);

  /* ---------------- consent + camera ---------------- */
  function logLine(text) {
    const row = document.createElement('div');
    row.innerHTML = `&gt; <span class="entry">${text}</span>`;
    detectLog.appendChild(row);
    detectLog.scrollTop = detectLog.scrollHeight;
  }

  declineBtn.addEventListener('click', () => {
    consentScreen.classList.add('hidden');
    statusText.textContent = 'OPTICAL ACCESS DECLINED';
    placeholder.textContent = 'Optical access declined. Device and browser telemetry only.';
    logLine('OPTICAL ACCESS DECLINED — profiling continues on device data only.');
    const heroEl = document.getElementById('hero-emotion');
    if (heroEl) {
      heroEl.textContent = 'NO OPTICAL DATA';
      heroEl.classList.remove('grad-text');
      document.getElementById('hero-conf').textContent = 'Optical access declined for this session.';
    }
  });

  allowBtn.addEventListener('click', async () => {
    consentScreen.classList.add('hidden');
    statusText.textContent = 'ACQUIRING FEED...';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
      video.srcObject = stream;
      video.hidden = false;
      overlay.hidden = false;
      placeholder.hidden = true;
      document.getElementById('scan-sweep').hidden = false;
      statusText.textContent = 'FEED ACTIVE';
      logLine('OPTICAL ACCESS GRANTED — loading detection models.');
      await video.play();
      startDetection();
    } catch (err) {
      statusText.textContent = 'SIGNAL LOST';
      placeholder.hidden = false;
      placeholder.textContent = 'Signal lost. Camera access failed or was blocked. Reconnect to continue.';
      logLine('SIGNAL LOST — camera access failed or was blocked.');
      const heroEl = document.getElementById('hero-emotion');
      if (heroEl) {
        heroEl.textContent = 'SIGNAL LOST';
        heroEl.classList.remove('grad-text');
        document.getElementById('hero-conf').textContent = 'Camera access failed or was blocked.';
      }
    }
  });

  /* ---------------- detection loop ---------------- */
  // coco-ssd and face-api run on their own independent timers rather than
  // chained inside one animation frame — chaining them was the reason
  // detection used to stall: each frame waited on both models in sequence.
  let lastCocoBoxes = [];
  let lastFaceBox = null;

  async function startDetection() {
    const octx = overlay.getContext('2d');

    function syncCanvasSize() {
      overlay.width = video.videoWidth || 480;
      overlay.height = video.videoHeight || 360;
    }
    video.addEventListener('loadedmetadata', syncCanvasSize);
    syncCanvasSize();

    let cocoModel = null;
    let faceReady = false;

    try {
      logLine('LOADING COCO-SSD — object and person detection.');
      cocoModel = await cocoSsd.load();
      logLine('COCO-SSD ONLINE.');
    } catch (e) {
      logLine('COCO-SSD FAILED TO LOAD — object detection unavailable this session.');
    }

    try {
      logLine('LOADING FACE-API — expression detection.');
      let lastErr = null;
      let loaded = false;
      for (const src of FACE_MODEL_SOURCES) {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(src);
          await faceapi.nets.faceExpressionNet.loadFromUri(src);
          loaded = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!loaded) throw lastErr || new Error('all model sources failed');
      faceReady = true;
      logLine('FACE-API ONLINE. Hold your face in frame, in reasonable light.');
      setHeroEmotion('SCANNING FOR A FACE', 'Face detected — reading in progress.', true);
    } catch (e) {
      logLine('FACE-API FAILED TO LOAD — expression detection unavailable this session.');
      const bars = document.getElementById('affect-bars');
      bars.innerHTML = '<p style="margin:0;color:var(--alert);font-size:0.8rem;">Signal lost. Expression model failed to load.</p>';
      setHeroEmotion('SIGNAL LOST', 'Expression model failed to load. Reconnect to try again.', false);
    }

    // ---- coco-ssd loop: every ~450ms, independent of render ----
    if (cocoModel) {
      const runCoco = async () => {
        if (video.readyState >= 2) {
          try {
            const predictions = await cocoModel.detect(video);
            lastCocoBoxes = predictions.filter(p => p.score >= 0.5);
            let humanCount = 0;
            const others = [];
            lastCocoBoxes.forEach((p) => {
              if (p.class === 'person') humanCount++; else others.push(p.class);
            });
            const summary = [
              humanCount ? `${humanCount} human${humanCount > 1 ? 's' : ''}` : null,
              ...[...new Set(others)]
            ].filter(Boolean).join(', ');
            setStatusLine(summary ? `SUBJECT DETECTED — ${summary}` : 'SCANNING — no known objects in frame.');
          } catch (e) { /* frame skipped, model still warming up */ }
        }
        setTimeout(runCoco, 450);
      };
      runCoco();
    }

    // ---- face-api loop: every ~280ms, independent of render ----
    let lastEmotionWrite = 0;
    let noFaceStreak = 0;
    if (faceReady) {
      const detectorOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
      const runFace = async () => {
        if (video.readyState >= 2) {
          try {
            const result = await faceapi
              .detectSingleFace(video, detectorOpts)
              .withFaceExpressions();
            if (result && result.expressions) {
              noFaceStreak = 0;
              lastFaceBox = result.detection.box;
              const sorted = Object.entries(result.expressions).sort((a, b) => b[1] - a[1]);
              updateAffectBars(result.expressions, sorted[0][0]);
              const [topEmotion, topScore] = sorted[0];
              setAffectLine(`Subject affect: ${topEmotion.toUpperCase()} (${Math.round(topScore * 100)}%)`);
              setHeroEmotion(topEmotion.toUpperCase(), `Reading live at ${Math.round(topScore * 100)}% confidence.`, true);
              const now = Date.now();
              if (now - lastEmotionWrite > 800 && topScore > 0.3) {
                localStorage.setItem('nexus_emotion', topEmotion);
                localStorage.setItem('nexus_emotion_confidence', String(Math.round(topScore * 100)));
                lastEmotionWrite = now;
              }
            } else {
              lastFaceBox = null;
              noFaceStreak++;
              if (noFaceStreak > 3) {
                setHeroEmotion('NO FACE IN FRAME', 'Center your face in the panel, in reasonable light.', false);
                setStatusChipNote('no face in frame');
              }
            }
          } catch (e) { /* frame skipped, model still warming up */ }
        }
        setTimeout(runFace, 280);
      };
      runFace();
    }

    // ---- render loop: just draws whatever the two loops last found ----
    function render() {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      lastCocoBoxes.forEach((p) => {
        drawBox(octx, p.bbox, `${p.class} ${Math.round(p.score * 100)}%`, '#22D3EE');
      });
      if (lastFaceBox) {
        const { x, y, width, height } = lastFaceBox;
        drawBox(octx, [x, y, width, height], 'FACE', '#A855F7');
      }
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }

  const AFFECT_ORDER = ['happy', 'surprised', 'neutral', 'sad', 'angry', 'fearful', 'disgusted'];
  function updateAffectBars(expressions, topKey) {
    const wrap = document.getElementById('affect-bars');
    let rows = wrap.querySelectorAll('.affect-bar-row');
    if (rows.length === 0) {
      wrap.innerHTML = AFFECT_ORDER.map((key) => `
        <div class="affect-bar-row" data-key="${key}">
          <span class="label">${key}</span>
          <span class="track"><span class="fill"></span></span>
          <span class="pct">0%</span>
        </div>`).join('');
      rows = wrap.querySelectorAll('.affect-bar-row');
    }
    rows.forEach((row) => {
      const key = row.dataset.key;
      const score = expressions[key] || 0;
      const pct = Math.round(score * 100);
      row.querySelector('.fill').style.width = pct + '%';
      row.querySelector('.pct').textContent = pct + '%';
      row.classList.toggle('top', key === topKey);
    });
  }

  function drawBox(ctx, bbox, label, color) {
    const [x, y, w, h] = bbox;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.font = '12px "IBM Plex Mono", monospace';
    const textW = ctx.measureText(label).width + 8;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y > 14 ? y - 16 : y, textW, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0A0A14';
    ctx.fillText(label, x + 4, y > 14 ? y - 4 : y + 12);
  }

  let lastHeroText = '';
  function setHeroEmotion(text, sub, isLive) {
    const heroEl = document.getElementById('hero-emotion');
    const confEl = document.getElementById('hero-conf');
    if (!heroEl) return;
    if (text !== lastHeroText) {
      heroEl.textContent = text;
      lastHeroText = text;
    }
    confEl.textContent = sub;
    heroEl.classList.toggle('grad-text', isLive);
  }

  let lastStatusEntry = '';
  function setStatusLine(text) {
    if (text === lastStatusEntry) return;
    lastStatusEntry = text;
    logLine(text);
  }
  let lastAffectEntry = '';
  function setAffectLine(text) {
    if (text === lastAffectEntry) return;
    lastAffectEntry = text;
    logLine(text);
  }
  let lastChipNote = '';
  function setStatusChipNote(text) {
    if (text === lastChipNote) return;
    lastChipNote = text;
  }
})();
