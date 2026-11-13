/* Camada de acesso à PokéAPI: requisições, tratamento de erros, cache e normalização. */
(function (PTB) {
  const { API_BASE, CACHE_PREFIX, CACHE_TTL_MS } = PTB.config;
  const { idFromUrl } = PTB.utils;

  class ApiError extends Error {
    constructor(message, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
  }

  /* ---------- Cache em 3 níveis ----------
     1) memória (Map)  2) localStorage com validade  3) requisições em andamento
     O nível 3 evita disparar a mesma requisição duas vezes se o usuário clicar rápido. */
  const memory = new Map();
  const inflight = new Map();

  function readStored(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const { t, v } = JSON.parse(raw);
      if (Date.now() - t > CACHE_TTL_MS) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
      return v;
    } catch { return null; }
  }

  function writeStored(key, value) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value })); }
    catch { /* cota cheia ou storage bloqueado: seguimos só com o cache em memória */ }
  }

  function cached(key, loader) {
    if (memory.has(key)) return Promise.resolve(memory.get(key));
    const stored = readStored(key);
    if (stored) { memory.set(key, stored); return Promise.resolve(stored); }
    if (inflight.has(key)) return inflight.get(key);

    const promise = loader()
      .then((value) => { memory.set(key, value); writeStored(key, value); return value; })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  async function fetchJson(url) {
    let response;
    try { response = await fetch(url); }
    catch { throw new ApiError('Sem conexão com a PokéAPI. Verifique sua internet.'); }
    if (response.status === 404) throw new ApiError('Não encontrado na PokéAPI.', 404);
    if (!response.ok) throw new ApiError(`A PokéAPI respondeu com erro (${response.status}).`, response.status);
    return response.json();
  }

  const english = (entries) => entries.filter((e) => e.language.name === 'en');
  const cleanText = (text) => text.replace(/[\n\f\r]+/g, ' ').trim();

  /* ---------- Normalizadores: guardamos só o que o app usa ---------- */
  function normalizePokemon(raw) {
    return {
      id: raw.id,
      name: raw.name,                       // ex.: "charizard-mega-x"
      speciesName: raw.species.name,        // ex.: "charizard"
      isDefault: raw.is_default,
      height: raw.height / 10,              // decímetros → metros
      weight: raw.weight / 10,              // hectogramas → kg
      types: [...raw.types].sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
      stats: raw.stats.map((s) => ({ key: s.stat.name, value: s.base_stat })),
      abilities: raw.abilities.map((a) => ({ name: a.ability.name, hidden: a.is_hidden })),
      artwork: raw.sprites?.other?.['official-artwork']?.front_default ?? null,
      sprite: raw.sprites?.front_default ?? null,
      formUrl: raw.forms?.[0]?.url ?? null, // endpoint /pokemon-form/
    };
  }

  function normalizeSpecies(raw) {
    const flavor = english(raw.flavor_text_entries).pop();
    return {
      id: raw.id,
      name: raw.name,
      genus: english(raw.genera)[0]?.genus ?? '',
      flavor: flavor ? cleanText(flavor.flavor_text) : '',
      generation: raw.generation?.name ?? '',
      isLegendary: raw.is_legendary,
      isMythical: raw.is_mythical,
      isBaby: raw.is_baby,
      // Variedades = formas jogáveis da espécie (regionais, Mega, Gigantamax...)
      varieties: raw.varieties.map((v) => ({ name: v.pokemon.name, isDefault: v.is_default })),
    };
  }

  function normalizeForm(raw) {
    return { name: raw.name, isMega: raw.is_mega, isBattleOnly: raw.is_battle_only, isDefault: raw.is_default };
  }

  function normalizeAbility(raw) {
    const entry = english(raw.effect_entries)[0];
    return { name: raw.name, effect: entry ? cleanText(entry.short_effect) : '' };
  }

  /* ---------- API pública ---------- */
  const key = (v) => String(v).toLowerCase();

  PTB.api = {
    ApiError,

    /** Lista leve de todos os Pokémon e formas ({id, name}); permite buscar sem uma requisição por tecla. */
    getIndex: () => cached('index', async () => {
      const data = await fetchJson(`${API_BASE}/pokemon?limit=100000&offset=0`);
      return data.results.map((r) => ({ id: idFromUrl(r.url), name: r.name }));
    }),

    getPokemon: (nameOrId) => cached(`pokemon:${key(nameOrId)}`,
      async () => normalizePokemon(await fetchJson(`${API_BASE}/pokemon/${key(nameOrId)}`))),

    getSpecies: (nameOrId) => cached(`species:${key(nameOrId)}`,
      async () => normalizeSpecies(await fetchJson(`${API_BASE}/pokemon-species/${key(nameOrId)}`))),

    getForm: (url) => cached(`form:${idFromUrl(url)}`,
      async () => normalizeForm(await fetchJson(url))),

    getAbility: (name) => cached(`ability:${key(name)}`,
      async () => normalizeAbility(await fetchJson(`${API_BASE}/ability/${key(name)}`))),
  };
})(window.PTB = window.PTB || {});