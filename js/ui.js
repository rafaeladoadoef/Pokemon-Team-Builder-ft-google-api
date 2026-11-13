/* Camada de apresentação: só transforma dados em HTML (strings). Não guarda estado. */
(function (PTB) {
  const { escapeHtml: esc, prettyName, pad, artworkUrl, spriteUrl, formInfo, displayName } = PTB.utils;
  const { TEAM_SIZE, MAX_BASE_STAT, FIRST_ALT_FORM_ID } = PTB.config;

  // [nome em português, ícone]. Emojis funcionam offline; dá para trocar por SVGs depois.
  const TYPE_META = {
    normal: ['Normal', '⚪'], fire: ['Fogo', '🔥'], water: ['Água', '💧'], electric: ['Elétrico', '⚡'],
    grass: ['Planta', '🌿'], ice: ['Gelo', '❄️'], fighting: ['Lutador', '🥊'], poison: ['Veneno', '☠️'],
    ground: ['Terra', '⛰️'], flying: ['Voador', '🕊️'], psychic: ['Psíquico', '🔮'], bug: ['Inseto', '🐛'],
    rock: ['Pedra', '🪨'], ghost: ['Fantasma', '👻'], dragon: ['Dragão', '🐉'], dark: ['Sombrio', '🌙'],
    steel: ['Aço', '⚙️'], fairy: ['Fada', '✨'],
  };

  const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
  const STAT_LABELS = {
    hp: 'HP', attack: 'Ataque', defense: 'Defesa',
    'special-attack': 'Atq. Esp.', 'special-defense': 'Def. Esp.', speed: 'Velocidade',
  };

  const typeBadge = (type) => {
    const [label, icon] = TYPE_META[type] || [prettyName(type), '❔'];
    return `<span class="type type-${esc(type)}"><span aria-hidden="true">${icon}</span>${esc(label)}</span>`;
  };

  /** <img> com imagem reserva (tratada no listener global de erro do app.js).
   *  draggable="false" evita que a imagem em si seja arrastada no lugar do card. */
  const img = (src, fallback, alt = '', cls = '') =>
    `<img class="${cls}" src="${esc(src)}" data-fallback="${esc(fallback)}" alt="${esc(alt)}" loading="lazy" draggable="false">`;

  function statBar(key, value) {
    const pct = Math.min(100, Math.round((value / MAX_BASE_STAT) * 100));
    const hue = Math.round((Math.min(value, 180) / 180) * 120); // 0 = vermelho → 120 = verde
    return `<div class="stat">
      <span class="stat-name">${esc(STAT_LABELS[key] || prettyName(key))}</span>
      <b class="stat-val">${value}</b>
      <div class="bar"><i style="--pct:${pct}%;--hue:${hue}"></i></div>
    </div>`;
  }

  /* ---------- Login ---------- */
  function authArea(user) {
    if (!user) {
      return '<button class="btn btn-primary btn-sm" type="button" data-action="sign-in">🔐 Entrar com Google</button>';
    }
    const firstName = (user.displayName || user.email || 'Treinador').split(' ')[0];
    const avatar = user.photoURL
      ? `<img class="avatar" src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer" draggable="false">`
      : '<span class="avatar avatar-fallback" aria-hidden="true">🙂</span>';
    return `${avatar}<span class="auth-name">${esc(firstName)}</span>
      <button class="btn btn-ghost btn-sm" type="button" data-action="sign-out">Sair</button>`;
  }

  /* ---------- Pokédex ----------
     O card é arrastável (draggable). O "botão" principal é uma <div role="button"> porque o
     Firefox não inicia arrasto a partir de dentro de um <button>. */
  function dexCard({ id, name }) {
    const label = prettyName(name);
    const number = id < FIRST_ALT_FORM_ID ? `#${pad(id)}` : 'Forma';
    return `<article class="dex-card" draggable="true" data-name="${esc(name)}" title="Arraste até a equipe">
      <div class="dex-open" role="button" tabindex="0" data-action="open-detail" data-name="${esc(name)}">
        <span class="dex-num">${number}</span>
        ${img(artworkUrl(id), spriteUrl(id), label)}
        <h3>${esc(label)}</h3>
      </div>
      <button class="icon-btn add-btn" type="button" data-action="quick-add" data-name="${esc(name)}"
              aria-label="Adicionar ${esc(label)} à equipe" title="Adicionar à equipe">＋</button>
    </article>`;
  }

  /* ---------- Equipe ---------- */
  function teamSlot(member, index, targetSlot) {
    const targeted = targetSlot === index ? ' targeted' : '';

    if (!member) {
      return `<button class="slot empty${targeted}" type="button" data-action="target-slot" data-index="${index}">
        <span class="slot-index">${index + 1}</span>
        <span class="slot-plus">＋</span><span>Slot vazio</span>
      </button>`;
    }

    return `<div class="slot filled${targeted}" draggable="true" data-index="${index}">
      <span class="slot-index">${index + 1}</span>
      <div class="slot-main" role="button" tabindex="0" data-action="open-member" data-index="${index}" title="Ver detalhes">
        ${img(member.artwork || spriteUrl(member.id), spriteUrl(member.id), member.displayName, 'slot-img')}
        <strong>${esc(member.displayName)}</strong>
        <span class="types">${member.types.map(typeBadge).join('')}</span>
      </div>
      <div class="slot-tools">
        <button class="icon-btn" type="button" data-action="move-prev" data-index="${index}" title="Mover para trás" aria-label="Mover para trás" ${index === 0 ? 'disabled' : ''}>◀</button>
        <button class="icon-btn" type="button" data-action="move-next" data-index="${index}" title="Mover para frente" aria-label="Mover para frente" ${index === TEAM_SIZE - 1 ? 'disabled' : ''}>▶</button>
        <button class="icon-btn" type="button" data-action="replace-slot" data-index="${index}" title="Substituir" aria-label="Substituir">⇄</button>
        <button class="icon-btn" type="button" data-action="remove-slot" data-index="${index}" title="Remover" aria-label="Remover">✕</button>
      </div>
    </div>`;
  }

  function targetBanner(slotIndex) {
    return `<span>Escolha o Pokémon para o <b>slot ${slotIndex + 1}</b></span>
      <button class="link-btn" type="button" data-action="cancel-target">Cancelar</button>`;
  }

  function teamSummary(members) {
    const filled = members.filter(Boolean);
    if (!filled.length) return '<p class="muted">Adicione Pokémon para ver o resumo da equipe.</p>';

    const averages = STAT_ORDER.map((key) => {
      const sum = filled.reduce((total, m) => total + (m.stats.find((s) => s.key === key)?.value || 0), 0);
      return statBar(key, Math.round(sum / filled.length));
    }).join('');

    const tally = {};
    filled.forEach((m) => m.types.forEach((t) => { tally[t] = (tally[t] || 0) + 1; }));
    const types = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `<span>${typeBadge(type)}${count > 1 ? ` ×${count}` : ''}</span>`)
      .join('');

    return `<h3>Média dos atributos base</h3>${averages}
      <h3 style="margin-top:12px">Tipos na equipe</h3><div class="type-tally">${types}</div>`;
  }

  /* ---------- Detalhes ---------- */
  const closeButton = '<button class="dialog-close" type="button" data-action="close-dialog" aria-label="Fechar">✕</button>';

  const detailLoading = () =>
    `<div class="detail">${closeButton}<div class="loader"><span class="pokeball spin"></span><p>Carregando…</p></div></div>`;

  const detailError = (message) =>
    `<div class="detail">${closeButton}<div class="loader"><p>😕 ${esc(message)}</p></div></div>`;

  function detailView({ pokemon: p, species: s, form, abilities }, { members, targetSlot }) {
    const info = formInfo(s.name, p.name);
    const total = p.stats.reduce((sum, x) => sum + x.value, 0);
    const generation = s.generation ? s.generation.replace('generation-', '').toUpperCase() : '';

    const badges = [
      generation && `Geração ${generation}`,
      s.isLegendary && 'Lendário', s.isMythical && 'Mítico', s.isBaby && 'Bebê',
      (form?.isMega || info.category === 'mega') && 'Mega Evolução',
      info.category === 'gmax' && 'Gigantamax',
      form?.isBattleOnly && 'Só em batalha',
    ].filter(Boolean).map((b) => `<span class="tag">${esc(b)}</span>`).join('');

    const formsHtml = s.varieties.length > 1
      ? `<div class="forms">${s.varieties.map((v) => {
          const vi = formInfo(s.name, v.name);
          const active = v.name === p.name;
          return `<button type="button" class="chip cat-${vi.category}${active ? ' active' : ''}"
                    data-action="select-form" data-name="${esc(v.name)}" ${active ? 'aria-current="true"' : ''}>${esc(vi.label)}</button>`;
        }).join('')}</div>`
      : '<p class="muted">A PokéAPI não registra formas alternativas para esta espécie.</p>';

    const abilitiesHtml = p.abilities.map((a, i) => `<li>
        <div><strong>${esc(prettyName(a.name))}</strong> ${a.hidden ? '<span class="tag">Oculta</span>' : ''}</div>
        <p>${esc(abilities[i]?.effect || 'Descrição indisponível.')}</p>
      </li>`).join('');

    // Rodapé: muda conforme o estado da equipe
    const alreadyAt = members.findIndex((m) => m && m.name === p.name);
    let actions;
    if (targetSlot !== null) {
      actions = `<button class="btn btn-primary" type="button" data-action="add-current">Colocar no slot ${targetSlot + 1}</button>`;
    } else if (alreadyAt !== -1) {
      actions = `<span class="muted">✔ Já está no slot ${alreadyAt + 1} da equipe</span>`;
    } else if (members.includes(null)) {
      actions = '<button class="btn btn-primary" type="button" data-action="add-current">＋ Adicionar à equipe</button>';
    } else {
      actions = `<label class="replace-row">Equipe cheia. Substituir:
          <select id="replace-select">${members.map((m, i) => `<option value="${i}">${i + 1}. ${esc(m.displayName)}</option>`).join('')}</select>
        </label>
        <button class="btn btn-primary" type="button" data-action="replace-from-detail">⇄ Substituir</button>`;
    }

    return `<div class="detail">
      ${closeButton}
      <div class="detail-hero type-${esc(p.types[0])}">
        ${img(p.artwork || artworkUrl(p.id), spriteUrl(p.id), displayName(s.name, p.name), 'detail-art')}
        <div class="hero-info">
          <span class="dex-num">Pokédex #${pad(s.id)}</span>
          <h2>${esc(displayName(s.name, p.name))}</h2>
          <p class="genus">${esc(s.genus)}</p>
          <div class="types">${p.types.map(typeBadge).join('')}</div>
          <div class="tags">${badges}</div>
        </div>
      </div>
      ${s.flavor ? `<p class="flavor">“${esc(s.flavor)}”</p>` : ''}
      <section><h3>Formas</h3>${formsHtml}</section>
      <section><h3>Atributos base — ${esc(info.label)}</h3>
        ${p.stats.map((x) => statBar(x.key, x.value)).join('')}
        <p class="stat-total">Total: <b>${total}</b></p>
      </section>
      <section><h3>Habilidades</h3><ul class="ability-list">${abilitiesHtml}</ul></section>
      <section class="physical">
        <div><span class="muted">Altura</span><b>${p.height} m</b></div>
        <div><span class="muted">Peso</span><b>${p.weight} kg</b></div>
      </section>
      <div class="detail-actions">${actions}</div>
    </div>`;
  }

  /* ---------- Equipes salvas ---------- */
  function savedList(teams, { user = null, importCount = 0 } = {}) {
    const where = user
      ? '<p class="muted">☁️ Salvas na sua conta Google</p>'
      : '<p class="muted">💾 Salvas somente neste navegador. Entre com o Google para guardá-las na nuvem.</p>';

    const importBox = user && importCount > 0
      ? `<div class="banner" style="margin-top:12px">
          <span>${importCount} equipe(s) salva(s) neste navegador.</span>
          <button class="btn btn-ghost btn-sm" type="button" data-action="import-local">Importar para a conta</button>
        </div>`
      : '';

    if (!teams.length) {
      return `${where}${importBox}<p class="muted center" style="margin-top:20px">Nenhuma equipe salva ainda.</p>`;
    }

    return `${where}${importBox}<ul class="saved-list">${teams.map((t) => `<li class="saved-item">
      <div class="saved-info">
        <strong>${esc(t.name)}</strong>
        <span class="muted">${esc(new Date(t.updatedAt).toLocaleString('pt-BR'))}</span>
        <div class="mini-row">${t.members.filter(Boolean).map((m) =>
          img(m.sprite || spriteUrl(m.id), spriteUrl(m.id), m.displayName, 'mini')).join('')}</div>
      </div>
      <div class="saved-actions">
        <button class="btn btn-primary btn-sm" type="button" data-action="load-team" data-id="${esc(t.id)}">Carregar</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="delete-team" data-id="${esc(t.id)}">Excluir</button>
      </div>
    </li>`).join('')}</ul>`;
  }

  PTB.ui = {
    authArea, dexCard, teamSlot, targetBanner, teamSummary,
    detailLoading, detailError, detailView, savedList,
  };
})(window.PTB = window.PTB || {});