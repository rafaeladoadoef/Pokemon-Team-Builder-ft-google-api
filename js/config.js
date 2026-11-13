/* Configurações centrais. Mexer aqui evita "números mágicos" espalhados pelo código. */
(function (PTB) {
  PTB.config = {
    API_BASE: 'https://pokeapi.co/api/v2',
    // Repositório oficial de sprites da PokéAPI (as imagens são servidas por ele)
    SPRITES_BASE: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon',

    TEAM_SIZE: 6,
    PAGE_SIZE: 24,
    MAX_BASE_STAT: 255,          // maior atributo base possível, usado para escalar as barras
    FIRST_ALT_FORM_ID: 10000,    // na PokéAPI, ids acima disso são formas alternativas

    CACHE_PREFIX: 'ptb:cache:',
    CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 dias

    STORAGE_KEYS: { teams: 'ptb:teams', draft: 'ptb:draft' },
  };
})(window.PTB = window.PTB || {});