/**
 * Demo packs (CLAUDE.md §11, §13 2026-11-14): every product is a complete A→Z game asset pack.
 * The 21 categories are SECTIONS inside a pack (Nhân vật, Bản đồ, Quái vật…), not separate products.
 * All flagged isDemoData. Prices are in VND; sales/download numbers are illustrative demo values only.
 */
import { CATEGORIES, type L3 } from "./catalog";

export type PackSeed = {
  slug: string;
  type: "FREE" | "PREMIUM";
  priceVnd: number;
  /** Optional sale "was" price (must be greater than priceVnd). */
  compareAtPriceVnd?: number;
  genres: string[];
  styles?: string[];
  featured?: boolean;
  /** Published this many days ago (drives "newest"). */
  daysAgo: number;
  /** Demo popularity: sales for paid packs, downloads for free ones. */
  popularity: number;
  version?: string;
  /** Multiplier for the demo asset count of each section (1 = a full pack). */
  scale: number;
  /** Category slugs included as sections, in CATEGORIES order. */
  sections: string[];
  title: L3;
  short: L3;
};

const ALL = CATEGORIES.map((c) => c.slug);
const without = (...slugs: string[]) => ALL.filter((s) => !slugs.includes(s));

export const PRODUCTS: PackSeed[] = [
  {
    slug: "tien-hiep-dao-mon",
    type: "PREMIUM",
    priceVnd: 1_490_000,
    compareAtPriceVnd: 1_890_000,
    genres: ["xianxia", "cultivation", "mmorpg"],
    featured: true,
    daysAgo: 2,
    popularity: 214,
    version: "1.3.0",
    scale: 1.2,
    sections: ALL,
    title: { vi: "Tiên Hiệp Đạo Môn", en: "Immortal Dao Sect", zh: "仙侠道门" },
    short: {
      vi: "Trọn bộ A→Z cho game tiên hiệp: nhân vật, tông môn, yêu thú, kiếm quyết, giao diện tu luyện và hơn thế nữa.",
      en: "A complete A→Z xianxia kit: characters, sects, demon beasts, sword arts, cultivation UI and more.",
      zh: "仙侠游戏全套 A→Z 素材：角色、宗门、妖兽、剑诀、修炼界面等。",
    },
  },
  {
    slug: "kiem-hiep-giang-ho",
    type: "PREMIUM",
    priceVnd: 1_290_000,
    genres: ["wuxia", "martial-arts", "mmorpg"],
    featured: true,
    daysAgo: 6,
    popularity: 187,
    version: "1.1.0",
    scale: 1,
    sections: without("cultivation", "technical"),
    title: { vi: "Kiếm Hiệp Giang Hồ", en: "Wuxia Jianghu", zh: "剑侠江湖" },
    short: {
      vi: "Thế giới giang hồ trọn gói: hiệp khách, khách điếm, võ đài, chiêu thức kiếm pháp và bang hội.",
      en: "A full jianghu world: wandering heroes, inns, arenas, sword techniques and guilds.",
      zh: "完整江湖世界：侠客、客栈、擂台、剑法招式与帮会。",
    },
  },
  {
    slug: "son-hai-than-thoai",
    type: "PREMIUM",
    priceVnd: 1_690_000,
    genres: ["mythology", "xuanhuan", "mmorpg"],
    featured: true,
    daysAgo: 10,
    popularity: 142,
    scale: 1.3,
    sections: ALL,
    title: { vi: "Sơn Hải Thần Thoại", en: "Mountains & Seas Mythos", zh: "山海神话" },
    short: {
      vi: "Thần thú Sơn Hải Kinh, thần điện, thiên cung và boss thần thoại cho MMORPG quy mô lớn.",
      en: "Classic of Mountains and Seas beasts, temples, heavenly palaces and mythic bosses for large MMORPGs.",
      zh: "山海经神兽、神殿、天宫与神话首领，适合大型 MMORPG。",
    },
  },
  {
    slug: "tu-tien-phi-thang",
    type: "PREMIUM",
    priceVnd: 1_190_000,
    genres: ["cultivation", "xianxia", "rpg"],
    daysAgo: 15,
    popularity: 133,
    scale: 0.9,
    sections: without("audio", "fonts-text", "social", "pvp-war"),
    title: { vi: "Tu Tiên Phi Thăng", en: "Cultivation Ascension", zh: "修仙飞升" },
    short: {
      vi: "Hành trình tu luyện từ luyện khí đến phi thăng: pháp trận, thiên kiếp, đan dược và bảng tu vi.",
      en: "From qi refining to ascension: formations, heavenly tribulations, elixirs and cultivation panels.",
      zh: "从炼气到飞升：法阵、天劫、丹药与修为面板。",
    },
  },
  {
    slug: "ma-dao-huyet-gioi",
    type: "PREMIUM",
    priceVnd: 1_390_000,
    genres: ["dark-fantasy", "xuanhuan", "mmorpg"],
    daysAgo: 21,
    popularity: 118,
    scale: 1,
    sections: without("crafting-gathering", "ui-states", "technical"),
    title: { vi: "Ma Đạo Huyết Giới", en: "Demonic Blood Realm", zh: "魔道血界" },
    short: {
      vi: "Ma tông, huyết trì, ma thú và hiệu ứng ma khí, huyết khí cho game huyền huyễn hắc ám.",
      en: "Demonic sects, blood pools, demon beasts and dark qi effects for dark xuanhuan games.",
      zh: "魔宗、血池、魔兽与魔气、血气特效，适合暗黑玄幻游戏。",
    },
  },
  {
    slug: "huyen-huyen-cuu-chau",
    type: "PREMIUM",
    priceVnd: 1_090_000,
    genres: ["xuanhuan", "mmorpg"],
    daysAgo: 28,
    popularity: 96,
    scale: 0.8,
    sections: without("audio", "fonts-text", "cultivation", "cinematic-story", "technical"),
    title: { vi: "Huyền Huyễn Cửu Châu", en: "Nine Provinces Xuanhuan", zh: "玄幻九州" },
    short: {
      vi: "Chín châu đại lục với thành trì, bí cảnh, tọa kỵ và hệ thống trang bị huyền huyễn.",
      en: "A nine-province continent with cities, secret realms, mounts and xuanhuan gear.",
      zh: "九州大陆：城池、秘境、坐骑与玄幻装备体系。",
    },
  },
  {
    slug: "vo-lam-tranh-ba",
    type: "PREMIUM",
    priceVnd: 990_000,
    compareAtPriceVnd: 1_190_000,
    genres: ["martial-arts", "wuxia", "rpg"],
    daysAgo: 35,
    popularity: 104,
    scale: 0.7,
    sections: without("cultivation", "crafting-gathering", "world-maps", "ui-states", "cinematic-story", "technical"),
    title: { vi: "Võ Lâm Tranh Bá", en: "Martial World Supremacy", zh: "武林争霸" },
    short: {
      vi: "Bộ võ hiệp gọn nhẹ cho RPG: môn phái, võ đài, binh khí và hiệu ứng chưởng pháp.",
      en: "A compact martial-arts kit for RPGs: sects, arenas, weapons and palm-strike effects.",
      zh: "轻量武侠 RPG 套件：门派、擂台、兵器与掌法特效。",
    },
  },
  {
    slug: "tien-mon-chibi",
    type: "PREMIUM",
    priceVnd: 690_000,
    genres: ["xianxia", "rpg"],
    styles: ["chibi-pixel"],
    daysAgo: 42,
    popularity: 88,
    scale: 0.6,
    sections: ["characters", "maps-environments", "tilesets", "monsters-bosses", "skills-vfx", "items", "ui", "icons", "mounts-pets", "social", "cultivation", "ui-states"],
    title: { vi: "Tiên Môn Chibi", en: "Chibi Immortal Sect", zh: "Q版仙门" },
    short: {
      vi: "Phiên bản chibi dễ thương của thế giới tiên hiệp, hợp game nhàn rỗi và game di động.",
      en: "A cute chibi take on the xianxia world, great for idle and mobile games.",
      zh: "可爱 Q 版仙侠世界，适合放置类与手机游戏。",
    },
  },
  {
    slug: "khoi-dau-tien-hiep",
    type: "FREE",
    priceVnd: 0,
    genres: ["xianxia", "rpg"],
    daysAgo: 50,
    popularity: 1240,
    scale: 0.3,
    sections: ["characters", "maps-environments", "tilesets", "monsters-bosses", "skills-vfx", "items", "ui", "icons"],
    title: { vi: "Khởi Đầu Tiên Hiệp", en: "Xianxia Starter Kit", zh: "仙侠入门包" },
    short: {
      vi: "Bộ miễn phí để làm thử một màn game tiên hiệp hoàn chỉnh: nhân vật, bản đồ, quái và giao diện cơ bản.",
      en: "A free kit to prototype a complete xianxia level: characters, map, monsters and basic UI.",
      zh: "免费套件，可制作一个完整的仙侠关卡原型：角色、地图、怪物与基础界面。",
    },
  },
  {
    slug: "tan-thu-kiem-hiep",
    type: "FREE",
    priceVnd: 0,
    genres: ["wuxia", "martial-arts"],
    daysAgo: 60,
    popularity: 860,
    scale: 0.25,
    sections: ["characters", "maps-environments", "tilesets", "skills-vfx", "equipment", "ui"],
    title: { vi: "Tân Thủ Kiếm Hiệp", en: "Wuxia Newcomer Kit", zh: "剑侠新手包" },
    short: {
      vi: "Gói miễn phí cho người mới: hiệp khách, làng nhỏ, binh khí và giao diện cơ bản phong cách kiếm hiệp.",
      en: "A free newcomer kit: wandering heroes, a small village, weapons and basic wuxia UI.",
      zh: "免费新手包：侠客、小村庄、兵器与基础剑侠界面。",
    },
  },
];
