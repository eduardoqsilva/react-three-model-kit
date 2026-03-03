import type * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export type TextureSlot =
  | "map"
  | "normalMap"
  | "aoMap"
  | "roughnessMap"
  | "metalnessMap";

export type TextureMapKey =
	| "base"
	| "normal"
	| "ao"
	| "roughness"
	| "metalness"
	| "orm";

export interface TilingConfig {
	repeat?: [number, number]; // [x, y]
	excludes?: TextureMapKey[]; // mapas que NÃO devem receber repeat
}

export interface TextureAreaParams {
	area: string;
	tiling?: TilingConfig;
	roughnessFactor?: number;
	textures?: {
		hex_color?: string;
		base?: string;
		normal?: string;
		orm?: string | { ao?: string; roughness?: string; metalness?: string };
	};
}

export interface Material {
	id: string;
	category: string;
	areas: TextureAreaParams[];
}

export interface ModelData extends GLTF {}

export interface LoadingStatus {
	progress: number;
	steps: number;
	currentStep: number;
	isLoading: boolean;
	currentSrc: string;
	errors?: string;
}

export type MaterialMap = {
	[key: string]: THREE.MeshStandardMaterial | undefined;
};
