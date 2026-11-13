/* Integração com Firebase (Authentication + Firestore).
 * É o único arquivo que usa módulos ES. Ele expõe PTB.cloud e avisa o app
 * pelo evento "ptb:cloud-ready". O resto do código não conhece o Firebase. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const PTB = window.PTB;

/* ---------- Mensagens de erro em português ---------- */
const AUTH_ERRORS = {
  'auth/popup-blocked': 'O navegador bloqueou a janela de login. Libere pop-ups para este site.',
  'auth/unauthorized-domain': 'Domínio não autorizado. No Firebase Console, em Authentication → Configurações → Domínios autorizados, adicione "127.0.0.1" (ou abra o site por localhost).',
  'auth/operation-not-allowed': 'O login com Google não está ativado. Ative em Authentication → Método de login.',
  'auth/network-request-failed': 'Falha de rede ao tentar entrar. Verifique sua internet.',
};
const SILENT_AUTH_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];

const DB_ERRORS = {
  'permission-denied': 'Sem permissão no Firestore. Confira se as regras de segurança foram publicadas.',
  unavailable: 'Sem conexão com o Firestore. Verifique sua internet.',
  'not-found': 'O banco Firestore ainda não foi criado neste projeto.',
};

function friendly(map, err) {
  const error = new Error(map[err.code] || err.message);
  error.code = err.code;
  return error;
}

/* ---------- Repositório em nuvem: MESMO contrato do LocalTeamRepository ---------- */
class FirestoreTeamRepository {
  constructor(db, uid) { this.db = db; this.uid = uid; }

  _teams() { return collection(this.db, 'users', this.uid, 'teams'); }

  async _run(operation) {
    try { return await operation(); }
    catch (err) { throw friendly(DB_ERRORS, err); }
  }

  list() {
    return this._run(async () => {
      const snapshot = await getDocs(this._teams());
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  get(id) {
    return this._run(async () => {
      const snapshot = await getDoc(doc(this._teams(), id));
      return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    });
  }

  save(team) {
    return this._run(async () => {
      const id = team.id || PTB.utils.uid();
      const data = {
        name: String(team.name).slice(0, 60),
        // O Firestore rejeita "undefined"; o ciclo JSON remove esses valores
        members: JSON.parse(JSON.stringify(team.members)),
        updatedAt: Date.now(),
      };
      await setDoc(doc(this._teams(), id), data);
      return { id, ...data };
    });
  }

  remove(id) {
    return this._run(() => deleteDoc(doc(this._teams(), id)));
  }
}

/* ---------- Inicialização ---------- */
function init() {
  const config = PTB.firebaseConfig || {};
  if (!config.apiKey || String(config.apiKey).startsWith('COLE')) {
    PTB.cloud = { available: false, reason: 'Firebase não configurado. Preencha o arquivo js/firebase-config.js.' };
    return;
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' }); // sempre deixa escolher a conta

  PTB.cloud = {
    available: true,
    onAuthChange: (callback) => onAuthStateChanged(auth, callback),
    async signIn() {
      try { await signInWithPopup(auth, provider); }
      catch (err) {
        if (SILENT_AUTH_CODES.includes(err.code)) return; // usuário só fechou a janela
        throw friendly(AUTH_ERRORS, err);
      }
    },
    signOut: () => signOut(auth),
    repositoryFor: (uid) => new FirestoreTeamRepository(db, uid),
  };
}

try { init(); }
catch (err) {
  console.error('Falha ao iniciar o Firebase:', err);
  PTB.cloud = { available: false, reason: `Falha ao iniciar o Firebase: ${err.message}` };
}
window.dispatchEvent(new Event('ptb:cloud-ready'));