/* Funções utilitárias puras (sem acesso ao DOM e sem estado). */
(function (PTB) {
  const { SPRITES_BASE } = PTB.config;

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const prettyName = (slug) => slug.split('-').map(capitalize).join(' ');
  const idFromUrl = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);
  const pad = (n) => String(n).padStart(4, '0');
  const uid = () => 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /** Escapa HTML: obrigatório para qualquer texto que vá para innerHTML (ex.: nome da equipe). */
  function escapeHtml(value) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
  }

  function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // Imagens derivadas do id (padrão do repositório de sprites da PokéAPI)
  const artworkUrl = (id) => `${SPRITES_BASE}/other/official-artwork/${id}.png`;
  const spriteUrl = (id) => `${SPRITES_BASE}/${id}.png`;

  /* ---------- Formas alternativas ----------
     A PokéAPI nomeia variedades como "<espécie>-<sufixo>" (ex.: charizard-mega-x).
     Extraímos o sufixo para montar um rótulo e uma categoria. */
  const FORM_WORDS = {
    alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea',
    mega: 'Mega', gmax: 'Gigantamax', primal: 'Primal', eternamax: 'Eternamax',
    x: 'X', y: 'Y', z: 'Z',
  };
  const REGIONAL = ['alola', 'galar', 'hisui', 'paldea'];

  function formInfo(speciesName, pokemonName) {
    if (pokemonName === speciesName) return { label: 'Normal', category: 'base' };
    const suffix = pokemonName.startsWith(speciesName + '-')
      ? pokemonName.slice(speciesName.length + 1)
      : pokemonName;
    const parts = suffix.split('-');
    const label = parts.map((p) => FORM_WORDS[p] || capitalize(p)).join(' ');

    let category = 'other';
    if (parts.includes('gmax')) category = 'gmax';
    else if (parts.includes('mega') || parts.includes('primal')) category = 'mega';
    else if (parts.some((p) => REGIONAL.includes(p))) category = 'regional';
    return { label, category };
  }

  function displayName(speciesName, pokemonName) {
    const info = formInfo(speciesName, pokemonName);
    const base = prettyName(speciesName);
    return info.label === 'Normal' ? base : `${base} (${info.label})`;
  }

  /** Versão enxuta do Pokémon que é guardada dentro da equipe (não precisa refazer requisição). */
  function toMember(p) {
    return {
      id: p.id,
      name: p.name,
      speciesName: p.speciesName,
      displayName: displayName(p.speciesName, p.name),
      types: p.types,
      stats: p.stats,
      artwork: p.artwork,
      sprite: p.sprite,
    };
  }

  PTB.utils = {
    capitalize, prettyName, idFromUrl, pad, uid, escapeHtml, debounce,
    artworkUrl, spriteUrl, formInfo, displayName, toMember,
  };
})(window.PTB = window.PTB || {});