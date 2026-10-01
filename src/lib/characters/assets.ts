/** Unchanged uploaded PNGs, with padded visible bounds for static layout only. */
export type CharacterId = "male" | "female" | "ku";
export type CharacterSkin = "default" | "military" | "casual" | "graduation";
export type CharacterView = "front" | "side";
export type StaticImageAsset = { src: string; width: number; height: number; bounds: [number, number, number, number] };

export const CHARACTER_SKINS: Record<CharacterId, readonly CharacterSkin[]> = {
  male: ["default", "military", "graduation"],
  female: ["default", "casual", "graduation"],
  ku: ["default", "graduation"],
};

// Bounds include 16 source pixels around the visible silhouette. PNG pixels
// remain intact; the viewport excludes unused transparent canvas, not hair/art.
export const CHARACTER_IMAGES: Record<string, StaticImageAsset> = {
  "male/default/front": { src: "/assets/kurend/characters/male/source/default-front.png", width: 1024, height: 1536, bounds: [106, 78, 806, 1384] },
  "male/military/front": { src: "/assets/kurend/characters/male/source/military-front.png", width: 1024, height: 1536, bounds: [90, 61, 838, 1445] },
  "male/graduation/front": { src: "/assets/kurend/characters/male/source/graduation-front.png", width: 1024, height: 1536, bounds: [77, 32, 861, 1470] },
  "female/default/front": { src: "/assets/kurend/characters/female/source/default-front.png", width: 1024, height: 1536, bounds: [75, 91, 866, 1388] },
  "female/casual/front": { src: "/assets/kurend/characters/female/source/casual-front.png", width: 1024, height: 1536, bounds: [93, 86, 822, 1382] },
  "female/graduation/front": { src: "/assets/kurend/characters/female/source/graduation-front.png", width: 1024, height: 1536, bounds: [96, 38, 822, 1442] },
  "male/default/side": { src: "/assets/kurend/characters/male/source/default-side.png", width: 1024, height: 1536, bounds: [190, 90, 645, 1357] },
  "male/military/side": { src: "/assets/kurend/characters/male/source/military-side.png", width: 1024, height: 1536, bounds: [133, 63, 708, 1430] },
  "male/graduation/side": { src: "/assets/kurend/characters/male/source/graduation-side.png", width: 1024, height: 1536, bounds: [165, 29, 646, 1434] },
  "female/default/side": { src: "/assets/kurend/characters/female/source/default-side.png", width: 1024, height: 1536, bounds: [113, 81, 724, 1399] },
  "female/casual/side": { src: "/assets/kurend/characters/female/source/casual-side.png", width: 1024, height: 1536, bounds: [106, 74, 741, 1416] },
  "female/graduation/side": { src: "/assets/kurend/characters/female/source/graduation-side.png", width: 1024, height: 1536, bounds: [175, 62, 647, 1409] },
  "ku/default/front": { src: "/assets/kurend/characters/ku/source/default-front.png", width: 1145, height: 1374, bounds: [48, 66, 1046, 1252] },
  "ku/graduation/front": { src: "/assets/kurend/characters/ku/source/graduation-front.png", width: 1268, height: 1240, bounds: [205, 3, 855, 1184] },
  "ku/default/side": { src: "/assets/kurend/characters/ku/source/default-side.png", width: 1322, height: 1190, bounds: [316, 32, 709, 1125] },
  "ku/graduation/side": { src: "/assets/kurend/characters/ku/source/graduation-side.png", width: 1230, height: 1278, bounds: [299, 34, 748, 1186] },
};

export function getCharacterImage(character: CharacterId, skin: CharacterSkin = "default", view: CharacterView = "front"): StaticImageAsset {
  const resolvedSkin = CHARACTER_SKINS[character].includes(skin) ? skin : "default";
  return CHARACTER_IMAGES[`${character}/${resolvedSkin}/${view}`];
}

export const SCENE_IMAGES = {
  "ku-truck": { src: "/assets/kurend/vehicles/ku-truck/source.png", width: 1942, height: 809, bounds: [15, 15, 1920, 786] },
  "military-truck": { src: "/assets/kurend/vehicles/military-truck/source.png", width: 1951, height: 806, bounds: [1, 0, 1950, 806] },
  "graduation-cap": { src: "/assets/kurend/props/graduation-cap/source.png", width: 1536, height: 1024, bounds: [153, 183, 1238, 754] },
  "diploma": { src: "/assets/kurend/props/diploma/source.png", width: 1278, height: 1230, bounds: [164, 69, 936, 1109] },
  "campus": { src: "/assets/kurend/backgrounds/campus/source.png", width: 1672, height: 941, bounds: [0, 0, 1672, 941] },
} satisfies Record<string, StaticImageAsset>;
