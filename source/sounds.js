// --- Sound Management ---

// Resolve the sounds directory relative to THIS module file so paths are
// correct regardless of whether the page is served via HTTP or opened via
// file://, and regardless of where index.html sits relative to source/.
const _soundsBase = new URL('../sounds/', import.meta.url).href;

let bgMusic;
let audioCtx;
let hitBuffer      = null;
let ballHitBuffer  = null;
let ballWallBuffer = null;
let ballDropBuffer = null;
let successBuffer  = null;
let failBuffer     = null;
let winBuffer          = null;
let errorBuffer        = null;
let heartBrokenBuffer  = null;
let clickBuffer        = null;

export function initSounds() {
  bgMusic              = new Audio(_soundsBase + 'background.mp3');
  bgMusic.loop         = true;
  bgMusic.volume       = 0.15;
  bgMusic.playbackRate = 1.0;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Pre-unlock: resume the AudioContext on the first user gesture so it is
  // already running by the time any sound effect needs to play.
  const _unlock = () => { if (audioCtx.state !== 'running') audioCtx.resume(); };
  document.addEventListener('pointerdown', _unlock, { once: true });
  document.addEventListener('keydown',     _unlock, { once: true });

  _loadBuffer('hitEffect.mp3').then(b => { hitBuffer      = b; });
  _loadBuffer('ballHit.mp3'  ).then(b => { ballHitBuffer  = b; });
  _loadBuffer('ballWall.mp3' ).then(b => { ballWallBuffer = b; });
  _loadBuffer('ballDrop.mp3' ).then(b => { ballDropBuffer = b; });
  _loadBuffer('success.mp3'  ).then(b => { successBuffer  = b; });
  _loadBuffer('fail.mp3'     ).then(b => { failBuffer     = b; });
  _loadBuffer('win.mp3'      ).then(b => { winBuffer      = b; });
  _loadBuffer('error.mp3'      ).then(b => { errorBuffer       = b; });
  _loadBuffer('heartBroken.mp3').then(b => { heartBrokenBuffer = b; });
  _loadBuffer('click.mp3'      ).then(b => { clickBuffer       = b; });
}

function _loadBuffer(filename) {
  return fetch(_soundsBase + filename)
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .catch(() => null);
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

// audioCtx.resume() is async - we must wait for it to resolve before calling
// src.start(), otherwise the sound plays into a suspended context and is lost.
function _playBuffer(buffer, speed) {
  if (!buffer || !audioCtx) return;
  const doPlay = () => {
    const gain = audioCtx.createGain();
    gain.gain.value = Math.min(1.0, Math.max(0.05, speed / 8.0));
    gain.connect(audioCtx.destination);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start();
  };
  if (audioCtx.state === 'running') {
    doPlay();
  } else {
    audioCtx.resume().then(doPlay).catch(() => {});
  }
}

export function playBallHitSound(speed)  { _playBuffer(ballHitBuffer,  speed); }
export function playBallWallSound(speed) { _playBuffer(ballWallBuffer, speed); }
export function playBallDropSound()      { _playBuffer(ballDropBuffer, 8); }
export function playErrorSound()         { _playBuffer(errorBuffer,    4); }
export function playSuccessSound()       { _playBuffer(successBuffer,  4); }
export function playFailSound()          { _playBuffer(failBuffer,     4); }
export function playWinSound()           { _playBuffer(winBuffer,        4); }
export function playHeartBrokenSound()   { _playBuffer(heartBrokenBuffer, 4); }
export function playClickSound()         { _playBuffer(clickBuffer,        4); }

export function playHitSound(power, maxPower) {
  if (!hitBuffer || !audioCtx) return;
  const gainVal = Math.max(0.15, power / maxPower);
  const doPlay = () => {
    const gain = audioCtx.createGain();
    gain.gain.value = gainVal;
    gain.connect(audioCtx.destination);
    const src = audioCtx.createBufferSource();
    src.buffer = hitBuffer;
    src.connect(gain);
    src.start();
  };
  if (audioCtx.state === 'running') {
    doPlay();
  } else {
    audioCtx.resume().then(doPlay).catch(() => {});
  }
}
