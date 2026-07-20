/* ============================================================
   NEXUS NODE — ambient background
   A quiet field of nodes and synapse lines behind every page.
   Pulses softly. Never competes with the waveform or content.
   ============================================================ */

(function () {
  const canvas = document.getElementById('ambient-bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, dpr, nodes;

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function buildNodes() {
    const area = w * h;
    const count = Math.max(18, Math.min(46, Math.round(area / 42000)));
    nodes = Array.from({ length: count }, () => ({
      x: rand(0, w),
      y: rand(0, h),
      vx: rand(-0.06, 0.06),
      vy: rand(-0.06, 0.06),
      r: rand(1, 2.2),
      phase: rand(0, Math.PI * 2)
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodes();
  }
  window.addEventListener('resize', resize);
  resize();

  const LINK_DIST = 150;

  function frame(t) {
    ctx.clearRect(0, 0, w, h);

    if (!reduceMotion) {
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < LINK_DIST) {
          ctx.strokeStyle = `rgba(0,245,160,${(1 - dist / LINK_DIST) * 0.10})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    nodes.forEach((n) => {
      const pulse = reduceMotion ? 0.5 : (Math.sin(t * 0.0006 + n.phase) + 1) / 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,245,160,${0.15 + pulse * 0.35})`;
      ctx.fill();
    });

    if (!reduceMotion) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
