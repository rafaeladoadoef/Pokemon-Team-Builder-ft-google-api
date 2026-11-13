/* Persistência das equipes.
 *
 * CONTRATO (qualquer repositório deve implementar, sempre assíncrono):
 *   list()        → Promise<Team[]>
 *   get(id)       → Promise<Team|null>
 *   save(team)    → Promise<Team>      (cria ou atualiza)
 *   remove(id)    → Promise<void>
 *
 * Esta é a versão LOCAL (localStorage). A versão em nuvem (Firestore) está em
 * firebase-service.js e segue o mesmo contrato; o app.js escolhe qual usar
 * conforme o usuário esteja logado ou não.
 */
(function (PTB) {
  const { STORAGE_KEYS } = PTB.config;

  class LocalTeamRepository {
    _readAll() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.teams)) || []; }
      catch { return []; }
    }

    _writeAll(teams) {
      try { localStorage.setItem(STORAGE_KEYS.teams, JSON.stringify(teams)); }
      catch { throw new Error('O armazenamento do navegador está cheio ou bloqueado.'); }
    }

    async list() { return this._readAll().sort((a, b) => b.updatedAt - a.updatedAt); }

    async get(id) { return this._readAll().find((t) => t.id === id) || null; }

    async save(team) {
      const teams = this._readAll();
      const saved = {
        id: team.id || PTB.utils.uid(),
        name: team.name,
        members: team.members,
        updatedAt: Date.now(),
      };
      const index = teams.findIndex((t) => t.id === saved.id);
      if (index >= 0) teams[index] = saved; else teams.push(saved);
      this._writeAll(teams);
      return saved;
    }

    async remove(id) { this._writeAll(this._readAll().filter((t) => t.id !== id)); }
  }

  /* Rascunho: a equipe em edição sobrevive a um F5, mesmo sem ter sido salva. */
  const draftStore = {
    load() {
      try {
        const draft = JSON.parse(localStorage.getItem(STORAGE_KEYS.draft));
        return draft && Array.isArray(draft.members) ? draft : null;
      } catch { return null; }
    },
    save(team) {
      try { localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(team)); } catch { /* ignora */ }
    },
  };

  PTB.teamRepository = new LocalTeamRepository();
  PTB.draftStore = draftStore;
})(window.PTB = window.PTB || {});