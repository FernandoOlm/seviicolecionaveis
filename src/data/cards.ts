
export type Finish = "Normal" | "Foil" | "Reverse Foil" | "Pokebola" | "Masterball" | "Rocket" | "Energia" | "Promo" | "Ímã" | "Shattered Holo" | "Illustration Rare" | "Ultra Rara" | "Black Star Promo" | "Double Rare" | "Liga";
export type Language = "Português" | "Inglês" | "Italiano" | "Espanhol" | "Japonês" | "Chinês";
export type Condition = "M" | "NM" | "SP" | "MP" | "HP" | "D";
export type CardCategory = "Pokémon" | "Treinador" | "Energia";

export const CARD_CATEGORIES: CardCategory[] = ["Pokémon", "Treinador", "Energia"];

export type TrainerSubcategory = "Apoiador" | "Item" | "Ferramenta Pokémon" | "Estádio" | "Ace Spec";
export const TRAINER_SUBCATEGORIES: TrainerSubcategory[] = ["Apoiador", "Item", "Ferramenta Pokémon", "Estádio", "Ace Spec"];

export type LigaSubcategory = "Double Rare" | "Foil" | "Normal";
export const LIGA_SUBCATEGORIES: LigaSubcategory[] = ["Double Rare", "Foil", "Normal"];

export type PokemonType =
  | "Água"
  | "Planta"
  | "Lutador"
  | "Fogo"
  | "Elétrico"
  | "Psíquico"
  | "Incolor"
  | "Sombrio"
  | "Metálico"
  | "Fada"
  | "Dragão";
export const POKEMON_TYPES: PokemonType[] = [
  "Água",
  "Planta",
  "Lutador",
  "Fogo",
  "Elétrico",
  "Psíquico",
  "Incolor",
  "Sombrio",
  "Metálico",
  "Fada",
  "Dragão",
];

export const CONDITIONS: Condition[] = ["M", "NM", "SP", "MP", "HP", "D"];
export const CONDITION_LABEL: Record<Condition, string> = {
  M: "M (Lacrada)",
  NM: "NM (Praticamente nova)",
  SP: "SP (Levemente usada)",
  MP: "MP (Moderadamente usada)",
  HP: "HP (Muito usada)",
  D: "D (Danificada)",
};

export interface RawCard {
  id: number;
  name: string;
  image: string;
  number: string;
  collection: string;
  finish: Finish;
  language: Language;
  condition: Condition;
  stock: number;
  price: number | null;
  category?: CardCategory;
  trainerSubcategory?: TrainerSubcategory | null;
  pokemonType?: PokemonType | null;
  illustratorId?: string | null;
}

export interface FinishVariant {
  finish: Finish;
  condition: Condition;
  stock: number;
  price: number | null;
}

export interface LanguageVariant {
  language: Language;
  finishes: FinishVariant[];
  stock: number;
}

export interface Card {
  id: string;
  name: string;
  image: string;
  number: string;
  collection: string;
  languages: LanguageVariant[];
  variants: FinishVariant[];
  language: Language;
  stock: number;
  price: number | null;
  finish: Finish;
  category: CardCategory;
  trainerSubcategory?: TrainerSubcategory | null;
  pokemonType?: PokemonType | null;
  illustratorId?: string | null;
}


// Coleções adicionadas manualmente a pedido (mantidas mesmo sem estoque cadastrado)
export const EXTRA_COLLECTIONS = [
  "CES - Tempestade Celestial",
  "CEC - Eclipse Cósmico",
  "MEW - 151",
  "VIV - Voltagem Vívida",
  "ASR - Estrelas Radiantes",
  "TEF - Forças Temporais",
  "SSH - Espada e Escudo",
  "CRI - Caos Ascendente",
  "CEL - Celebrações",
  "CPA - Caminho do Campeão",
  "CRE - Reinado Arrepiante",
  "EVS - Céus em Evolução",
  "PGO - Pokémon Go",
  "SM11 - Sintonia Mental",
  "BKT - Turbo Revolução",
  "TEU - União de Aliados",
  "EVO - Evolutions",
  "FLF - Flash de Fogo",
  "UPR - Ultraprisma",
  "FST - Golpe Fusão",
  "TK6B - XY Trainer Kit - Sylveon",
  "ROS - Céus Estrondosos",
  "DRX - Dragões Enaltecidos",
  "BKP - Turbo Colisão",
  "PPPS6 - Play! Pokémon Prize Pack Series Six",
  "XYPR - XY Promos",
  "SIT - Tempestade Prateada",
  "XY - XY",
  "UNB - Elos Inquebráveis",
  "BCR - Fronteiras Cruzadas",
  "BCR - Fronteiras Cruzadas",
  "EPO - Poderes Emergentes",
  "BLW - Black and White",
  "HIF - Destinos Ocultos",
  "M4 - Ninja Spinner",
  "PBL - Escuridão Absoluta",
  "PZ8 - Play! Pokémon Prize Pack Series Eight",
  "PZ7 - Play! Pokémon Prize Pack Series Seven",
  "PZ6 - Play! Pokémon Prize Pack Series Six",
  "PZ5 - Play! Pokémon Prize Pack Series Five",
  "PZ4 - Play! Pokémon Prize Pack Series Four",
  "30C - Celebração de 30 Anos",
];

const BASE_COLLECTIONS = ["ASC - Heróis Excelsos","BLK - Raio Preto","DRI - Rivais Predestinados","GRI - Guardiões Ascendentes","JTG -Amigos de Jornada","LOR - Origem Perdida","MEG - Mega Evolução","PAF - Destinos de Paldea","PAL - Evoluções de Paldea","PAR - Fenda Paradoxal","PFL - Fogo Fantasmagorico","POR - Equilíbrio Perfeito","PRE - Evoluções Prismátricas","RS - Rubi & Safira","SCR - Coroa Estelar","SM - Sol e Lua","SSP - Fagulhas Impetuosas","SVI - Escarlate e Violeta","TRR - Team Rocket Returns","TWM - Máscaras do Crepúsculo","WHT - Fogo Branco"];

export const COLLECTIONS = Array.from(new Set([...BASE_COLLECTIONS, ...EXTRA_COLLECTIONS])).sort();

export const FINISHES: Finish[] = ["Normal", "Reverse Foil", "Foil", "Pokebola", "Masterball", "Rocket", "Energia", "Promo", "Shattered Holo", "Illustration Rare", "Ultra Rara", "Black Star Promo", "Double Rare", "Liga"];

export const LANGUAGES: Language[] = ["Português", "Inglês", "Italiano", "Espanhol", "Japonês", "Chinês"];
