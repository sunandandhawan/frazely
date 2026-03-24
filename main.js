import { ref, set, get, onValue, update, runTransaction, onDisconnect } from "firebase/database";
import { db } from "./firebase.js";

// --- Game Dictionary & Config ---
const WORD_DICTIONARY = [
  "the", "a", "an", "is", "are", "was", "were", "to", "and", "or", "but", 
  "because", "he", "she", "it", "they", "we", "I", "you", "cat", "dog", 
  "car", "house", "tree", "book", "phone", "city", "sun", "moon", "star", 
  "run", "jump", "fly", "swim", "eat", "sleep", "think", "create", "build", 
  "fast", "slow", "big", "small", "hot", "cold", "smart", "funny", "beautiful", 
  "quickly", "quietly", "very", "too", "almost", "always", "never", "now", "then",
  "happy", "sad", "angry", "exciting", "game", "winner", "story", "epic", "legendary"
];

function getRandomWords(count) {
  const shuffled = [...WORD_DICTIONARY].sort(() => 0.5 - Math.random());
  const words = {};
  for(let i=0; i<Math.min(count, shuffled.length); i++) {
    words[i] = { text: shuffled[i], available: true };
  }
  return words;
}

const generateRoomId = () => {
   const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
   let res = '';
   for(let i=0; i<4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
   return res;
};

// --- Local State ---
let roomId = null;
let playerId = null;
let playerName = '';
let isHost = false;
let roomStateVar = null;

let currentWordsState = {};
let lastWordsState = null;
let currentPlayersState = {};

// --- DOM Elements ---
const viewJoin = document.getElementById('view-join');
const viewLobby = document.getElementById('view-lobby');
const viewPlaying = document.getElementById('view-playing');
const viewFinished = document.getElementById('view-finished');
const allViews = [viewJoin, viewLobby, viewPlaying, viewFinished];

// Input Elements
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id-input');
const sentenceInput = document.getElementById('sentence-input');

// Buttons
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnStartGame = document.getElementById('btn-start-game');
const btnPass = document.getElementById('btn-pass');
const btnSubmitSentence = document.getElementById('btn-submit-sentence');
const btnPlayAgain = document.getElementById('btn-play-again');

// Utility Functions
const switchView = (targetView) => {
  allViews.forEach(v => v.classList.remove('active'));
  targetView.classList.add('active');
};

const getName = () => {
   const n = playerNameInput.value.trim();
   if(!n) {
      alert("Please enter your name");
      playerNameInput.focus();
      return null;
   }
   return n;
};

// --- View 1: Join/Create Logic ---
btnCreateRoom.addEventListener('click', async () => {
   const name = getName();
   if(!name) return;
   
   btnCreateRoom.disabled = true;
   roomId = generateRoomId();
   playerId = Math.random().toString(36).substring(2, 10);
   isHost = true;
   playerName = name;
   
   await set(ref(db, `rooms/${roomId}`), {
      state: 'lobby',
      players: {
         [playerId]: {
            name: playerName,
            score: 0,
            isHost: true,
            passed: false
         }
      }
   });
   setupRoomListeners();
});

btnJoinRoom.addEventListener('click', async () => {
   const name = getName();
   if(!name) return;
   const rInput = roomIdInput.value.trim().toUpperCase();
   if(rInput.length !== 4) {
      alert("Invalid Room ID. It must be 4 characters.");
      return;
   }
   
   btnJoinRoom.disabled = true;
   const stateSnap = await get(ref(db, `rooms/${rInput}/state`));
   
   if(stateSnap.exists() && stateSnap.val() === 'lobby') {
      roomId = rInput;
      playerId = Math.random().toString(36).substring(2, 10);
      isHost = false;
      playerName = name;
      
      await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
         name: playerName,
         score: 0,
         isHost: false,
         passed: false
      });
      setupRoomListeners();
   } else {
      alert("Room not found or game already in progress!");
      btnJoinRoom.disabled = false;
   }
});

// --- Room Listeners & Sync ---
const setupRoomListeners = () => {
   // Manage Offline/Disconnect Event
   const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
   onDisconnect(playerRef).remove();
   
   // 1. Listen to Room State
   onValue(ref(db, `rooms/${roomId}/state`), (snap) => {
      const val = snap.val();
      if (!val || val === roomStateVar) return; // ignore initial null or dupes
      roomStateVar = val;
      
      if (val === 'lobby') {
         switchView(viewLobby);
         document.getElementById('lobby-room-id').textContent = roomId;
         btnStartGame.style.display = isHost ? 'block' : 'none';
         document.getElementById('waiting-msg').style.display = isHost ? 'none' : 'block';
         
         // reset join/create buttons in case user goes back somehow (though UI doesn't allow it right now)
         btnCreateRoom.disabled = false;
         btnJoinRoom.disabled = false;
      } 
      else if (val === 'playing') {
         switchView(viewPlaying);
         document.getElementById('playing-room-id').textContent = roomId;
         
         // Reset Pass button & inputs
         btnPass.disabled = false;
         btnPass.textContent = 'Pass Turn';
         sentenceInput.disabled = false;
         btnSubmitSentence.disabled = false;
         sentenceInput.value = '';
      } 
      else if (val === 'finished') {
         switchView(viewFinished);
         btnPlayAgain.style.display = isHost ? 'inline-block' : 'none';
         document.getElementById('finished-waiting-msg').style.display = isHost ? 'none' : 'block';
         renderFinalScoreboard();
      }
   });
   
   // 2. Listen to Players (Scoreboard & Passing Logic)
   onValue(ref(db, `rooms/${roomId}/players`), (snap) => {
      const players = snap.val();
      if (!players) return;
      currentPlayersState = players;
      
      if (!players[playerId]) return; // we were kicked/removed
      if (players[playerId].isHost !== isHost) {
          isHost = players[playerId].isHost;
          btnStartGame.style.display = isHost && roomStateVar === 'lobby' ? 'block' : 'none';
          document.getElementById('waiting-msg').style.display = isHost ? 'none' : 'block';
      }
      
      // Re-render lobby players
      const lobbyUl = document.getElementById('lobby-players');
      lobbyUl.innerHTML = '';
      document.getElementById('player-count').textContent = Object.keys(players).length;
      
      const playingScores = document.getElementById('playing-scoreboard');
      playingScores.innerHTML = '';
      
      const sorted = Object.values(players).sort((a,b) => b.score - a.score);
      
      sorted.forEach(p => {
         // Lobby Rendering
         const li = document.createElement('li');
         li.innerHTML = `<span>${p.name}</span>`;
         if (p.isHost) {
             li.innerHTML += `<span class="host-badge">Host</span>`;
         }
         lobbyUl.appendChild(li);
         
         // Playing Rendering
         const div = document.createElement('div');
         div.className = p.passed ? 'score-item passed' : 'score-item';
         div.textContent = `${p.name}: ${p.score}`;
         playingScores.appendChild(div);
      });
      
      // Update Finished view immediately if data changes while Finished
      if (roomStateVar === 'finished') {
         renderFinalScoreboard();
      }
      
      // If playing, check if everyone passed
      if (roomStateVar === 'playing' && isHost) {
         let allPassed = true;
         for(let key in players) {
            if(!players[key].passed) {
                allPassed = false;
                break;
            }
         }
         if (allPassed) {
            update(ref(db, `rooms/${roomId}`), { state: 'finished' });
         }
      }
   });
   
   // 3. Listen to Words (Game Board Chips)
   onValue(ref(db, `rooms/${roomId}/words`), (snap) => {
      const words = snap.val();
      const pool = document.getElementById('word-pool');
      currentWordsState = words;
      
      if (!words) {
         pool.innerHTML = '';
         lastWordsState = null;
         return;
      }
      
      if (!lastWordsState) {
         // Full Re-render on start
         pool.innerHTML = '';
         for (let k in words) {
            if(words[k].available) {
               const chip = document.createElement('div');
               chip.className = 'word-chip';
               chip.id = `chip-${k}`;
               chip.textContent = words[k].text;
               pool.appendChild(chip);
            }
         }
      } else {
         // Incremental Update
         for(let k in words) {
            if(!words[k].available && lastWordsState[k] && lastWordsState[k].available) {
               const chip = document.getElementById(`chip-${k}`);
               if (chip) {
                  chip.classList.add('taken');
                  setTimeout(() => chip.remove(), 300); // Wait for transition
               }
            }
         }
      }
      lastWordsState = words;
   });
};

function renderFinalScoreboard() {
   const finalUl = document.getElementById('final-scoreboard');
   finalUl.innerHTML = '';
   if (!currentPlayersState) return;
   
   const sorted = Object.values(currentPlayersState).sort((a,b) => b.score - a.score);
   sorted.forEach((p, index) => {
      const li = document.createElement('li');
      li.className = 'rank-item';
      
      let rankClass = '';
      if(index === 0) rankClass = 'rank-1';
      else if(index === 1) rankClass = 'rank-2';
      else if(index === 2) rankClass = 'rank-3';
      
      li.innerHTML = `
         <span style="width: 40px; font-weight: bold;" class="${rankClass}">#${index+1}</span>
         <span style="flex: 1;" class="${rankClass}">${p.name}</span>
         <span style="font-weight: bold;" class="${rankClass}">${p.score} pts</span>
      `;
      finalUl.appendChild(li);
   });
}

// --- Host Actions ---
btnStartGame.addEventListener('click', async () => {
   if (!isHost || !roomId) return;
   
   const words = getRandomWords(50);
   const updates = {};
   updates['state'] = 'playing';
   updates['words'] = words;
   
   // Reset passed status
   for(let pId in currentPlayersState) {
      updates[`players/${pId}/passed`] = false;
   }
   
   await update(ref(db, `rooms/${roomId}`), updates);
});

btnPlayAgain.addEventListener('click', async () => {
   if (!isHost || !roomId) return;
   
   const updates = {};
   updates['state'] = 'lobby';
   updates['words'] = null;
   
   for(let pId in currentPlayersState) {
       updates[`players/${pId}/score`] = 0;
       updates[`players/${pId}/passed`] = false;
   }
   
   await update(ref(db, `rooms/${roomId}`), updates);
});

// --- Player Actions ---
btnPass.addEventListener('click', () => {
   if (roomId && playerId) {
      const pRef = ref(db, `rooms/${roomId}/players/${playerId}`);
      update(pRef, { passed: true });
      
      btnPass.disabled = true;
      btnPass.textContent = 'Passed';
      sentenceInput.disabled = true;
      btnSubmitSentence.disabled = true;
   }
});

const submitSentenceFn = () => {
   const sentence = sentenceInput.value.trim();
   if (!sentence) return;
   
   // Match sequences of a-z letters ignore case
   const extractedWords = sentence.match(/[a-zA-Z]+/g) || [];
   if(extractedWords.length === 0) return;
   
   // Local validation
   const requiredCounts = {};
   for(let w of extractedWords) {
      const lw = w.toLowerCase();
      requiredCounts[lw] = (requiredCounts[lw] || 0) + 1;
   }
   
   const availableKeysByWord = {};
   if (currentWordsState) {
       for(let k in currentWordsState) {
          if (currentWordsState[k].available) {
             const lw = currentWordsState[k].text.toLowerCase();
             if(!availableKeysByWord[lw]) availableKeysByWord[lw] = [];
             availableKeysByWord[lw].push(k);
          }
       }
   }
   
   let valid = true;
   const intendedClaims = [];
   for(let lw in requiredCounts) {
      if(!availableKeysByWord[lw] || availableKeysByWord[lw].length < requiredCounts[lw]) {
         valid = false;
         break;
      }
      intendedClaims.push(...availableKeysByWord[lw].slice(0, requiredCounts[lw]));
   }
   
   const failSubmission = () => {
      sentenceInput.classList.add('shake');
      setTimeout(() => sentenceInput.classList.remove('shake'), 400);
   };
   
   if (!valid) {
      failSubmission();
      return;
   }
   
   // Server validation via transaction for atomicity
   btnSubmitSentence.disabled = true;
   const wordsRef = ref(db, `rooms/${roomId}/words`);
   
   runTransaction(wordsRef, (currentData) => {
      if(currentData === null) return currentData;
      
      let allGood = true;
      for(let key of intendedClaims) {
         if (!currentData[key] || !currentData[key].available) {
            allGood = false;
            break;
         }
      }
      if (allGood) {
         for(let key of intendedClaims) {
            currentData[key].available = false;
         }
         return currentData; // commit
      } else {
         return; // abort
      }
   }).then((result) => {
      btnSubmitSentence.disabled = false;
      if(result.committed) {
         // Valid claim, update score
         const pRef = ref(db, `rooms/${roomId}/players/${playerId}`);
         runTransaction(pRef, (pData) => {
            if(pData) {
               pData.score += extractedWords.length * 10;
            }
            return pData;
         });
         sentenceInput.value = '';
         sentenceInput.focus();
      } else {
         failSubmission();
      }
   }).catch(err => {
      btnSubmitSentence.disabled = false;
      console.error(err);
      failSubmission();
   });
};

btnSubmitSentence.addEventListener('click', submitSentenceFn);
sentenceInput.addEventListener('keypress', (e) => {
   if(e.key === 'Enter') {
      submitSentenceFn();
   }
});
