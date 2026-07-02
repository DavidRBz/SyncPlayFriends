import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, update, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// === 1. CONFIGURAÇÃO DO FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyCQ3cod2mPiue2CGdeLiNnfqN8uY9ZPiOw",
    authDomain: "syncplayfriends.firebaseapp.com",
    databaseURL: "https://syncplayfriends-default-rtdb.firebaseio.com",
    projectId: "syncplayfriends",
    storageBucket: "syncplayfriends.firebasestorage.app",
    messagingSenderId: "632636620278",
    appId: "1:632636620278:web:470506b86ba5c26b26dbd7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// === 2. ESTADO DA APLICAÇÃO ===
let currentUser = null;
let currentRoom = new URLSearchParams(window.location.search).get('room');
let isCreator = !currentRoom;
let localTimersState = {};
let animationFrameId = null;

// Elementos da DOM
const setupScreen = document.getElementById('setup-screen');
const sessionScreen = document.getElementById('session-screen');
const setupTitle = document.getElementById('setup-title');
const nameContainer = document.getElementById('name-container');
const userNameInput = document.getElementById('user-name');
const roomPasswordInput = document.getElementById('room-password');
const actionBtn = document.getElementById('action-btn');
const roomIdDisplay = document.getElementById('room-id-display');
const timersGrid = document.getElementById('timers-grid');

// === 3. INICIALIZAÇÃO E AUTENTICAÇÃO ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        initUI();
    } else {
        signInAnonymously(auth).catch((error) => console.error("Erro na auth:", error));
    }
});

function initUI() {
    if (isCreator) {
        setupTitle.innerText = "Criar Nova Sessão";
        actionBtn.innerText = "Criar Sala";
        nameContainer.classList.remove('hidden');
    } else {
        setupTitle.innerText = "Entrar na Sessão";
        actionBtn.innerText = "Entrar";
        nameContainer.classList.remove('hidden');
    }
}

// === 4. LÓGICA DE SALA ===
actionBtn.addEventListener('click', async () => {
    const name = userNameInput.value.trim() || "Anônimo";
    const password = roomPasswordInput.value.trim();

    if (isCreator) {
        currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
        const roomRef = ref(db, `rooms/${currentRoom}`);
        await set(roomRef, {
            password: password,
            createdAt: serverTimestamp()
        });
        window.history.replaceState({}, '', `?room=${currentRoom}`);
        joinRoom(name, password);
    } else {
        const roomRef = ref(db, `rooms/${currentRoom}/password`);
        const snapshot = await get(roomRef);
        if (snapshot.exists() && snapshot.val() !== password) {
            alert("Senha incorreta!");
            return;
        }
        joinRoom(name, password);
    }
});

async function joinRoom(name, password) {
    setupScreen.classList.add('hidden');
    sessionScreen.classList.remove('hidden');
    roomIdDisplay.innerText = currentRoom;

    // Inicializa o timer do usuário atual
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    await set(myTimerRef, {
        name: name,
        currentTime: 0,
        isRunning: false,
        updatedAt: Date.now()
    });

    // Escuta alterações na sala
    const timersRef = ref(db, `rooms/${currentRoom}/timers`);
    onValue(timersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            localTimersState = data;
            renderTimers();
        }
    });

    // Loop de renderização visual dos timers
    updateClocks();
}

// === 5. RENDERIZAÇÃO E LÓGICA DO TIMER ===
function renderTimers() {
    timersGrid.innerHTML = '';
    
    // Renderiza o próprio usuário primeiro, depois os outros
    const uids = Object.keys(localTimersState);
    uids.sort((a, b) => a === currentUser.uid ? -1 : 1);

    uids.forEach(uid => {
        const timerData = localTimersState[uid];
        const isMe = uid === currentUser.uid;
        
        const card = document.createElement('div');
        card.className = `p-6 rounded-xl border ${isMe ? 'bg-gray-800 border-indigo-500 shadow-indigo-500/20 shadow-lg' : 'bg-gray-800 border-gray-700 opacity-80'}`;
        
        const statusColor = timerData.isRunning ? 'text-green-400' : 'text-yellow-500';
        const statusText = timerData.isRunning ? '▶ Rodando' : '⏸ Pausado';

        card.innerHTML = `
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-lg text-white">${timerData.name} ${isMe ? '(Você)' : ''}</h3>
                <span class="text-xs font-semibold ${statusColor}">${statusText}</span>
            </div>
            <div class="text-center mb-6">
                <div id="display-${uid}" class="text-5xl font-mono tracking-wider font-light">
                    00:00:00
                </div>
            </div>
            ${isMe ? `
            <div class="flex justify-center space-x-3">
                <button onclick="adjustTime(-1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold">-1s</button>
                <button onclick="togglePlayPause()" class="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded font-bold shadow-lg">
                    ${timerData.isRunning ? 'Pausar' : 'Play'}
                </button>
                <button onclick="adjustTime(1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold">+1s</button>
            </div>
            ` : `<div class="text-center text-xs text-gray-500 mt-4">Somente Leitura</div>`}
        `;
        timersGrid.appendChild(card);
    });
}

// Atualiza o relógio na tela sincronizado com o tempo calculado
function updateClocks() {
    Object.keys(localTimersState).forEach(uid => {
        const display = document.getElementById(`display-${uid}`);
        if (display) {
            const time = calculateCurrentTime(localTimersState[uid]);
            display.innerText = formatTime(time);
        }
    });
    animationFrameId = requestAnimationFrame(updateClocks);
}

function calculateCurrentTime(timerState) {
    if (!timerState.isRunning) return timerState.currentTime;
    const elapsed = (Date.now() - timerState.updatedAt) / 1000;
    return Math.max(0, timerState.currentTime + elapsed);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// === 6. CONTROLES DO USUÁRIO (Exportados para o escopo global para o onclick do HTML) ===
window.togglePlayPause = async () => {
    const myState = localTimersState[currentUser.uid];
    const newTime = calculateCurrentTime(myState);
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    
    await update(myTimerRef, {
        isRunning: !myState.isRunning,
        currentTime: newTime,
        updatedAt: Date.now()
    });
};

window.adjustTime = async (seconds) => {
    const myState = localTimersState[currentUser.uid];
    const newTime = Math.max(0, calculateCurrentTime(myState) + seconds);
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    
    await update(myTimerRef, {
        currentTime: newTime,
        updatedAt: Date.now()
    });
};

// UI Extras
document.getElementById('copy-link-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    const btn = document.getElementById('copy-link-btn');
    btn.innerText = "Copiado!";
    setTimeout(() => btn.innerText = "Copiar Link Convite", 2000);
});
