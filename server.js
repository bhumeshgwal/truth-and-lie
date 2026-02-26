const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

const STAGES = {
  easy:    { name:'EASY',    pts:10, chalPts:5,  chalFail:5  },
  medium:  { name:'MEDIUM',  pts:20, chalPts:10, chalFail:10 },
  hard:    { name:'HARD',    pts:30, chalPts:15, chalFail:15 },
  extreme: { name:'EXTREME', pts:40, chalPts:20, chalFail:20 },
};

const DEFAULT_SETS = [
  { a:"The Eiffel Tower can grow 15cm taller in summer due to heat expansion", b:"Honey never spoils — edible samples have been found in Egyptian pyramids", c:"Bananas grow on trees", lie:'c', explain:"Bananas grow on large herbaceous plants, not true trees!", used:false },
  { a:"Octopuses have three hearts", b:"A group of flamingos is called a flamboyance", c:"Lightning never strikes the same place twice", lie:'c', explain:"Lightning absolutely can and does strike the same place multiple times!", used:false },
  { a:"Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid", b:"A day on Venus is longer than a year on Venus", c:"Mount Everest is the tallest mountain measured from base to peak", lie:'c', explain:"Mauna Kea is tallest from base to peak — Everest is tallest from sea level!", used:false },
  { a:"Sharks are older than trees — they predate trees by ~50 million years", b:"Wombat poop is cube-shaped", c:"The Great Wall of China is visible from space with the naked eye", lie:'c', explain:"The Great Wall is too narrow to be visible from space without aid!", used:false },
];

let gameState = {
  stage: 'easy',
  players: [],
  currentPlayer: null,
  currentSet: null,
  defaultSets: JSON.parse(JSON.stringify(DEFAULT_SETS)),
  questionSets: [],
  challenger: null,
  revealed: false,
  locked: false,
  round: 0,
  timerVal: 60,
  timerDuration: 60,
  timerRunning: false,
  gamePhase: 'idle',
  status: 'Waiting to start...',
  showLeaderboard: false,
  slotAnimation: null, // { spinning: true, result: name, names: [] }
  scoreFlash: null,    // { text, positive }
  challengeAnim: false,
};

const clients = new Set();
let timerInterval = null;

wss.on('connection', (ws) => {
  clients.add(ws);
  safeSend(ws, { type: 'state', data: sanitizeState() });

  ws.on('message', (raw) => {
    try {
      const { type, data } = JSON.parse(raw);
      handleMessage(type, data);
    } catch(e) { console.error('WS parse error', e.message); }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function safeSend(ws, obj) {
  try { if(ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch(e) {}
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  clients.forEach(c => { try { if(c.readyState === 1) c.send(msg); } catch(e) {} });
}

function broadcastState() {
  broadcast({ type: 'state', data: sanitizeState() });
}

function sanitizeState() {
  // Deep clone to avoid mutation
  return JSON.parse(JSON.stringify(gameState));
}

function flashScore(text, positive) {
  gameState.scoreFlash = { text, positive };
  broadcastState();
  setTimeout(() => { gameState.scoreFlash = null; broadcastState(); }, 1200);
}

function handleMessage(type, data) {
  const s = gameState;
  const st = STAGES[s.stage];

  switch(type) {

    case 'setStage':
      s.stage = data;
      broadcastState();
      break;

    case 'addPlayer':
      if(!s.players.find(p => p.name.toLowerCase() === data.toLowerCase())) {
        s.players.push({ name:data, pts:0, used:false, challengeCount:0, lastChallengeRound:-99 });
        broadcastState();
      }
      break;

    case 'removePlayer':
      if(s.players[data]) {
        if(s.currentPlayer === s.players[data].name) s.currentPlayer = null;
        s.players.splice(data, 1);
        broadcastState();
      }
      break;

    case 'adjustPts':
      if(s.players[data.idx]) {
        s.players[data.idx].pts = Math.max(0, s.players[data.idx].pts + data.delta);
        broadcastState();
      }
      break;

    case 'pickRandom': {
      const avail = s.players.filter(p => !p.used);
      if(!avail.length) break;
      const picked = avail[Math.floor(Math.random() * avail.length)];
      const allNames = s.players.map(p => p.name);

      // Start slot animation
      s.slotAnimation = { spinning: true, result: picked.name, names: allNames };
      s.gamePhase = 'spinning';
      broadcastState();

      // After 3.5s animation, commit the pick
      setTimeout(() => {
        s.slotAnimation = null;
        picked.used = true;
        s.currentPlayer = picked.name;
        s.round++;
        s.gamePhase = 'playing';
        s.revealed = false;
        s.locked = false;
        s.challenger = null;
        s.players.forEach(p => {
          if(s.round - p.lastChallengeRound >= 2) p.challengeCount = 0;
        });
        // Auto-pick next unused question set
        const allSets = [...s.defaultSets, ...s.questionSets];
        const nextSet = allSets.find(q => !q.used);
        if(nextSet) s.currentSet = nextSet;
        s.status = picked.name + ' is on stage! Start the timer when ready.';
        broadcastState();
      }, 4000);
      break;
    }

    case 'selectQset': {
      const allSets = [...s.defaultSets, ...s.questionSets];
      if(allSets[data]) { s.currentSet = allSets[data]; broadcastState(); }
      break;
    }

    case 'addQset':
      s.questionSets.push({ ...data, used:false });
      broadcastState();
      break;

    case 'startTimer':
      if(timerInterval) clearInterval(timerInterval);
      s.timerDuration = data || 60;
      s.timerVal = s.timerDuration;
      s.timerRunning = true;
      s.status = (s.currentPlayer || 'Player') + ' is thinking...';
      broadcastState();
      timerInterval = setInterval(() => {
        s.timerVal = Math.max(0, s.timerVal - 1);
        if(s.timerVal <= 0) {
          clearInterval(timerInterval);
          timerInterval = null;
          s.timerRunning = false;
          s.status = "⏰ TIME'S UP!";
        }
        broadcastState();
      }, 1000);
      break;

    case 'stopTimer':
      clearInterval(timerInterval); timerInterval = null;
      s.timerRunning = false;
      broadcastState();
      break;

    case 'resetTimer':
      clearInterval(timerInterval); timerInterval = null;
      s.timerRunning = false;
      s.timerVal = data || s.timerDuration;
      broadcastState();
      break;

    case 'lockAnswer':
      clearInterval(timerInterval); timerInterval = null;
      s.timerRunning = false;
      s.locked = true;
      s.gamePhase = 'locked';
      s.status = (s.currentPlayer || 'Player') + ' locked answer. Challenge or Reveal?';
      broadcastState();
      break;

    case 'revealAnswer':
      s.revealed = true;
      s.gamePhase = 'revealed';
      if(s.currentSet) s.currentSet.used = true;
      s.status = 'Answer revealed! Was the participant correct?';
      broadcastState();
      break;

    case 'awardParticipant': {
      const pts = st.pts;
      const pIdx = s.players.findIndex(p => p.name === s.currentPlayer);
      if(pIdx >= 0) s.players[pIdx].pts += pts;
      s.gamePhase = 'done';
      s.status = '🎉 ' + s.currentPlayer + ' +' + pts + ' pts!';
      flashScore('+' + pts, true);
      break;
    }

    case 'participantWrong':
      s.gamePhase = 'done';
      s.status = (s.currentPlayer || 'Player') + ' was wrong. Next round?';
      broadcastState();
      break;

    case 'nextRound':
      s.currentSet = null;
      s.revealed = false;
      s.locked = false;
      s.challenger = null;
      s.gamePhase = 'idle';
      s.status = 'Select next player in Admin panel';
      broadcastState();
      break;

    case 'selectChallenger': {
      const chalP = s.players.find(p => p.name === data);
      if(!chalP || chalP.challengeCount >= 2) break;
      s.challenger = data;
      chalP.challengeCount++;
      chalP.lastChallengeRound = s.round;
      s.gamePhase = 'locked';
      s.challengeAnim = true;
      s.status = '⚔️ ' + data + ' challenges!';
      broadcastState();
      setTimeout(() => { s.challengeAnim = false; broadcastState(); }, 2500);
      break;
    }

    case 'clearChallenger':
      s.challenger = null;
      broadcastState();
      break;

    case 'challengerCorrect': {
      const cPts = st.chalPts;
      const cIdx = s.players.findIndex(p => p.name === s.challenger);
      if(cIdx >= 0) s.players[cIdx].pts += cPts;
      flashScore('+' + cPts, true);
      // Also reveal
      s.revealed = true;
      s.gamePhase = 'revealed';
      if(s.currentSet) s.currentSet.used = true;
      s.status = '⚔️ Challenger correct! +' + cPts + ' pts. Revealing answer...';
      break;
    }

    case 'challengerWrong': {
      const cFail = st.chalFail;
      const cIdx2 = s.players.findIndex(p => p.name === s.challenger);
      if(cIdx2 >= 0) s.players[cIdx2].pts = Math.max(0, s.players[cIdx2].pts - cFail);
      flashScore('-' + cFail, false);
      s.revealed = true;
      s.gamePhase = 'revealed';
      if(s.currentSet) s.currentSet.used = true;
      s.status = '⚔️ Challenger wrong! -' + cFail + ' pts. Revealing answer...';
      break;
    }

    case 'toggleLeaderboard':
      s.showLeaderboard = !!data;
      broadcastState();
      break;

    case 'resetAllScores':
      s.players.forEach(p => { p.pts=0; p.challengeCount=0; p.used=false; });
      s.round = 0;
      s.currentPlayer = null;
      s.challenger = null;
      s.gamePhase = 'idle';
      s.status = 'Scores reset. Ready to start!';
      broadcastState();
      break;

    case 'clearAllPlayers':
      s.players = [];
      s.currentPlayer = null;
      s.challenger = null;
      s.gamePhase = 'idle';
      broadcastState();
      break;

    case 'resetQsets':
      s.defaultSets = JSON.parse(JSON.stringify(DEFAULT_SETS));
      s.questionSets = [];
      s.currentSet = null;
      broadcastState();
      break;
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for(const n of Object.values(nets)) {
    for(const addr of n) {
      if(addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break; }
    }
  }
  console.log('\n🎮 2 TRUTHS 1 LIE — Game Server');
  console.log('═══════════════════════════════════');
  console.log(`📺 Display (laptop):  http://localhost:${PORT}/player.html`);
  console.log(`📱 Admin (phone):     http://${localIP}:${PORT}/admin.html`);
  console.log(`🌐 Your local IP:     ${localIP}`);
  console.log('═══════════════════════════════════\n');
});
