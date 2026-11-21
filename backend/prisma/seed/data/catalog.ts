/**
 * Reference data: 21 categories (fixed slugs, CLAUDE.md §10), genres, art styles and licenses.
 * Every user-facing string exists in vi / en / zh.
 */

export type L3 = { vi: string; en: string; zh: string };

/** Asset "kind" decides the demo specs (formats, software, contents list) of products in a category. */
export type AssetKind = "sprite" | "map" | "vfx" | "ui" | "item" | "audio" | "font" | "tech";

export type CategorySeed = { slug: string; kind: AssetKind; icon: string; name: L3; description: L3 };

export const CATEGORIES: CategorySeed[] = [
  {
    slug: "characters",
    kind: "sprite",
    icon: "user-round",
    name: { vi: "Nhân vật", en: "Characters", zh: "角色" },
    description: {
      vi: "Nhân vật người chơi, NPC, môn phái và chiến binh kèm đầy đủ hoạt ảnh.",
      en: "Player characters, NPCs, sect disciples and warriors with full animation sets.",
      zh: "玩家角色、NPC、门派弟子与战士，附完整动画。",
    },
  },
  {
    slug: "maps-environments",
    kind: "map",
    icon: "mountain",
    name: { vi: "Bản đồ & Môi trường", en: "Maps & Environments", zh: "地图与环境" },
    description: {
      vi: "Rừng núi, sông hồ, thành trì, tông môn, tiên phủ và bí cảnh.",
      en: "Forests, mountains, rivers, cities, sects, immortal palaces and secret realms.",
      zh: "山林、河湖、城池、宗门、仙府与秘境。",
    },
  },
  {
    slug: "tilesets",
    kind: "map",
    icon: "grid-3x3",
    name: { vi: "Tileset", en: "Tilesets", zh: "图块素材" },
    description: {
      vi: "Bộ ô ghép bản đồ: nền đất, cỏ, nước, tường, đường, cầu, vách đá.",
      en: "Map tiles: ground, grass, water, walls, roads, bridges and cliffs.",
      zh: "地图图块：地面、草地、水面、墙体、道路、桥梁与悬崖。",
    },
  },
  {
    slug: "monsters-bosses",
    kind: "sprite",
    icon: "skull",
    name: { vi: "Quái vật & Boss", en: "Monsters & Bosses", zh: "怪物与首领" },
    description: {
      vi: "Yêu thú, linh thú, ma thú và boss bí cảnh, boss thế giới kèm hoạt ảnh chiến đấu.",
      en: "Demon beasts, spirit beasts and realm or world bosses with combat animations.",
      zh: "妖兽、灵兽、魔兽与秘境、世界首领，附战斗动画。",
    },
  },
  {
    slug: "skills-vfx",
    kind: "vfx",
    icon: "sparkles",
    name: { vi: "Kỹ năng & VFX", en: "Skills & VFX", zh: "技能与特效" },
    description: {
      vi: "Kiếm khí, chưởng pháp, lôi điện, pháp trận và hiệu ứng trúng đòn, chí mạng.",
      en: "Sword qi, palm strikes, lightning, magic arrays, hit and critical effects.",
      zh: "剑气、掌法、雷电、法阵及受击、暴击特效。",
    },
  },
  {
    slug: "equipment",
    kind: "item",
    icon: "sword",
    name: { vi: "Trang bị", en: "Equipment", zh: "装备" },
    description: {
      vi: "Kiếm, đao, thương, giáp, mũ, trang sức, pháp bảo và linh khí.",
      en: "Swords, blades, spears, armor, helmets, jewelry and magic treasures.",
      zh: "剑、刀、枪、铠甲、头盔、饰品与法宝。",
    },
  },
  {
    slug: "items",
    kind: "item",
    icon: "flask-round",
    name: { vi: "Vật phẩm", en: "Items", zh: "道具" },
    description: {
      vi: "Đan dược, linh thạch, linh thảo, nguyên liệu, sách kỹ năng và rương báu.",
      en: "Elixirs, spirit stones, herbs, materials, skill books and treasure chests.",
      zh: "丹药、灵石、灵草、材料、技能书与宝箱。",
    },
  },
  {
    slug: "ui",
    kind: "ui",
    icon: "layout-panel-top",
    name: { vi: "Giao diện game", en: "Game UI", zh: "游戏界面" },
    description: {
      vi: "Khung nhân vật, túi đồ, kỹ năng, nhiệm vụ, cửa hàng, luyện đan, bảng tu vi.",
      en: "Character frames, inventory, skills, quests, shop, alchemy and cultivation panels.",
      zh: "角色框、背包、技能、任务、商店、炼丹与修为面板。",
    },
  },
  {
    slug: "icons",
    kind: "ui",
    icon: "shapes",
    name: { vi: "Biểu tượng", en: "Icons", zh: "图标" },
    description: {
      vi: "Icon kỹ năng, vật phẩm, trang bị, thuộc tính, buff/debuff, môn phái, tiền tệ.",
      en: "Skill, item, equipment, attribute, buff/debuff, sect and currency icons.",
      zh: "技能、道具、装备、属性、增益/减益、门派与货币图标。",
    },
  },
  {
    slug: "environment-effects",
    kind: "vfx",
    icon: "cloud-rain",
    name: { vi: "Hiệu ứng môi trường", en: "Environment Effects", zh: "环境特效" },
    description: {
      vi: "Mưa, tuyết, sương mù, lửa, lá rơi, ánh sáng, cổng dịch chuyển, linh khí.",
      en: "Rain, snow, fog, fire, falling leaves, light, portals and spiritual energy.",
      zh: "雨、雪、雾、火、落叶、光效、传送门与灵气。",
    },
  },
  {
    slug: "audio",
    kind: "audio",
    icon: "music",
    name: { vi: "Âm thanh", en: "Audio", zh: "音频" },
    description: {
      vi: "Nhạc nền, âm thanh chiến đấu, kiếm chém, kỹ năng, quái vật và giao diện.",
      en: "Background music, combat, sword, skill, monster and UI sounds.",
      zh: "背景音乐、战斗、刀剑、技能、怪物与界面音效。",
    },
  },
  {
    slug: "fonts-text",
    kind: "font",
    icon: "type",
    name: { vi: "Font & Chữ", en: "Fonts & Text", zh: "字体与文字" },
    description: {
      vi: "Font giao diện, thư pháp, số sát thương, phù văn, ký tự cổ và con dấu.",
      en: "UI, calligraphy and damage-number fonts, runes, ancient glyphs and seals.",
      zh: "界面字体、书法字体、伤害数字、符文、古文字与印章。",
    },
  },
  {
    slug: "mounts-pets",
    kind: "sprite",
    icon: "bird",
    name: { vi: "Tọa kỵ & Linh thú", en: "Mounts & Pets", zh: "坐骑与灵宠" },
    description: {
      vi: "Ngựa, hạc, kỳ lân, rồng, phi kiếm và linh thú đồng hành.",
      en: "Horses, cranes, qilin, dragons, flying swords and companion spirit beasts.",
      zh: "骏马、仙鹤、麒麟、神龙、飞剑与灵宠。",
    },
  },
  {
    slug: "social",
    kind: "ui",
    icon: "users",
    name: { vi: "Cộng đồng", en: "Social", zh: "社交" },
    description: {
      vi: "Huy hiệu bang hội, khung tên, danh hiệu, bong bóng chat, biểu tượng tổ đội.",
      en: "Guild emblems, name frames, titles, chat bubbles and party icons.",
      zh: "帮会徽章、名字框、称号、聊天气泡与组队图标。",
    },
  },
  {
    slug: "pvp-war",
    kind: "ui",
    icon: "swords",
    name: { vi: "PvP & Chiến trường", en: "PvP & War", zh: "PvP与战场" },
    description: {
      vi: "Đấu trường, cờ chiếm đóng, trụ phòng thủ, huy hiệu xếp hạng, hiệu ứng thắng/thua.",
      en: "Arenas, capture flags, defense towers, rank badges and victory/defeat effects.",
      zh: "竞技场、占领旗、防御塔、段位徽章与胜负特效。",
    },
  },
  {
    slug: "cultivation",
    kind: "vfx",
    icon: "flame",
    name: { vi: "Tu luyện", en: "Cultivation", zh: "修炼" },
    description: {
      vi: "Pháp trận tu luyện, đột phá cảnh giới, thiên kiếp, kết đan, nguyên anh, phi thăng.",
      en: "Cultivation arrays, realm breakthroughs, heavenly tribulations, core formation and ascension.",
      zh: "修炼法阵、境界突破、天劫、结丹、元婴与飞升。",
    },
  },
  {
    slug: "crafting-gathering",
    kind: "item",
    icon: "hammer",
    name: { vi: "Chế tạo & Thu thập", en: "Crafting & Gathering", zh: "制作与采集" },
    description: {
      vi: "Lò luyện đan, đỉnh luyện khí, mỏ quặng, linh thảo và hiệu ứng chế tạo.",
      en: "Alchemy furnaces, forging cauldrons, ore veins, herbs and crafting effects.",
      zh: "炼丹炉、炼器鼎、矿脉、灵草与制作特效。",
    },
  },
  {
    slug: "world-maps",
    kind: "map",
    icon: "map",
    name: { vi: "Bản đồ thế giới", en: "World Maps", zh: "世界地图" },
    description: {
      vi: "Bản đồ thế giới, khu vực, môn phái, icon thành trì, bí cảnh và đường truyền tống.",
      en: "World, region and sect maps with city, realm and teleport-route icons.",
      zh: "世界、区域与门派地图，附城池、秘境与传送路线图标。",
    },
  },
  {
    slug: "ui-states",
    kind: "ui",
    icon: "toggle-right",
    name: { vi: "Trạng thái giao diện", en: "UI States", zh: "界面状态" },
    description: {
      vi: "Normal, Hover, Pressed, Disabled, Selected, Locked, Loading, Error, Success.",
      en: "Normal, hover, pressed, disabled, selected, locked, loading, error and success states.",
      zh: "常态、悬停、按下、禁用、选中、锁定、加载、错误与成功状态。",
    },
  },
  {
    slug: "cinematic-story",
    kind: "map",
    icon: "book-open",
    name: { vi: "Cốt truyện", en: "Cinematic & Story", zh: "剧情与过场" },
    description: {
      vi: "Nền hội thoại, chân dung NPC, khung hội thoại, minh họa sự kiện, màn hình loading.",
      en: "Dialogue backgrounds, NPC portraits, dialogue frames, event art and loading screens.",
      zh: "对话背景、NPC立绘、对话框、事件插画与加载画面。",
    },
  },
  {
    slug: "technical",
    kind: "tech",
    icon: "cpu",
    name: { vi: "Tài nguyên kỹ thuật", en: "Technical Assets", zh: "技术资源" },
    description: {
      vi: "Sprite atlas, dữ liệu animation, hitbox/hurtbox, collision, sorting layer, metadata.",
      en: "Sprite atlases, animation data, hitboxes/hurtboxes, collision, sorting layers and metadata.",
      zh: "精灵图集、动画数据、受击/攻击框、碰撞、排序层与元数据。",
    },
  },
];

export const GENRES: { slug: string; name: L3 }[] = [
  { slug: "xianxia", name: { vi: "Tiên hiệp", en: "Xianxia", zh: "仙侠" } },
  { slug: "cultivation", name: { vi: "Tu tiên", en: "Cultivation", zh: "修仙" } },
  { slug: "wuxia", name: { vi: "Kiếm hiệp", en: "Wuxia", zh: "剑侠" } },
  { slug: "martial-arts", name: { vi: "Võ hiệp", en: "Martial Arts", zh: "武侠" } },
  { slug: "xuanhuan", name: { vi: "Huyền huyễn", en: "Xuanhuan", zh: "玄幻" } },
  { slug: "mythology", name: { vi: "Thần thoại phương Đông", en: "Eastern Mythology", zh: "东方神话" } },
  { slug: "dark-fantasy", name: { vi: "Ma đạo", en: "Dark Fantasy", zh: "魔道" } },
  { slug: "mmorpg", name: { vi: "MMORPG 2D", en: "2D MMORPG", zh: "2D MMORPG" } },
  { slug: "rpg", name: { vi: "RPG 2D", en: "2D RPG", zh: "2D RPG" } },
];

export const ART_STYLES: { slug: string; name: L3 }[] = [
  { slug: "hd-pixel-art", name: { vi: "HD Pixel Art", en: "HD Pixel Art", zh: "HD 像素风" } },
  { slug: "chibi-pixel", name: { vi: "Pixel Chibi", en: "Chibi Pixel", zh: "Q版像素" } },
  { slug: "painted-2d", name: { vi: "Vẽ tay 2D", en: "Hand-painted 2D", zh: "2D 手绘" } },
];

const SAMPLE_NOTE: L3 = {
  vi: "Điều khoản mẫu cho bản demo. Chủ website cần thay bằng điều khoản chính thức trước khi bán thật.",
  en: "Sample terms for the demo. The store owner must replace them with official terms before real sales.",
  zh: "演示用示例条款。正式销售前，店主须替换为正式条款。",
};

export type LicenseSeed = {
  code: string;
  allowCommercial: boolean;
  allowModification: boolean;
  allowMultiProject: boolean;
  allowRedistribution: boolean;
  allowResale: boolean;
  name: L3;
  summary: L3;
  terms: L3;
};

/**
 * Rights per pack type (owner decisions 2026-11-14). The UI shows them as "Benefits" (backend/src/lib/catalog/benefits.ts),
 * never as "license" tiers that could read as a business permit. allowModification = asset customisation
 * (the buyer picks colours, effects… to their needs).
 *  - FREE: download + personal games; no customisation, no commercial games, one project.
 *  - PREMIUM: every benefit. Both: no redistribution/resale of the original files.
 * The code equals Product.type — the seed picks the rights from the pack type.
 */
export const LICENSES: LicenseSeed[] = [
  {
    code: "FREE",
    allowCommercial: false,
    allowModification: false,
    allowMultiProject: false,
    allowRedistribution: false,
    allowResale: false,
    name: { vi: "Điều khoản bộ miễn phí", en: "Free pack terms", zh: "免费素材包条款" },
    summary: {
      vi: "Bộ miễn phí: tải và dùng trong game cá nhân.",
      en: "Free pack: download and use in personal games.",
      zh: "免费素材包：下载并用于个人游戏。",
    },
    terms: {
      vi: `Bạn được tải và dùng asset của bộ miễn phí trong một dự án game cá nhân, không thu tiền dưới bất kỳ hình thức nào (bán game, nạp tiền trong game, quảng cáo). Bộ miễn phí không kèm chỉnh sửa asset theo nhu cầu (chọn màu, hiệu ứng…). Khi phát hành, vui lòng ghi nguồn "Asset Game MMORPG 2D" trong phần credits của game.\n\nMuốn chỉnh sửa asset, dùng trong game thương mại hoặc nhiều dự án, hãy chọn một bộ Premium. Không được phân phối lại, chia sẻ hay bán lại file gốc dưới dạng asset.\n\n${SAMPLE_NOTE.vi}`,
      en: `You may download the assets of a free pack and use them in one personal game project that earns no money in any way (selling the game, in-game purchases, ads). Free packs do not include asset customisation (picking colours, effects…). When you release, please credit "Asset Game MMORPG 2D" in the game's credits.\n\nFor customised assets, a commercial game or several projects, choose a Premium pack. You may not redistribute, share or resell the original files as assets.\n\n${SAMPLE_NOTE.en}`,
      zh: `免费素材包可下载并用于一个个人游戏项目，且不得以任何方式盈利（售卖游戏、游戏内付费、广告）。免费素材包不含素材定制（按需选择颜色、特效等）。发布时请在游戏制作人员名单中注明来源"Asset Game MMORPG 2D"。\n\n如需定制素材、用于商业游戏或多个项目，请选择 Premium 素材包。不得以素材形式再分发、共享或转售原始文件。\n\n${SAMPLE_NOTE.zh}`,
    },
  },
  {
    code: "PREMIUM",
    allowCommercial: true,
    allowModification: true,
    allowMultiProject: true,
    allowRedistribution: false,
    allowResale: false,
    name: { vi: "Điều khoản bộ Premium", en: "Premium pack terms", zh: "Premium 素材包条款" },
    summary: {
      vi: "Bộ Premium: chỉnh sửa asset theo nhu cầu, dùng trong game thương mại, không giới hạn số dự án.",
      en: "Premium pack: use it in games you sell or monetise, in as many games as you like.",
      zh: "Premium 素材包：可用于售卖或盈利的游戏，游戏数量不限。",
    },
    terms: {
      vi: `Bạn được tải và dùng asset trong các game của mình, kể cả game thương mại (bán game, nạp tiền, quảng cáo), không giới hạn số dự án, và được chỉnh sửa asset theo nhu cầu (chọn màu, hiệu ứng…). Không bắt buộc ghi nguồn. Quyền sử dụng gắn với tài khoản đã mua và giữ nguyên với các game đã phát hành.\n\nKhông được phân phối lại, chia sẻ hay bán lại file gốc (kể cả bản đã chỉnh sửa) dưới dạng asset, và không đưa file vào kho asset, template hay bộ công cụ làm game khác.\n\n${SAMPLE_NOTE.vi}`,
      en: `You may use the assets in your own games, including games you sell or that earn money through in-game purchases or ads, in any number of games, and modify them freely. Credit is not required. The right to use belongs to the account that bought the pack and stays with games already released.\n\nYou may not redistribute, share or resell the original files (including edited versions) as assets, or include them in another asset store, template or game-making kit.\n\n${SAMPLE_NOTE.en}`,
      zh: `你可以在自己的游戏中使用这些素材，包括售卖的游戏或通过游戏内付费、广告盈利的游戏，游戏数量不限，并可自由修改。无需注明来源。使用权归购买该素材包的账户所有，已发布的游戏可继续使用。\n\n不得以素材形式再分发、共享或转售原始文件（包括修改后的版本），也不得将其放入其他素材商店、模板或游戏制作工具包。\n\n${SAMPLE_NOTE.zh}`,
    },
  },
];

/** Demo specs per asset kind. Clearly sample values (products are flagged isDemoData). */
export const KIND_SPECS: Record<
  AssetKind,
  { resolution: string; fileFormats: string[]; software: string[]; contents: L3[] }
> = {
  sprite: {
    resolution: "64×64 px / frame",
    fileFormats: ["PNG", "GIF", "Aseprite", "JSON"],
    software: ["Unity", "Godot", "GameMaker", "RPG Maker MZ", "Aseprite"],
    contents: [
      { vi: "Sprite sheet PNG cho từng hoạt ảnh", en: "PNG sprite sheet per animation", zh: "每个动画的 PNG 精灵图" },
      {
        vi: "Hoạt ảnh Idle, Walk, Run, Attack, Skill, Hit, Death",
        en: "Idle, Walk, Run, Attack, Skill, Hit, Death animations",
        zh: "待机、行走、奔跑、攻击、技能、受击、死亡动画",
      },
      { vi: "8 hướng di chuyển", en: "8 movement directions", zh: "8 方向移动" },
      { vi: "File nguồn Aseprite", en: "Aseprite source files", zh: "Aseprite 源文件" },
      { vi: "Dữ liệu frame dạng JSON", en: "Frame data in JSON", zh: "JSON 帧数据" },
    ],
  },
  map: {
    resolution: "32×32 px / tile",
    fileFormats: ["PNG", "TMX", "JSON"],
    software: ["Unity", "Godot", "Tiled", "RPG Maker MZ"],
    contents: [
      { vi: "Tileset PNG", en: "PNG tilesets", zh: "PNG 图块集" },
      { vi: "Bản đồ mẫu Tiled (.tmx)", en: "Sample Tiled maps (.tmx)", zh: "Tiled 示例地图（.tmx）" },
      { vi: "Layer nền, vật cản và trang trí", en: "Ground, obstacle and decoration layers", zh: "地面、障碍与装饰图层" },
      { vi: "Dữ liệu va chạm dạng JSON", en: "Collision data in JSON", zh: "JSON 碰撞数据" },
    ],
  },
  vfx: {
    resolution: "128×128 px / frame",
    fileFormats: ["PNG", "GIF", "JSON"],
    software: ["Unity", "Godot", "Cocos Creator"],
    contents: [
      { vi: "Sprite sheet hiệu ứng PNG", en: "PNG effect sprite sheets", zh: "PNG 特效精灵图" },
      { vi: "Bản xem trước GIF", en: "GIF previews", zh: "GIF 预览" },
      { vi: "Cấu hình particle dạng JSON", en: "Particle configuration in JSON", zh: "JSON 粒子配置" },
      { vi: "Biến thể màu theo ngũ hành", en: "Five-element colour variants", zh: "五行配色变体" },
    ],
  },
  ui: {
    resolution: "1920×1080 · 9-slice",
    fileFormats: ["PNG", "PSD"],
    software: ["Unity", "Godot", "Figma", "Photoshop"],
    contents: [
      { vi: "Khung và bảng 9-slice", en: "9-slice frames and panels", zh: "九宫格边框与面板" },
      { vi: "Nút đủ trạng thái Normal/Hover/Pressed/Disabled", en: "Buttons in Normal/Hover/Pressed/Disabled", zh: "常态/悬停/按下/禁用按钮" },
      { vi: "File PSD tách layer", en: "Layered PSD source", zh: "分层 PSD 源文件" },
      { vi: "Bản 1× và 2×", en: "1× and 2× exports", zh: "1× 与 2× 导出" },
    ],
  },
  item: {
    resolution: "32×32 · 64×64 px",
    fileFormats: ["PNG", "Aseprite"],
    software: ["Unity", "Godot", "GameMaker", "RPG Maker MZ"],
    contents: [
      { vi: "Icon PNG nền trong suốt", en: "Transparent PNG icons", zh: "透明背景 PNG 图标" },
      { vi: "Hai kích thước 32 px và 64 px", en: "Two sizes: 32 px and 64 px", zh: "32 px 与 64 px 两种尺寸" },
      { vi: "Viền phẩm chất theo độ hiếm", en: "Rarity quality borders", zh: "按稀有度的品质边框" },
      { vi: "File nguồn Aseprite", en: "Aseprite source files", zh: "Aseprite 源文件" },
    ],
  },
  audio: {
    resolution: "48 kHz · 24-bit",
    fileFormats: ["WAV", "OGG", "MP3"],
    software: ["Unity", "Godot", "FMOD", "Wwise"],
    contents: [
      { vi: "Bản WAV chất lượng cao", en: "High-quality WAV masters", zh: "高品质 WAV 母带" },
      { vi: "Bản OGG và MP3 cho game", en: "OGG and MP3 for games", zh: "游戏用 OGG 与 MP3" },
      { vi: "Đoạn lặp liền mạch (loop)", en: "Seamless loops", zh: "无缝循环" },
    ],
  },
  font: {
    resolution: "Vector + bitmap 16 px",
    fileFormats: ["TTF", "OTF", "PNG"],
    software: ["Unity", "Godot", "Photoshop", "Figma"],
    contents: [
      { vi: "Font TTF và OTF", en: "TTF and OTF fonts", zh: "TTF 与 OTF 字体" },
      { vi: "Bitmap font PNG cho số sát thương", en: "PNG bitmap font for damage numbers", zh: "伤害数字 PNG 位图字体" },
      { vi: "Hỗ trợ tiếng Việt có dấu", en: "Vietnamese diacritics supported", zh: "支持越南语声调字符" },
    ],
  },
  tech: {
    resolution: "—",
    fileFormats: ["JSON", "PNG"],
    software: ["Unity", "Godot"],
    contents: [
      { vi: "Sprite atlas PNG + JSON", en: "PNG + JSON sprite atlas", zh: "PNG + JSON 精灵图集" },
      { vi: "Dữ liệu hitbox/hurtbox", en: "Hitbox/hurtbox data", zh: "攻击框/受击框数据" },
    ],
  },
};
