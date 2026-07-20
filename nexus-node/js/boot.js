/* ============================================================
   NEXUS NODE — boot sequence
   Terminal-style typing, then a climb to 100%, then entry.
   ============================================================ */

(function () {
  const log = document.getElementById('boot-log');
  const barFill = document.getElementById('bar-fill');
  const barPct = document.getElementById('bar-pct');
  const enterWrap = document.getElementById('enter-wrap');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lines = [
    'INITIALIZING NEXUS NODE...',
    'LOADING NEURAL SUBSTRATE...',
    'CALIBRATING OPTICAL SENSORS...',
    'SCANNING FOR A VISITOR...',
    'TARGET ACQUIRED.'
  ];

  function typeLine(text, el) {
    return new Promise((resolve) => {
      if (reduceMotion) {
        el.textContent = text;
        resolve();
        return;
      }
      let i = 0;
      const speed = 18;
      const timer = setInterval(() => {
        el.textContent = text.slice(0, i);
        i++;
        if (i > text.length) {
          clearInterval(timer);
          resolve();
        }
      }, speed);
    });
  }

  async function runBoot() {
    for (const line of lines) {
      const row = document.createElement('div');
      row.className = line === lines[lines.length - 1] ? '' : 'line-dim';
      log.appendChild(row);
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      row.appendChild(document.createTextNode(''));
      row.appendChild(cursor);
      await typeLine(line, row);
      row.removeChild(row.lastChild);
      await wait(reduceMotion ? 0 : 120);
    }
    animateBar();
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function animateBar() {
    if (reduceMotion) {
      barFill.style.width = '100%';
      barPct.textContent = '100%';
      finish();
      return;
    }
    let pct = 0;
    const timer = setInterval(() => {
      pct += Math.random() * 9 + 3;
      if (pct >= 100) {
        pct = 100;
        clearInterval(timer);
        finish();
      }
      barFill.style.width = pct + '%';
      barPct.textContent = Math.floor(pct) + '%';
    }, 90);
  }

  function finish() {
    enterWrap.classList.add('ready');
    enterWrap.querySelector('a').focus();
  }

  runBoot();
})();
