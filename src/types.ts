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

// AR Btn

export type ARMode = "webxr" | "sceneviewer" | "quicklook";

type UrlProp = string | (() => Promise<string>);

export interface ARButtonProps {
	prefer?: ARMode[];
	/** URL pré-hospedada do GLB, ou função async que faz upload e retorna a URL */
	glbUrl?: UrlProp;
	/** URL pré-hospedada do USDZ, ou função async que faz upload e retorna a URL */
	usdzUrl?: UrlProp;
	title?: string;
	/**
	 * Aceita ReactNode estático ou render prop com `{ isLoading }`.
	 * @example
	 * <ARButton glbUrl={uploadAndGetUrl}>
	 *   {({ isLoading }) => isLoading ? <Spinner /> : "Ver em AR"}
	 * </ARButton>
	 */
	children?: React.ReactNode | ((state: { isLoading: boolean }) => React.ReactNode);
	className?: string;
	style?: React.CSSProperties;
	modelScale?: [number, number, number];
	onOpen?: (mode: ARMode) => void;
	onSessionEnd?: () => void;
}
