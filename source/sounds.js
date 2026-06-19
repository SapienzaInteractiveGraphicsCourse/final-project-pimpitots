// ─── Sound Management ─────────────────────────────────────────────────────────

let bgMusic;

// Web Audio API context + decoded buffers for sound effects
let audioCtx;
let hitBuffer      = null;
let ballHitBuffer  = null;
let ballWallBuffer = null;
let ballDropBuffer = null;

export function initSounds() {
  bgMusic              = new Audio('../sounds/background.mp3');
  bgMusic.loop         = true;
  bgMusic.volume       = 0.15;
  bgMusic.playbackRate = 1.0;

  audioCtx = new AudioContext();

  fetch('../sounds/hitEffect.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { hitBuffer = decoded; })
    .catch(() => {});

  fetch('../sounds/ballHit.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { ballHitBuffer = decoded; })
    .catch(() => {});

  fetch('../sounds/ballWall.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { ballWallBuffer = decoded; })
    .catch(() => {});

  fetch('../sounds/ballDrop.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { ballDropBuffer = decoded; })
    .catch(() => {});
}

export function startBgMusic() {
  if (!bgMusic || !bgMusic.paused) return;
  bgMusic.play().catch(() => {
    const resume = () => { bgMusic.play().catch(() => {}); };
    document.addEventListener('pointerdown', resume, { once: true });
  });
}

export function stopBgMusic() {
  if (!bgMusic) return;
  bgMusic.pause();
  bgMusic.currentTime  = 0;
  bgMusic.playbackRate = 1.0;
}

export function setMusicRate(rate) {
  if (!bgMusic) return;
  bgMusic.playbackRate = rate;
}

export function setMusicDifficulty(diff) {
  setMusicRate(diff === 'insane' ? 1.4 : 1.0);
}

function _playBuffer(buffer, speed) {
  if (!buffer || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const gain = audioCtx.createGain();
  gain.gain.value = Math.min(1.0, Math.max(0.05, speed / 8.0));
  gain.connect(audioCtx.destination);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(gain);
  src.start();
}

export function playBallHitSound(speed)  { _playBuffer(ballHitBuffer,  speed); }
export function playBallWallSound(speed) { _playBuffer(ballWallBuffer, speed); }
export function playBallDropSound()      { _playBuffer(ballDropBuffer, 8); }

export function playHitSound(power, maxPower) {
  if (!hitBuffer || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const gain = audioCtx.createGain();
  gain.gain.value = Math.max(0.15, power / maxPower);
  gain.connect(audioCtx.destination);
  const src = audioCtx.createBufferSource();
  src.buffer = hitBuffer;
  src.connect(gain);
  src.start();
}
