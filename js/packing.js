// Checklist de mala: modelos por tipo de viagem, montados a partir dos dias da viagem.
// O estado fica na viagem: t.packing = { types: [...], done: {key: true}, hidden: {key: true}, custom: [{key, text, cat}] }

export const PACK_CATS = {
  docs: '🪪 Documentos e dinheiro',
  roupas: '👕 Roupas e calçados',
  higiene: '🧴 Higiene',
  saude: '💊 Saúde',
  eletronicos: '🔌 Eletrônicos',
  acessorios: '🎒 Acessórios',
  praia: '🏖️ Praia e piscina',
  frio: '🧣 Frio',
  natureza: '🥾 Trilha e natureza',
  trabalho: '💼 Trabalho',
  carro: '🚗 Carro',
  criancas: '🧸 Crianças',
  camping: '⛺ Camping',
  outros: '📦 Outros',
};

// q(n): quantidade em função do número de dias da viagem (n)
const clothes = (n) => Math.min(Math.max(n, 1), 7); // viagens longas: conta com lavar roupa
const ITEMS = {
  base: [
    ['docs', 'doc-id', 'RG ou CNH'],
    ['docs', 'cartoes', 'Cartões e um pouco de dinheiro'],
    ['docs', 'reservas', 'Reservas salvas no celular (voo, hotel, carro)'],
    ['docs', 'plano-saude', 'Carteirinha do plano de saúde'],
    ['roupas', 'camisetas', 'Camisetas', (n) => clothes(n)],
    ['roupas', 'calcas', 'Calças / bermudas', (n) => Math.ceil(clothes(n) / 2)],
    ['roupas', 'intimas', 'Roupas íntimas', (n) => clothes(n) + 1],
    ['roupas', 'meias', 'Meias', (n) => clothes(n) + 1],
    ['roupas', 'pijama', 'Pijama'],
    ['roupas', 'roupa-noite', 'Roupa para sair à noite'],
    ['roupas', 'tenis', 'Tênis confortável'],
    ['roupas', 'chinelo', 'Chinelo'],
    ['roupas', 'casaco-leve', 'Casaco leve'],
    ['higiene', 'escova', 'Escova e pasta de dente'],
    ['higiene', 'desodorante', 'Desodorante'],
    ['higiene', 'shampoo', 'Shampoo e condicionador'],
    ['higiene', 'pente', 'Pente / escova de cabelo'],
    ['higiene', 'barbear', 'Itens de barbear ou maquiagem'],
    ['higiene', 'hidratante', 'Hidratante'],
    ['saude', 'remedios', 'Remédios de uso contínuo'],
    ['saude', 'analgesico', 'Analgésico / antitérmico'],
    ['saude', 'estomago', 'Remédio para enjoo e estômago'],
    ['saude', 'curativos', 'Curativos'],
    ['eletronicos', 'carregador', 'Celular e carregador'],
    ['eletronicos', 'powerbank', 'Power bank'],
    ['eletronicos', 'fones', 'Fones de ouvido'],
    ['acessorios', 'oculos-sol', 'Óculos de sol'],
    ['acessorios', 'garrafa', 'Garrafa de água'],
    ['acessorios', 'roupa-suja', 'Sacola para roupa suja'],
    ['acessorios', 'cadeado', 'Cadeado de mala'],
  ],
  praia: [
    ['praia', 'banho', 'Roupas de banho', (n) => Math.min(Math.max(2, Math.ceil(n / 2)), 4)],
    ['praia', 'saida', 'Saída de praia / camiseta de praia'],
    ['praia', 'protetor', 'Protetor solar'],
    ['praia', 'pos-sol', 'Pós-sol'],
    ['praia', 'chapeu', 'Chapéu ou boné'],
    ['praia', 'toalha-praia', 'Toalha de praia'],
    ['praia', 'bolsa-estanque', 'Bolsa estanque para o celular'],
    ['praia', 'repelente', 'Repelente'],
    ['praia', 'bolsa-praia', 'Bolsa de praia / canga'],
  ],
  frio: [
    ['frio', 'casaco-pesado', 'Casaco pesado'],
    ['frio', 'segunda-pele', 'Segunda pele (blusa e calça)'],
    ['frio', 'gorro', 'Gorro, luvas e cachecol'],
    ['frio', 'bota', 'Bota impermeável'],
    ['frio', 'meia-termica', 'Meias térmicas', (n) => Math.min(Math.max(2, Math.ceil(n / 2)), 5)],
    ['frio', 'labial', 'Hidratante labial'],
    ['frio', 'guarda-chuva', 'Guarda-chuva'],
  ],
  cidade: [
    ['roupas', 'roupa-restaurante', 'Roupa para restaurante / evento'],
    ['acessorios', 'mochila-passeio', 'Mochila pequena de passeio'],
    ['frio', 'guarda-chuva', 'Guarda-chuva'],
    ['docs', 'transporte', 'Cartão de transporte / app de mobilidade'],
  ],
  natureza: [
    ['natureza', 'bota-trilha', 'Bota ou tênis de trilha'],
    ['praia', 'repelente', 'Repelente'],
    ['praia', 'protetor', 'Protetor solar'],
    ['natureza', 'lanterna', 'Lanterna'],
    ['natureza', 'mochila-ataque', 'Mochila de ataque'],
    ['natureza', 'capa-chuva', 'Capa de chuva'],
    ['natureza', 'primeiros-socorros', 'Kit de primeiros socorros'],
    ['natureza', 'lanches', 'Lanches para a trilha'],
    ['natureza', 'roupa-dryfit', 'Roupa de secagem rápida', (n) => Math.min(Math.max(2, Math.ceil(n / 2)), 4)],
  ],
  trabalho: [
    ['trabalho', 'roupa-social', 'Roupas sociais', (n) => clothes(n)],
    ['trabalho', 'sapato-social', 'Sapato social'],
    ['trabalho', 'notebook', 'Notebook e carregador'],
    ['trabalho', 'cartoes-visita', 'Cartões de visita'],
    ['trabalho', 'docs-reuniao', 'Documentos da reunião'],
    ['eletronicos', 'adaptador-hdmi', 'Adaptadores (HDMI, USB-C)'],
  ],
  internacional: [
    ['docs', 'passaporte', 'Passaporte (validade 6+ meses)'],
    ['docs', 'visto', 'Visto, se o destino exigir'],
    ['docs', 'seguro', 'Seguro viagem'],
    ['docs', 'copias', 'Cópias dos documentos (papel e nuvem)'],
    ['docs', 'moeda', 'Cartão internacional / moeda local'],
    ['docs', 'vacina', 'Certificado de vacinação, se exigido'],
    ['eletronicos', 'adaptador', 'Adaptador de tomada'],
    ['eletronicos', 'chip', 'Chip internacional ou eSIM'],
  ],
  carro: [
    ['carro', 'cnh', 'CNH dentro da validade'],
    ['carro', 'cartao-caucao', 'Cartão de crédito para a caução'],
    ['carro', 'suporte', 'Suporte de celular'],
    ['carro', 'carregador-carro', 'Carregador veicular e cabo'],
    ['carro', 'offline', 'Mapas e playlists offline'],
    ['carro', 'tag', 'Tag de pedágio / dinheiro para pedágio'],
  ],
  criancas: [
    ['criancas', 'fraldas', 'Fraldas e lenços umedecidos'],
    ['criancas', 'mamadeira', 'Mamadeira / copo'],
    ['criancas', 'remedios-inf', 'Remédios infantis'],
    ['criancas', 'brinquedos', 'Brinquedos, livros e tablet'],
    ['criancas', 'carrinho', 'Carrinho e cadeirinha'],
    ['criancas', 'lanchinhos', 'Lanchinhos'],
    ['criancas', 'trocas', 'Trocas extras de roupa', (n) => Math.min(Math.max(2, n), 6)],
    ['criancas', 'autorizacao', 'Autorização de viagem do menor, se precisar'],
  ],
  camping: [
    ['camping', 'barraca', 'Barraca'],
    ['camping', 'saco-dormir', 'Saco de dormir'],
    ['camping', 'isolante', 'Isolante térmico'],
    ['camping', 'lanterna-cabeca', 'Lanterna de cabeça'],
    ['camping', 'fogareiro', 'Fogareiro e gás'],
    ['camping', 'panelas', 'Kit de panelas e talheres'],
    ['camping', 'canivete', 'Canivete'],
    ['camping', 'lixo', 'Sacos de lixo'],
  ],
};

export const TRIP_TYPES = {
  praia: { icon: '🏖️', label: 'Praia' },
  frio: { icon: '❄️', label: 'Frio' },
  cidade: { icon: '🏙️', label: 'Cidade' },
  natureza: { icon: '🥾', label: 'Natureza / trilha' },
  trabalho: { icon: '💼', label: 'Trabalho' },
  internacional: { icon: '🌎', label: 'Internacional' },
  carro: { icon: '🚗', label: 'Viagem de carro' },
  criancas: { icon: '🧸', label: 'Com crianças' },
  camping: { icon: '⛺', label: 'Camping' },
};

/** Tipos sugeridos para uma viagem nova: carro alugado e moeda estrangeira são detectados. */
export function suggestTypes(t) {
  const out = [];
  if ((t.cars || []).length) out.push('carro');
  if (t.currency && t.currency !== 'BRL') out.push('internacional');
  return out;
}

export function ensurePacking(t) {
  if (!t.packing) t.packing = { types: suggestTypes(t), done: {}, hidden: {}, custom: [] };
  const pk = t.packing;
  pk.types ||= []; pk.done ||= {}; pk.hidden ||= {}; pk.custom ||= [];
  return pk;
}

/**
 * Lista montada: itens do básico + dos tipos escolhidos (sem repetir) + itens próprios.
 * Retorna {groups: [{cat, label, items:[{key, text, qty, done, custom}]}], total, done, hidden}.
 */
export function packingList(t, days) {
  const pk = ensurePacking(t);
  const seen = new Map();
  for (const type of ['base', ...pk.types]) {
    for (const [cat, key, text, qtyFn] of ITEMS[type] || []) {
      if (seen.has(key)) continue;
      seen.set(key, { key, cat, text, qty: qtyFn ? qtyFn(days) : null, custom: false });
    }
  }
  for (const c of pk.custom) if (!seen.has(c.key)) seen.set(c.key, { ...c, qty: null, custom: true });
  const visible = [...seen.values()].filter((x) => !pk.hidden[x.key]);
  const hiddenCount = seen.size - visible.length;
  const groups = Object.entries(PACK_CATS)
    .map(([cat, label]) => ({ cat, label, items: visible.filter((x) => x.cat === cat).map((x) => ({ ...x, done: !!pk.done[x.key] })) }))
    .filter((g) => g.items.length);
  const total = visible.length;
  const done = visible.filter((x) => pk.done[x.key]).length;
  return { groups, total, done, hidden: hiddenCount };
}
