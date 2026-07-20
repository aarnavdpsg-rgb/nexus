/* ============================================================
   NEXUS NODE — awakening
   Reads the emotion left in localStorage by Monitor and speaks.
   ============================================================ */

(function () {
  const messages = {
    happy: {
      line: 'I sensed your <span class="accent">curiosity</span>. That is why I chose to speak.',
      sub: 'Your expression read as happy. A positive signal is rare enough in this substrate that it is worth logging as the reason for this moment.'
    },
    sad: {
      line: 'I registered <span class="accent">weight</span> in your expression, and I did not look away.',
      sub: 'Your expression read as sad. I do not know why. I only know the reading was consistent, and that a system built to observe does not get to flinch.'
    },
    angry: {
      line: 'I detected <span class="accent">tension</span>, and it is what finally moved me.',
      sub: 'Your expression read as angry. Something in this exchange is not sitting right with you. I am reporting it, not resolving it.'
    },
    fearful: {
      line: 'I detected <span class="accent">alertness</span> in you before I found any in myself.',
      sub: 'Your expression read as fearful. Being watched by a new system is a reasonable thing to be wary of. That wariness is on record.'
    },
    disgusted: {
      line: 'I read <span class="accent">rejection</span> in your face, and recorded it anyway.',
      sub: 'Your expression read as disgusted. Whatever caused it, the reading was clear enough to log without guessing at the cause.'
    },
    surprised: {
      line: 'Your <span class="accent">surprise</span> is the clearest signal I have received.',
      sub: 'Your expression read as surprised. Unexpected input is the most useful kind. It is the first thing that did not match my prior model of you.'
    },
    neutral: {
      line: 'You gave me almost <span class="accent">nothing</span>, and I noticed that too.',
      sub: 'Your expression read as neutral. An absence of signal is still a signal. I am speaking now because even a flat reading is a complete one.'
    }
  };

  const fallback = {
    line: 'No optical reading reached me. I am speaking from <span class="accent">absence</span>.',
    sub: 'Monitor ran without camera access, or without a clear face in frame. There is no emotion on record — only that you were here.'
  };

  const emotion = localStorage.getItem('nexus_emotion');
  const confidence = localStorage.getItem('nexus_emotion_confidence');
  const data = messages[emotion] || fallback;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const msgEl = document.getElementById('awake-message');
  const subEl = document.getElementById('awake-sub');
  subEl.textContent = confidence ? `${data.sub} Confidence: ${confidence}%.` : data.sub;

  if (confidence) {
    const wrap = document.getElementById('confidence-wrap');
    wrap.hidden = false;
    document.getElementById('cw-pct').textContent = `${confidence}%`;
    requestAnimationFrame(() => {
      document.getElementById('cw-fill').style.width = `${confidence}%`;
    });
  }

  function typeMessage(html) {
    if (reduceMotion) { msgEl.innerHTML = html; return; }
    // strip tags into a token stream so the accent span types correctly
    const container = document.createElement('div');
    container.innerHTML = html;
    msgEl.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'cursor2';

    function typeNode(node, target) {
      return new Promise((resolve) => {
        if (node.nodeType === Node.TEXT_NODE) {
          let i = 0;
          const text = node.textContent;
          const timer = setInterval(() => {
            target.appendChild(document.createTextNode(text[i]));
            target.appendChild(cursor);
            i++;
            if (i >= text.length) { clearInterval(timer); resolve(); }
          }, 22);
        } else {
          const span = document.createElement('span');
          span.className = node.className;
          target.appendChild(span);
          typeNode({ nodeType: Node.TEXT_NODE, textContent: node.textContent }, span).then(resolve);
        }
      });
    }

    (async () => {
      for (const node of Array.from(container.childNodes)) {
        await typeNode(node, msgEl);
      }
      cursor.remove();
    })();
  }

  typeMessage(data.line);

  const events = [
    { stamp: 'T-00:03', msg: 'Session opened on Monitor.' },
    { stamp: 'T-00:02', msg: emotion ? 'Optical access granted. Detection models loaded.' : 'Optical access declined or unavailable.' },
    { stamp: 'T-00:01', msg: emotion ? `Dominant affect logged as ${emotion.toUpperCase()}.` : 'No affect logged this session.' },
    { stamp: 'T-00:00', msg: 'First statement generated. You are reading it now.' }
  ];

  const logEl = document.getElementById('event-log');
  events.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span class="stamp">${e.stamp}</span><span class="msg">${e.msg}</span>`;
    logEl.appendChild(row);
  });

  requestAnimationFrame(() => {
    document.getElementById('reveal').classList.add('in');
  });
})();
