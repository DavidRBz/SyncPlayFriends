import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, update, get, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// === 1. CONFIGURAÇÃO DO FIREBASE (PRODUÇÃO) ===
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
let roomCreatorUid = null;
let animationFrameId = null;
let roomListenerUnsubscribe = null;
let activeSession = false;

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
const hostActionsPanel = document.getElementById('host-actions-panel');

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
            creatorUid: currentUser.uid,
            password: password,
            createdAt: serverTimestamp()
        });
        window.history.replaceState({}, '', `?room=${currentRoom}`);
        joinRoom(name);
    } else {
        const roomRef = ref(db, `rooms/${currentRoom}/password`);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) {
            alert("Esta sala não existe mais!");
            return;
        }
        if (snapshot.val() !== password) {
            alert("Senha incorreta!");
            return;
        }
        joinRoom(name);
    }
});

async function joinRoom(name) {
    setupScreen.classList.add('hidden');
    sessionScreen.classList.remove('hidden');
    roomIdDisplay.innerText = currentRoom;
    activeSession = true;

    // Inicializa o próprio temporizador
    const myTimerRef = ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`);
    await set(myTimerRef, {
        name: name,
        currentTime: 0,
        isRunning: false,
        updatedAt: Date.now()
    });

    // Escuta alterações completas da sala estrutural
    const roomRef = ref(db, `rooms/${currentRoom}`);
    roomListenerUnsubscribe = onValue(roomRef, (snapshot) => {
        if (!activeSession) return;

        const roomData = snapshot.val();
        
        // Fluxo 1: A sala foi completamente removida pelo Host
        if (!roomData) {
            exitToSetup("A sala foi encerrada pelo Host administrador.");
            return;
        }

        roomCreatorUid = roomData.creatorUid;
        localTimersState = roomData.timers || {};

        // Fluxo 2: O nó do usuário atual sumiu (Expulsão da sala)
        if (!localTimersState[currentUser.uid]) {
            exitToSetup("Você foi expulso desta sala pelo Host.");
            return;
        }

        // Exibe painel exclusivo do Host se as credenciais baterem
        if (currentUser.uid === roomCreatorUid) {
            hostActionsPanel.classList.remove('hidden');
        } else {
            hostActionsPanel.classList.add('hidden');
        }

        renderTimers();
    });

    updateClocks();
}

function exitToSetup(message) {
    activeSession = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (roomListenerUnsubscribe) roomListenerUnsubscribe();
    
    localTimersState = {};
    window.history.replaceState({}, '', window.location.pathname);
    isCreator = true;
    
    alert(message);
    location.reload();
}

// === 5. RENDERIZAÇÃO E LÓGICA DO TIMER ===
function renderTimers() {
    timersGrid.innerHTML = '';
    
    const uids = Object.keys(localTimersState);
    const amIHost = currentUser.uid === roomCreatorUid;

    // Garante que seu card apareça sempre em primeiro lugar
    uids.sort((a, b) => a === currentUser.uid ? -1 : 1);

    uids.forEach(uid => {
        const timerData = localTimersState[uid];
        const isMe = uid === currentUser.uid;
        const isTargetHost = uid === roomCreatorUid;
        
        const card = document.createElement('div');
        card.className = `p-6 rounded-xl border flex flex-col justify-between relative ${
            isMe ? 'bg-gray-800 border-indigo-500 shadow-indigo-500/20 shadow-lg' : 'bg-gray-800 border-gray-700 opacity-90'
        }`;
        
        const statusColor = timerData.isRunning ? 'text-green-400' : 'text-yellow-500';
        const statusText = timerData.isRunning ? '▶ Rodando' : '⏸ Pausado';

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center mb-4 gap-2">
                    <div class="flex items-center space-x-1.5 min-w-0">
                        <h3 class="font-bold text-base text-white truncate">${timerData.name}</h3>
                        ${isTargetHost ? '<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">👑 Host</span>' : ''}
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                        <span class="text-xs font-semibold ${statusColor}">${statusText}</span>
                        <!-- Botão de Expulsar visível apenas para o Host apontando para outros usuários -->
                        ${amIHost && !isMe ? `
                            <button onclick="kickUser('${uid}', '${timerData.name}')" title="Expulsar Usuário" class="p-1 bg-red-950/40 hover:bg-red-600 rounded text-red-400 hover:text-white border border-red-900/50 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="text-center mb-6">
                    <div id="display-${uid}" class="text-5xl font-mono tracking-wider font-light">
                        00:00:00
                    </div>
                </div>
            </div>

            ${isMe ? `
            <div class="space-y-4 pt-2 border-t border-gray-700">
                <div class="flex justify-center space-x-2">
                    <button onclick="adjustTime(-1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold transition-colors">-1s</button>
                    <button onclick="togglePlayPause()" class="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded font-bold shadow-lg transition-colors text-center text-sm">
                        ${timerData.isRunning ? 'Pausar' : 'Play'}
                    </button>
                    <button onclick="adjustTime(1)" class="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm font-bold transition-colors">+1s</button>
                </div>

                <div class="bg-gray-900/50 p-3 rounded-lg space-y-2 border border-gray-700/50">
                    <div class="flex items-center justify-center space-x-1">
                        <input type="number" id="manual-h" placeholder="HH" min="0" max="99" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        <span class="text-gray-500 font-bold">:</span>
                        <input type="number" id="manual-m" placeholder="MM" min="0" max="59" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        <span class="text-gray-500 font-bold">:</span>
                        <input type="number" id="manual-s" placeholder="SS" min="0" max="59" class="w-12 bg-gray-700 text-center rounded py-1 text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                        
                        <button onclick="setManualTime()" class="ml-2 bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded text-xs font-bold transition-colors">Definir</button>
                    </div>
                </div>

                <button onclick="resetTimer()" class="w-full bg-gray-700/50 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900 border border-transparent text-gray-400 py-1.5 rounded text-xs font-semibold transition-all">
                    Resetar Temporizador
                </button>
            </div>
            ` : `<div class="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/40">Modo Leitura</div>`}
        `;
        timersGrid.appendChild(card);
    });
}

function updateClocks() {
    if (!activeSession) return;
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

// === 6. CONTROLES DO USUÁRIO E HOST (Escopo global) ===
window.togglePlayPause = async () => {
    const myState = localTimersState[currentUser.uid];
    const newTime = calculateCurrentTime(myState);
    await update(ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`), {
        isRunning: !myState.isRunning,
        currentTime: newTime,
        updatedAt: Date.now()
    });
};

window.adjustTime = async (seconds) => {
    const myState = localTimersState[currentUser.uid];
    const newTime = Math.max(0, calculateCurrentTime(myState) + seconds);
    await update(ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`), {
        currentTime: newTime,
        updatedAt: Date.now()
    });
};

window.setManualTime = async () => {
    const h = Math.max(0, parseInt(document.getElementById('manual-h').value) || 0);
    const m = Math.min(59, Math.max(0, parseInt(document.getElementById('manual-m').value) || 0));
    const s = Math.min(59, Math.max(0, parseInt(document.getElementById('manual-s').value) || 0));
    const totalSeconds = (h * 3600) + (m * 60) + s;

    await update(ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`), {
        currentTime: totalSeconds,
        updatedAt: Date.now()
    });
};

window.resetTimer = async () => {
    await update(ref(db, `rooms/${currentRoom}/timers/${currentUser.uid}`), {
        isRunning: false,
        currentTime: 0,
        updatedAt: Date.now()
    });
};

// --- AÇÕES PRIVILEGIADAS DO HOST ---

window.deleteRoom = async () => {
    if (confirm("ATENÇÃO: Deseja realmente excluir esta sala? Todos os amigos serão desconectados imediatamente.")) {
        activeSession = false;
        await set(ref(db, `rooms/${currentRoom}`), null);
    }
};

window.resetAllTimers = async () => {
    if (confirm("Deseja zerar e pausar o temporizador de TODOS os membros da sala simultaneamente?")) {
        const updates = {};
        Object.keys(localTimersState).forEach(uid => {
            updates[`rooms/${currentRoom}/timers/${uid}/currentTime`] = 0;
            updates[`rooms/${currentRoom}/timers/${uid}/isRunning`] = false;
            updates[`rooms/${currentRoom}/timers/${uid}/updatedAt`] = Date.now();
        });
        await update(ref(db), updates);
    }
};

window.kickUser = async (targetUid, targetName) => {
    if (confirm(`Deseja mesmo expulsar "${targetName}" desta sessão?`)) {
        await set(ref(db, `rooms/${currentRoom}/timers/${targetUid}`), null);
    }
};

// Evento do Botão de Cópia Baseado em Ícone
document.getElementById('copy-link-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    const toast = document.getElementById('copy-toast');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 1800);
});
