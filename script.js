const TURN_LENGTH = 20;
const CARD_COUNT = 12;
const CARD_BACK_IMAGE = "./assets/cards/Back.png";
const SOUND_VOLUME_MULTIPLIER = 12;
const CARD_FACE_IMAGES = [
  "./assets/cards/Front 1.png",
  "./assets/cards/Front 2.png",
  "./assets/cards/Front 3.png",
  "./assets/cards/Front 4.png",
  "./assets/cards/Front 5.png",
  "./assets/cards/Front 6.png",
];

const state = {
  timer: TURN_LENGTH,
  timerHandle: null,
  flipBackHandle: null,
  endOverlayHandle: null,
  musicHandle: null,
  musicMode: null,
  musicPhraseIndex: 0,
  cards: [],
  flippedIds: [],
  lockBoard: false,
  finished: false,
  started: false,
};

const gameBoard = document.querySelector("#game-board");
const timerLabel = document.querySelector("#timer");
const cardTemplate = document.querySelector("#card-template");
const timerRing = document.querySelector(".timer-bar");
const gameOverlay = document.querySelector("#game-overlay");
const overlayLogo = document.querySelector("#overlay-logo");
const overlayMessage = document.querySelector("#overlay-message");
const overlayInstructions = document.querySelector("#overlay-instructions");
const overlayButton = document.querySelector("#overlay-button");
let audioContext;

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function createDeck(cardCount) {
  const pairCount = cardCount / 2;
  const images = shuffle(CARD_FACE_IMAGES).slice(0, pairCount);
  const deck = images.flatMap((image, pairIndex) => [
    { id: `${pairIndex}-a`, pairId: image, image, matched: false, justMatched: false },
    { id: `${pairIndex}-b`, pairId: image, image, matched: false, justMatched: false },
  ]);

  return shuffle(deck);
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function playTone({
  frequency,
  duration,
  type = "sine",
  volume = 0.04,
  attack = 0.005,
  release = 0.08,
  detune = 0,
  startAt = 0,
}) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + startAt;
  const end = start + duration;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const filterNode = context.createBiquadFilter();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.detune.setValueAtTime(detune, start);
  filterNode.type = "lowpass";
  filterNode.frequency.setValueAtTime(2400, start);
  filterNode.Q.setValueAtTime(0.8, start);
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(
    Math.min(volume * SOUND_VOLUME_MULTIPLIER, 0.7),
    start + attack
  );
  gainNode.gain.exponentialRampToValueAtTime(0.0001, end + release);

  oscillator.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + release);
}

function playFlipSound() {
  playTone({ frequency: 720, duration: 0.04, type: "triangle", volume: 0.02, release: 0.05 });
  playTone({ frequency: 960, duration: 0.03, type: "sine", volume: 0.014, release: 0.04, startAt: 0.015 });
}

function playMatchSound() {
  playTone({ frequency: 660, duration: 0.09, type: "sine", volume: 0.035, release: 0.08 });
  playTone({ frequency: 990, duration: 0.12, type: "triangle", volume: 0.026, release: 0.1, startAt: 0.06 });
  playTone({ frequency: 1320, duration: 0.09, type: "sine", volume: 0.018, release: 0.08, startAt: 0.09 });
}

function playMismatchSound() {
  playTone({ frequency: 320, duration: 0.06, type: "triangle", volume: 0.022, release: 0.06 });
  playTone({ frequency: 240, duration: 0.09, type: "sine", volume: 0.018, release: 0.08, startAt: 0.045 });
}

function playStartSound() {
  playTone({ frequency: 392, duration: 0.1, type: "sine", volume: 0.022, release: 0.08 });
  playTone({ frequency: 523.25, duration: 0.12, type: "triangle", volume: 0.022, release: 0.1, startAt: 0.07 });
  playTone({ frequency: 659.25, duration: 0.14, type: "sine", volume: 0.018, release: 0.12, startAt: 0.13 });
}

function playTimesUpSound() {
  playTone({ frequency: 523.25, duration: 0.08, type: "triangle", volume: 0.02, release: 0.08 });
  playTone({ frequency: 392, duration: 0.1, type: "triangle", volume: 0.024, release: 0.1, startAt: 0.08 });
  playTone({ frequency: 261.63, duration: 0.16, type: "sine", volume: 0.02, release: 0.14, startAt: 0.16 });
}

function playVictoryJingle() {
  playTone({ frequency: 523.25, duration: 0.08, type: "triangle", volume: 0.028, release: 0.08 });
  playTone({ frequency: 659.25, duration: 0.1, type: "triangle", volume: 0.03, release: 0.09, startAt: 0.09 });
  playTone({ frequency: 783.99, duration: 0.1, type: "sine", volume: 0.032, release: 0.1, startAt: 0.18 });
  playTone({ frequency: 1046.5, duration: 0.2, type: "sine", volume: 0.034, release: 0.14, startAt: 0.3 });
  playTone({ frequency: 1318.51, duration: 0.18, type: "triangle", volume: 0.024, release: 0.12, startAt: 0.34 });
  playTone({ frequency: 1174.66, duration: 0.15, type: "triangle", volume: 0.026, release: 0.11, startAt: 0.52 });
  playTone({ frequency: 1318.51, duration: 0.16, type: "sine", volume: 0.028, release: 0.12, startAt: 0.64 });
  playTone({ frequency: 1567.98, duration: 0.18, type: "triangle", volume: 0.03, release: 0.14, startAt: 0.78 });
  playTone({ frequency: 2093, duration: 0.34, type: "sine", volume: 0.034, release: 0.18, startAt: 0.96 });
  playTone({ frequency: 2637.02, duration: 0.28, type: "triangle", volume: 0.02, release: 0.16, startAt: 1.04 });
}

function playCountdownTick(secondsRemaining) {
  if (secondsRemaining <= 0 || secondsRemaining > 5) {
    return;
  }

  const urgencyStep = 6 - secondsRemaining;
  const baseFrequency = 640 + urgencyStep * 55;

  playTone({
    frequency: baseFrequency,
    duration: 0.05,
    type: "square",
    volume: 0.018 + urgencyStep * 0.003,
    release: 0.05,
  });
  playTone({
    frequency: baseFrequency + 170,
    duration: 0.035,
    type: "triangle",
    volume: 0.012 + urgencyStep * 0.002,
    release: 0.04,
    startAt: 0.045,
  });
}

function playBackgroundMusicLoop(mode) {
  if (!state.started || state.finished) {
    return;
  }

  const phraseIndex = state.musicPhraseIndex;
  state.musicPhraseIndex += 1;

  if (mode === "urgent") {
    // Driving syncopated pulse (Am <-> E) for the final seconds.
    if (phraseIndex % 2 === 0) {
      playTone({ frequency: 110, duration: 0.7, type: "triangle", volume: 0.011, release: 0.12 });
      playTone({ frequency: 440, duration: 0.08, type: "sine", volume: 0.0108, release: 0.06 });
      playTone({ frequency: 659.25, duration: 0.08, type: "sine", volume: 0.0102, release: 0.06, startAt: 0.14 });
      playTone({ frequency: 880, duration: 0.08, type: "sine", volume: 0.0112, release: 0.06, startAt: 0.28 });
      playTone({ frequency: 659.25, duration: 0.08, type: "sine", volume: 0.0102, release: 0.06, startAt: 0.42 });
      playTone({ frequency: 880, duration: 0.08, type: "sine", volume: 0.0108, release: 0.06, startAt: 0.56 });
      playTone({ frequency: 1046.5, duration: 0.12, type: "triangle", volume: 0.0115, release: 0.08, startAt: 0.7 });
    } else {
      playTone({ frequency: 123.47, duration: 0.7, type: "triangle", volume: 0.0112, release: 0.12 });
      playTone({ frequency: 493.88, duration: 0.08, type: "sine", volume: 0.0108, release: 0.06 });
      playTone({ frequency: 739.99, duration: 0.08, type: "sine", volume: 0.0102, release: 0.06, startAt: 0.14 });
      playTone({ frequency: 987.77, duration: 0.08, type: "sine", volume: 0.0112, release: 0.06, startAt: 0.28 });
      playTone({ frequency: 739.99, duration: 0.08, type: "sine", volume: 0.0102, release: 0.06, startAt: 0.42 });
      playTone({ frequency: 987.77, duration: 0.08, type: "sine", volume: 0.0108, release: 0.06, startAt: 0.56 });
      playTone({ frequency: 1174.66, duration: 0.12, type: "triangle", volume: 0.0115, release: 0.08, startAt: 0.7 });
    }

    state.musicHandle = window.setTimeout(() => {
      playBackgroundMusicLoop(mode);
    }, 860);
    return;
  }

  // Warm, upbeat I-V-vi-IV loop (C - G - Am - F) with a gentle melodic hook.
  if (phraseIndex % 4 === 0) {
    // C major
    playTone({ frequency: 130.81, duration: 0.5, type: "triangle", volume: 0.0088, release: 0.18 });
    playTone({ frequency: 392, duration: 0.26, type: "sine", volume: 0.0074, release: 0.16, startAt: 0.06 });
    playTone({ frequency: 523.25, duration: 0.26, type: "sine", volume: 0.0078, release: 0.16, startAt: 0.52 });
    playTone({ frequency: 659.25, duration: 0.26, type: "sine", volume: 0.0076, release: 0.16, startAt: 0.98 });
    playTone({ frequency: 523.25, duration: 0.32, type: "sine", volume: 0.0078, release: 0.2, startAt: 1.44 });
  } else if (phraseIndex % 4 === 1) {
    // G major
    playTone({ frequency: 98, duration: 0.5, type: "triangle", volume: 0.0088, release: 0.18 });
    playTone({ frequency: 391.99, duration: 0.26, type: "sine", volume: 0.0074, release: 0.16, startAt: 0.06 });
    playTone({ frequency: 493.88, duration: 0.26, type: "sine", volume: 0.0078, release: 0.16, startAt: 0.52 });
    playTone({ frequency: 587.33, duration: 0.26, type: "sine", volume: 0.0076, release: 0.16, startAt: 0.98 });
    playTone({ frequency: 493.88, duration: 0.32, type: "sine", volume: 0.0078, release: 0.2, startAt: 1.44 });
  } else if (phraseIndex % 4 === 2) {
    // A minor
    playTone({ frequency: 110, duration: 0.5, type: "triangle", volume: 0.009, release: 0.18 });
    playTone({ frequency: 329.63, duration: 0.26, type: "sine", volume: 0.0074, release: 0.16, startAt: 0.06 });
    playTone({ frequency: 440, duration: 0.26, type: "sine", volume: 0.0078, release: 0.16, startAt: 0.52 });
    playTone({ frequency: 523.25, duration: 0.26, type: "sine", volume: 0.0076, release: 0.16, startAt: 0.98 });
    playTone({ frequency: 659.25, duration: 0.32, type: "sine", volume: 0.008, release: 0.2, startAt: 1.44 });
  } else {
    // F major
    playTone({ frequency: 87.31, duration: 0.5, type: "triangle", volume: 0.0088, release: 0.18 });
    playTone({ frequency: 349.23, duration: 0.26, type: "sine", volume: 0.0074, release: 0.16, startAt: 0.06 });
    playTone({ frequency: 440, duration: 0.26, type: "sine", volume: 0.0078, release: 0.16, startAt: 0.52 });
    playTone({ frequency: 523.25, duration: 0.26, type: "sine", volume: 0.0076, release: 0.16, startAt: 0.98 });
    playTone({ frequency: 698.46, duration: 0.32, type: "sine", volume: 0.008, release: 0.2, startAt: 1.44 });
  }

  state.musicHandle = window.setTimeout(() => {
    playBackgroundMusicLoop(mode);
  }, 1960);
}

function stopBackgroundMusic() {
  window.clearTimeout(state.musicHandle);
  state.musicHandle = null;
  state.musicMode = null;
  state.musicPhraseIndex = 0;
}

function setBackgroundMusic(mode) {
  if (!state.started || state.finished) {
    return;
  }

  if (state.musicMode === mode && state.musicHandle) {
    return;
  }

  stopBackgroundMusic();
  state.musicMode = mode;
  playBackgroundMusicLoop(mode);
}

function startTimer() {
  window.clearInterval(state.timerHandle);
  state.timer = TURN_LENGTH;
  updateTimer();

  state.timerHandle = window.setInterval(() => {
    if (state.finished) {
      return;
    }

    state.timer -= 1;
    updateTimer();

    if (state.timer <= 0) {
      stopBackgroundMusic();
      playTimesUpSound();
      finishGame("Time's up.");
      return;
    }

    if (state.timer <= 5) {
      setBackgroundMusic("urgent");
    }

    playCountdownTick(state.timer);
  }, 1000);
}

function updateTimer() {
  timerLabel.textContent = String(state.timer);
  const progress = `${(state.timer / TURN_LENGTH) * 100}%`;
  timerRing.style.setProperty("--timer-progress", progress);
}

function renderBoard() {
  gameBoard.innerHTML = "";
  gameBoard.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";

  state.cards.forEach((card) => {
    const fragment = cardTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".memory-card");
    const frontFace = fragment.querySelector(".card-front");
    const backFace = fragment.querySelector(".card-back");

    button.dataset.id = card.id;
    frontFace.style.backgroundImage = `url("${CARD_BACK_IMAGE}")`;
    backFace.style.backgroundImage = `url("${card.image}")`;

    if (card.matched) {
      button.classList.add("flipped", "matched");
      button.disabled = true;
    }

    if (card.justMatched) {
      button.classList.add("celebrate");
    }

    if (state.flippedIds.includes(card.id)) {
      button.classList.add("flipped");
    }

    gameBoard.appendChild(fragment);
  });
}

function updateStatus() {
  renderBoard();
}

function showOverlay(buttonLabel, message = "") {
  window.clearTimeout(state.endOverlayHandle);
  overlayMessage.textContent = message;
  overlayMessage.hidden = !message;
  overlayLogo.hidden = Boolean(message);
  overlayInstructions.hidden = Boolean(message);
  overlayButton.textContent = buttonLabel;
  gameOverlay.classList.remove("hidden");
}

function hideOverlay() {
  gameOverlay.classList.add("hidden");
}

function showIntroOverlay() {
  resetBoard();
  showOverlay("Start");
}

function resetBoard() {
  state.cards = createDeck(CARD_COUNT);
  state.flippedIds = [];
  state.lockBoard = false;
  state.finished = false;
  state.started = false;
  state.timer = TURN_LENGTH;
  window.clearInterval(state.timerHandle);
  window.clearTimeout(state.flipBackHandle);
  window.clearTimeout(state.endOverlayHandle);
  stopBackgroundMusic();
  updateTimer();
  updateStatus();
}

function buildEndMessage(matchedPairs) {
  const totalPairs = CARD_COUNT / 2;
  const pairLabel = matchedPairs === 1 ? "pair" : "pairs";

  if (matchedPairs === totalPairs) {
    return `Well done! You matched all ${totalPairs} pairs.`;
  }

  return `You've matched ${matchedPairs} ${pairLabel}. Thanks for playing!`;
}

function finishGame(reason = "Nice run.") {
  state.finished = true;
  state.started = false;
  window.clearInterval(state.timerHandle);
  window.clearTimeout(state.flipBackHandle);
  stopBackgroundMusic();
  const matchedPairs = state.cards.filter((card) => card.matched).length / 2;
  showOverlay("Play Again", buildEndMessage(matchedPairs));
  state.endOverlayHandle = window.setTimeout(() => {
    resetBoard();
    showOverlay("Start");
  }, 5000);
}

function checkForMatch() {
  const [firstId, secondId] = state.flippedIds;
  const firstCard = state.cards.find((card) => card.id === firstId);
  const secondCard = state.cards.find((card) => card.id === secondId);

  if (firstCard.pairId === secondCard.pairId) {
    playMatchSound();
    firstCard.matched = true;
    secondCard.matched = true;
    firstCard.justMatched = true;
    secondCard.justMatched = true;
    state.flippedIds = [];
    state.lockBoard = false;

    updateStatus();
    firstCard.justMatched = false;
    secondCard.justMatched = false;

    const matchedPairs = state.cards.filter((card) => card.matched).length / 2;

    if (matchedPairs === CARD_COUNT / 2) {
      stopBackgroundMusic();
      playVictoryJingle();
      finishGame("Congratulations!");
      return;
    }
    return;
  }

  playMismatchSound();
  state.lockBoard = true;
  const mismatchedButtons = state.flippedIds
    .map((id) => gameBoard.querySelector(`[data-id="${id}"]`))
    .filter(Boolean);

  window.clearTimeout(state.flipBackHandle);
  state.flipBackHandle = window.setTimeout(() => {
    mismatchedButtons.forEach((button) => {
      button.classList.remove("flipped");
    });
    state.flipBackHandle = window.setTimeout(() => {
      state.flippedIds = [];
      state.lockBoard = false;
      updateStatus();
    }, 340);
  }, 120);
}

function handleCardClick(event) {
  const button = event.target.closest(".memory-card");

  if (!button || state.lockBoard || state.finished || !state.started) {
    return;
  }

  const { id } = button.dataset;
  const card = state.cards.find((item) => item.id === id);

  if (!card || card.matched || state.flippedIds.includes(id)) {
    return;
  }

  state.flippedIds.push(id);
  button.classList.add("flipped");
  playFlipSound();

  if (state.flippedIds.length === 2) {
    state.lockBoard = true;
    window.setTimeout(() => {
      checkForMatch();
    }, 320);
  } else {
    state.lockBoard = false;
  }
}

function startGame(event) {
  if (event) {
    event.preventDefault();
  }

  resetBoard();
  state.started = true;
  hideOverlay();
  playStartSound();
  setBackgroundMusic("normal");
  startTimer();
}

function handleOverlayButtonClick(event) {
  if (overlayButton.textContent.trim() === "Play Again") {
    event.preventDefault();
    showIntroOverlay();
    return;
  }

  startGame(event);
}

overlayButton.addEventListener("click", handleOverlayButtonClick);
gameBoard.addEventListener("click", handleCardClick);

showIntroOverlay();
