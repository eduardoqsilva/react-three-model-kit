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

export interface ARButtonProps {
	/**
	 * Define a ordem de prioridade dos modos AR tentados.
	 * O primeiro modo disponível no dispositivo é utilizado.
	 * Padrão: `["webxr", "sceneviewer", "quicklook"]`
	 */
	prefer?: ARMode[];
	/**
	 * URL pública do arquivo GLB usado pelo Scene Viewer (Android).
	 * Quando não fornecida, o componente exporta o modelo em tempo real
	 * e usa uma blob URL — funciona apenas em desenvolvimento local.
	 */
	glbUrl?: string;
	/**
	 * URL pública do arquivo USDZ usado pelo Quick Look (iOS).
	 * Quando não fornecida, o componente exporta o modelo em tempo real.
	 */
	usdzUrl?: string;
	/** Título exibido no Scene Viewer (Android). */
	title?: string;
	/** Conteúdo do botão. */
	children?: React.ReactNode;
	/** Classe CSS aplicada ao botão. */
	className?: string;
	/** Estilo inline aplicado ao botão. */
	style?: React.CSSProperties;
	/** Escala aplicada ao modelo na cena WebXR. Padrão: `[1, 1, 1]`. */
	modelScale?: [number, number, number];
	/** Callback disparado quando um modo AR é aberto. Recebe o modo utilizado. */
	onOpen?: (mode: ARMode) => void;
	/** Callback disparado quando a sessão WebXR encerra. */
	onSessionEnd?: () => void;
}
