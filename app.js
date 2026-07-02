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
    
    // Organiza os uids para que o do usuário atual fique sempre no topo esquerdo
    const uids = Object.keys(localTimersState);
    uids.sort((a, b) => a === currentUser.uid ? -1 : 1);

    uids.forEach(uid => {
        const timerData = localTimersState[uid];
        const isMe = uid === currentUser.uid;
        
        const card = document.createElement('div');
        card.className = `p-6 rounded-xl border flex flex-col justify-between ${isMe ? 'bg-gray-800 border-indigo-500 shadow-indigo-500/20 shadow-lg' : 'bg-gray-800 border-gray-700 opacity-80'}`;
        
        const statusColor = timerData.isRunning ? 'text-green-400' : 'text-yellow-500';
        const statusText = timerData.isRunning ? '▶ Rodando' : '⏸ Pausado';

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-lg text-white truncate max-w-[150px]">${timerData.name} ${isMe ? '(Você)' : ''}</h3>
                    <span class="text-xs font-semibold ${statusColor}">${statusText}</span>
                </div>
                <div class="text-center mb-6">
                    <div id="display-${uid}" class="text-5xl font-mono tracking-wider font-light">
                        00:00:00
                    </div>
                </div>
            </div>

            ${isMe ? `
            <div class="space-y-4 pt-2 border-t border-gray-700">
                <!-- Controles de Fluxo Principais -->
                <div class="flex justify-center space-x-2">
                    <button onclick="adjustTime(-1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold transition-colors">-1s</button>
                    <button onclick="togglePlayPause()" class="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-bold shadow-lg transition-colors text-center text-sm">
                        ${timerData.isRunning ? 'Pausar' : 'Play'}
                    </button>
                    <button onclick="adjustTime(1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold transition-colors">+1s</button>
                </div>

                <!-- Entrada Manual Avançada -->
                <div class="bg-gray-900/50 p-3 rounded-lg space-y-2 border border-gray-700/50">
                    <span class="block text-xs text-gray-400 text-center font-medium">Definir Tempo Manual</span>
                    <div class="flex items-center justify-center space-x-1">
                        <input type="number" id="manual-h" placeholder="HH" min="0" max="99" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        <span class="text-gray-500 font-bold">:</span>
                        <input type="number" id="manual-m" placeholder="MM" min="0" max="59" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        <span class="text-gray-500 font-bold">:</span>
                        <input type="number" id="manual-s" placeholder="SS" min="0" max="59" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        
                        <button onclick="setManualTime()" class="ml-2 bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded text-xs font-bold transition-colors">
                            Definir
                        </button>
                    </div>
                </div>

                <!-- Botão de Descarte / Reset -->
                <button onclick="resetTimer()" class="w-full bg-gray-700/50 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900 border border-transparent text-gray-400 py-1.5 rounded text-xs font-semibold transition-all">
                    Resetar Temporizador
                </button>
            </div>
            ` : `<div class="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/40">Modo Leitura</div>`}
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

// === 6. CONTROLES DO USUÁRIO (Exportados para escopo global) ===
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

// Nova Função: Processamento da Entrada Numérica Manual
window.setManualTime = async () => {
    const hInput = document.getElementById('manual-h').value;
    const mInput = document.getElementById('manual-m').value;
    const sInput = document.getElementById('manual-s').value;

    // Converte os inputs em inteiros tratando campos vazios como zero
    const hours = Math.max(0, parseInt(hInput) || 0);
    const minutes = Math.min(59, Math.max(0, parseInt(mInput) || 0));
    const seconds = Math.min(59, Math.max(0, parseInt(sInput) || 0));

    // Cálculo totalizador em segundos lineares
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

    const myState = localTimersState[currentUser.uid];
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    
    await update(myTimerRef, {
        currentTime: totalSeconds,
        updatedAt: Date.now() // Reseta a janela delta de tempo contínuo
    });
};

// Nova Função: Reset Total do Estado do Relógio
window.resetTimer = async () => {
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    
    // Força o relógio a pausar e limpa o valor acumulado para zero absoluto
    await update(myTimerRef, {
        isRunning: false,
        currentTime: 0,
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
