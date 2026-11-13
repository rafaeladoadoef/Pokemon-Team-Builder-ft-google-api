/* Controlador: guarda o estado, escuta eventos e orquestra api, repositórios e ui. */
(function (PTB) {
  const { api, ui, utils, teamRepository, draftStore, config } = PTB;
  const { TEAM_SIZE, PAGE_SIZE, FIRST_ALT_FORM_ID } = config;
  const $ = (selector) => document.querySelector(selector);

  /* ---------- Estado ---------- */
  const emptyMembers = () => Array(TEAM_SIZE).fill(null);
  const padMembers = (list = []) => Array.from({ length: TEAM_SIZE }, (_, i) => list[i] || null);
  const newTeam = () => ({ id: null, name: 'Minha equipe', members: emptyMembers() });

  const state = {
    index: [],          // lista completa {id, name} vinda da PokéAPI
    filtered: [],       // resultado da busca atual
    visible: 0,         // quantos cards já foram mostrados
    team: newTeam(),    // equipe em edição (slots podem ser null)
    targetSlot: null,   // slot que receberá o próximo Pokémon (modo "substituir")
    detail: null,       // dados do Pokémon aberto no diálogo
    detailToken: 0,     // evita que uma resposta antiga sobrescreva uma mais nova
    user: null,         // usuário logado (null = modo local)
    repository: teamRepository, // onde as equipes são salvas: local ou Firestore
  };

  /* ---------- Feedback ---------- */
  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    // Mensagens longas (erros do Firebase) ficam mais tempo na tela
    toastTimer = setTimeout(() => el.classList.remove('show'), Math.max(2800, message.length * 70));
  }

  function setStatus(html, kind = '') {
    const el = $('#dex-status');
    el.innerHTML = html;
    el.className = `status ${kind}`;
  }

  function setView(view) {
    document.body.dataset.view = view;
    document.querySelectorAll('[data-action="set-view"]').forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.view === view));
  }

  /* ---------- Pokédex: carga, busca e paginação ---------- */
  async function loadIndex() {
    setStatus('Carregando Pokédex…', 'loading');
    try {
      state.index = await api.getIndex();
      setStatus('');
      applyFilter();
    } catch (err) {
      setStatus(`${utils.escapeHtml(err.message)} <button class="link-btn" type="button" data-action="retry-index">Tentar novamente</button>`, 'error');
    }
  }

  function applyFilter() {
    if (!state.index.length) return;
    const query = $('#search-input').value.trim().toLowerCase().replace(/\s+/g, '-');
    const includeForms = $('#include-forms').checked;

    let list;
    if (/^\d+$/.test(query)) {
      list = state.index.filter((e) => e.id === Number(query));          // número exato
    } else {
      list = includeForms ? state.index : state.index.filter((e) => e.id < FIRST_ALT_FORM_ID);
      if (query) list = list.filter((e) => e.name.includes(query));      // trecho do nome
    }

    state.filtered = list;
    state.visible = 0;
    $('#dex-grid').innerHTML = '';
    $('#result-count').textContent = `${list.length} resultado(s)`;
    setStatus(list.length ? '' : 'Nenhum Pokémon encontrado. Tente outro nome ou número.');
    showMore();
  }

  function showMore() {
    const next = state.filtered.slice(state.visible, state.visible + PAGE_SIZE);
    $('#dex-grid').insertAdjacentHTML('beforeend', next.map(ui.dexCard).join(''));
    state.visible += next.length;
    $('#load-more').hidden = state.visible >= state.filtered.length;
  }

  /* ---------- Detalhes ---------- */
  async function openDetail(name) {
    const token = ++state.detailToken;
    const dialog = $('#detail-dialog');
    $('#detail-content').innerHTML = ui.detailLoading();
    if (!dialog.open) dialog.showModal();

    try {
      const pokemon = await api.getPokemon(name);
      // Dados complementares em paralelo; falha em forma/habilidade não impede de mostrar o Pokémon
      const [species, form, abilities] = await Promise.all([
        api.getSpecies(pokemon.speciesName),
        pokemon.formUrl ? api.getForm(pokemon.formUrl).catch(() => null) : null,
        Promise.all(pokemon.abilities.map((a) => api.getAbility(a.name).catch(() => null))),
      ]);
      if (token !== state.detailToken) return;
      state.detail = { pokemon, species, form, abilities };
      renderDetail();
    } catch (err) {
      if (token !== state.detailToken) return;
      $('#detail-content').innerHTML = ui.detailError(err.message);
    }
  }

  function renderDetail() {
    $('#detail-content').innerHTML = ui.detailView(state.detail, {
      members: state.team.members,
      targetSlot: state.targetSlot,
    });
  }

  /* ---------- Equipe ---------- */
  function renderTeam() {
    const { members, name } = state.team;
    const count = members.filter(Boolean).length;

    $('#team-slots').innerHTML = members.map((m, i) => ui.teamSlot(m, i, state.targetSlot)).join('');
    $('#team-count').textContent = `${count}/${TEAM_SIZE}`;
    $('#nav-count').textContent = count;
    $('#team-summary').innerHTML = ui.teamSummary(members);

    const banner = $('#target-banner');
    banner.hidden = state.targetSlot === null;
    banner.innerHTML = state.targetSlot === null ? '' : ui.targetBanner(state.targetSlot);

    const nameInput = $('#team-name');
    if (document.activeElement !== nameInput) nameInput.value = name;
  }

  /** Toda alteração na equipe passa por aqui: redesenha e guarda o rascunho. */
  function commitTeam() {
    renderTeam();
    draftStore.save(state.team);
  }

  /** Adiciona ou substitui. Retorna true se alterou a equipe.
   *  slotIndex: undefined = usa o slot alvo (se houver); null = primeiro vazio; número = esse slot. */
  function addToTeam(pokemon, slotIndex = state.targetSlot) {
    const member = utils.toMember(pokemon);
    const members = state.team.members;

    if (members.some((m, i) => m && m.name === member.name && i !== slotIndex)) {
      toast(`${member.displayName} já está na equipe.`);
      return false;
    }

    const index = slotIndex ?? members.indexOf(null);
    if (index === -1) {
      toast('Equipe cheia! Solte o Pokémon sobre um slot (ou use ⇄) para substituir.');
      return false;
    }

    const replaced = members[index];
    members[index] = member;
    state.targetSlot = null;
    commitTeam();
    toast(replaced
      ? `${replaced.displayName} → ${member.displayName} (slot ${index + 1})`
      : `${member.displayName} adicionado ao slot ${index + 1}`);
    return true;
  }

  async function quickAdd(name, slotIndex) {
    try { addToTeam(await api.getPokemon(name), slotIndex); }
    catch (err) { toast(err.message); }
  }

  function swapSlots(from, to) {
    if (to < 0 || to >= TEAM_SIZE || from === to) return;
    const m = state.team.members;
    [m[from], m[to]] = [m[to], m[from]];
    state.targetSlot = null;
    commitTeam();
  }

  function chooseSlot(index) {
    state.targetSlot = index;
    renderTeam();
    setView('pokedex');
    toast(`Escolha o Pokémon para o slot ${index + 1}`);
  }

  function removeSlot(index) {
    state.team.members[index] = null;
    if (state.targetSlot === index) state.targetSlot = null;
    commitTeam();
  }

  const hasMembers = () => state.team.members.some(Boolean);

  function resetTeam() {
    state.team = newTeam();
    state.targetSlot = null;
    commitTeam();
  }

  /* ---------- Login (Firebase) ---------- */
  function renderAuth() {
    $('#auth-area').innerHTML = ui.authArea(state.user);
  }

  async function signIn() {
    if (!PTB.cloud?.available) {
      return toast(PTB.cloud?.reason || 'O Firebase não carregou. Abra pelo Live Server e verifique a internet.');
    }
    try { await PTB.cloud.signIn(); }
    catch (err) { toast(err.message); }
  }

  let cloudAttached = false;
  function attachCloud() {
    if (cloudAttached || !PTB.cloud) return;
    cloudAttached = true;
    if (!PTB.cloud.available) return; // continua em modo local

    let firstEvent = true;
    PTB.cloud.onAuthChange((user) => {
      state.user = user;
      // Logado → Firestore; deslogado → LocalStorage. O resto do app não percebe a troca.
      state.repository = user ? PTB.cloud.repositoryFor(user.uid) : teamRepository;
      renderAuth();
      if ($('#saved-dialog').open) refreshSaved();
      // O primeiro evento é só a sessão sendo restaurada ao abrir a página: sem aviso
      if (!firstEvent) toast(user ? `Bem-vindo(a), ${(user.displayName || 'treinador').split(' ')[0]}!` : 'Você saiu da conta.');
      firstEvent = false;
    });
  }

  /* ---------- Equipes salvas ---------- */
  async function saveTeam() {
    if (!hasMembers()) return toast('Adicione ao menos 1 Pokémon antes de salvar.');
    try {
      const saved = await state.repository.save({ ...state.team, name: state.team.name.trim() || 'Equipe sem nome' });
      state.team.id = saved.id;
      state.team.name = saved.name;
      commitTeam();
      toast(`Equipe "${saved.name}" salva ${state.user ? 'na sua conta' : 'neste navegador'}!`);
    } catch (err) { toast(`Não foi possível salvar: ${err.message}`); }
  }

  async function refreshSaved() {
    try {
      const teams = await state.repository.list();
      // Logado: conta quantas equipes locais ainda não existem na nuvem (para oferecer a importação)
      let importCount = 0;
      if (state.user) {
        const known = new Set(teams.map((t) => t.id));
        importCount = (await teamRepository.list()).filter((t) => !known.has(t.id)).length;
      }
      $('#saved-content').innerHTML = ui.savedList(teams, { user: state.user, importCount });
    } catch (err) {
      $('#saved-content').innerHTML = `<p class="muted">${utils.escapeHtml(err.message)}</p>`;
    }
  }

  async function openSaved() {
    const dialog = $('#saved-dialog');
    $('#saved-content').innerHTML = '<p class="muted center">Carregando…</p>';
    if (!dialog.open) dialog.showModal();
    await refreshSaved();
  }

  async function loadTeam(id) {
    const team = await state.repository.get(id);
    if (!team) return toast('Equipe não encontrada.');
    state.team = { id: team.id, name: team.name, members: padMembers(team.members) };
    state.targetSlot = null;
    commitTeam();
    $('#saved-dialog').close();
    setView('team');
    toast(`Equipe "${team.name}" carregada.`);
  }

  async function deleteTeam(id) {
    if (!confirm('Excluir esta equipe salva?')) return;
    await state.repository.remove(id);
    if (state.team.id === id) { state.team.id = null; draftStore.save(state.team); }
    await refreshSaved();
    toast('Equipe excluída.');
  }

  /** Copia as equipes do navegador para a conta. Mesmo id = reimportar não duplica. */
  async function importLocalTeams() {
    const local = await teamRepository.list();
    for (const team of local) await state.repository.save(team);
    toast(`${local.length} equipe(s) importada(s) para a sua conta.`);
    await refreshSaved();
  }

  /* ---------- Eventos (delegação: um único listener para todos os data-action) ---------- */
  document.addEventListener('click', (event) => {
    // Clique no fundo escurecido do <dialog> fecha o diálogo
    if (event.target instanceof HTMLDialogElement) { event.target.close(); return; }

    const el = event.target.closest('[data-action]');
    if (!el) return;
    const { action, name, id, view } = el.dataset;
    const index = Number(el.dataset.index);
    const safe = (promise) => promise.catch((err) => toast(err.message));

    const handlers = {
      'open-detail': () => openDetail(name),
      'quick-add': () => quickAdd(name),
      'select-form': () => openDetail(name),
      'close-dialog': () => el.closest('dialog').close(),
      'load-more': showMore,
      'retry-index': loadIndex,
      'set-view': () => setView(view),

      'add-current': () => { if (state.detail && addToTeam(state.detail.pokemon)) $('#detail-dialog').close(); },
      'replace-from-detail': () => {
        const slot = Number($('#replace-select').value);
        if (state.detail && addToTeam(state.detail.pokemon, slot)) $('#detail-dialog').close();
      },

      'open-member': () => openDetail(state.team.members[index].name),
      'move-prev': () => swapSlots(index, index - 1),
      'move-next': () => swapSlots(index, index + 1),
      'replace-slot': () => chooseSlot(index),
      'target-slot': () => chooseSlot(index),
      'remove-slot': () => removeSlot(index),
      'cancel-target': () => { state.targetSlot = null; renderTeam(); },

      'save-team': () => safe(saveTeam()),
      'new-team': () => { if (!hasMembers() || state.team.id || confirm('Descartar a equipe atual (não salva)?')) resetTeam(); },
      'clear-team': () => { if (hasMembers() && confirm('Remover todos os Pokémon da equipe?')) { state.team.members = emptyMembers(); state.targetSlot = null; commitTeam(); } },
      'open-saved': () => safe(openSaved()),
      'load-team': () => safe(loadTeam(id)),
      'delete-team': () => safe(deleteTeam(id)),
      'import-local': () => safe(importLocalTeams()),

      'sign-in': signIn,
      'sign-out': () => safe(PTB.cloud.signOut()),
    };
    handlers[action]?.();
  });

  // Teclado: Enter ou Espaço ativam os <div role="button"> (cards e slots)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = event.target;
    if (el.matches?.('div[role="button"][data-action]')) { event.preventDefault(); el.click(); }
  });

  // Busca: filtra enquanto digita; no "Enter" com 1 resultado abre os detalhes
  $('#search-input').addEventListener('input', utils.debounce(applyFilter, 200));
  $('#include-forms').addEventListener('change', applyFilter);
  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilter();
    if (state.filtered.length === 1) openDetail(state.filtered[0].name);
  });

  $('#team-name').addEventListener('input', (event) => {
    state.team.name = event.target.value;
    draftStore.save(state.team);
  });

  // Imagem quebrada: tenta a reserva (sprite pequeno); se também falhar, esconde
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.fallback) return;
    if (image.dataset.tried) { image.classList.add('img-missing'); return; }
    image.dataset.tried = '1';
    image.src = image.dataset.fallback;
  }, true);

  /* ---------- Arrastar e soltar ----------
     Dois tipos de arrasto:
       dragName → card da Pokédex sendo levado até a equipe
       dragFrom → slot da equipe sendo reorganizado
     (Em telas de toque o HTML5 drag não existe: use o botão ＋ e os botões ◀ ▶.) */
  let dragName = null;
  let dragFrom = null;

  function clearDrag() {
    document.querySelectorAll('.slot.dragging, .slot.drag-over').forEach((s) => s.classList.remove('dragging', 'drag-over'));
    document.body.classList.remove('dragging-pokemon');
    dragName = null;
    dragFrom = null;
  }

  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest?.('.dex-card');
    if (card) {
      dragName = card.dataset.name;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', dragName); // o Firefox exige algum dado para iniciar o arrasto
      document.body.classList.add('dragging-pokemon');
      return;
    }
    const slot = event.target.closest?.('.slot.filled');
    if (slot) {
      dragFrom = Number(slot.dataset.index);
      slot.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragFrom));
    }
  });

  document.addEventListener('dragover', (event) => {
    const slot = event.target.closest?.('.slot');
    const panel = event.target.closest?.('#panel-team');
    // Reorganizar: só pode soltar em slots. Vindo da Pokédex: slot ou qualquer parte do painel.
    const canDrop = dragFrom !== null ? slot : dragName !== null ? (slot || panel) : null;
    if (!canDrop) return;
    event.preventDefault(); // sem isso o navegador não permite soltar
    event.dataTransfer.dropEffect = dragName !== null ? 'copy' : 'move';
    slot?.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (event) => event.target.closest?.('.slot')?.classList.remove('drag-over'));

  document.addEventListener('drop', (event) => {
    const slot = event.target.closest?.('.slot');
    const panel = event.target.closest?.('#panel-team');

    if (dragFrom !== null && slot) {
      event.preventDefault();
      swapSlots(dragFrom, Number(slot.dataset.index));
    } else if (dragName !== null && (slot || panel)) {
      event.preventDefault();
      const name = dragName;
      // Solto num slot → vai para ele (substituindo se ocupado). Solto no painel → slot alvo ou primeiro vazio.
      const target = slot ? Number(slot.dataset.index) : undefined;
      clearDrag();
      quickAdd(name, target);
      return;
    }
    clearDrag();
  });

  document.addEventListener('dragend', clearDrag);

  /* ---------- Inicialização ---------- */
  const draft = draftStore.load();
  if (draft) state.team = { id: draft.id ?? null, name: draft.name || 'Minha equipe', members: padMembers(draft.members) };
  renderTeam();
  renderAuth();
  loadIndex();

  // O módulo do Firebase carrega depois dos scripts clássicos e avisa por este evento
  window.addEventListener('ptb:cloud-ready', attachCloud);
  attachCloud(); // caso o módulo já tenha terminado
})(window.PTB = window.PTB || {});