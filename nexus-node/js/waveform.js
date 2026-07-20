/* ============================================================
   NEXUS NODE — waveform strip
   Reads real cursor velocity and renders it as a live signal.
   state: "dormant" (violet, idle) or "signal" (green, active)
   ============================================================ */

(function () {
  const canvas = document.getElementById('nexus-wave');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = canvas.dataset.state || 'signal';
  const rootStyles = getComputedStyle(document.documentElement);
  const color = state === 'dormant'
    ? rootStyles.getPropertyValue('--dormant').trim()
    : rootStyles.getPropertyValue('--signal').trim();

  let width, height, dpr;
  let lastX = null, lastY = null, lastT = performance.now();
  let velocity = 0;       // smoothed cursor speed
  let targetVelocity = 0;
  let t = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (lastX !== null) {
      const dt = Math.max(now - lastT, 1);
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      targetVelocity = Math.min(dist / dt * 40, 60);
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
  });

  // idle decay: velocity relaxes back to a low baseline when the cursor stops
  setInterval(() => { targetVelocity *= 0.85; }, 60);

  function draw() {
    velocity += (targetVelocity - velocity) * 0.12;
    const baseline = state === 'dormant' ? 2.5 : 4;
    const amp = baseline + velocity * (state === 'dormant' ? 0.35 : 0.6);
    const freq = 0.025 + velocity * 0.0025;

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    const midY = height / 2;
    for (let x = 0; x <= width; x += 2) {
      const y = midY + Math.sin(x * freq + t) * amp
        + Math.sin(x * freq * 2.3 + t * 1.6) * (amp * 0.25);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.shadowColor = color;
    ctx.shadowBlur = state === 'dormant' ? 3 : 6;
    ctx.globalAlpha = 0.9;
    ctx.stroke();

    t += reduceMotion ? 0.02 : (0.04 + velocity * 0.0015);
    if (!reduceMotion) {
      requestAnimationFrame(draw);
    }
  }

  if (reduceMotion) {
    // draw a single static, still-truthful frame instead of looping
    draw();
  } else {
    requestAnimationFrame(draw);
  }
})();

/* ---------- shared nav toggle (mobile) ---------- */
(function () {
  const toggle = document.querySelector('.nav-toggle');
  const list = document.querySelector('.nexus-nav ul');
  if (!toggle || !list) return;
  toggle.addEventListener('click', () => {
    const isOpen = list.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
})();
