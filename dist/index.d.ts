import * as react_jsx_runtime from 'react/jsx-runtime';
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import React$1 from 'react';

type TextureSlot = "map" | "normalMap" | "aoMap" | "roughnessMap" | "metalnessMap";
type TextureMapKey = "base" | "normal" | "ao" | "roughness" | "metalness" | "orm";
interface TilingConfig {
    repeat?: [number, number];
    excludes?: TextureMapKey[];
}
interface TextureAreaParams {
    area: string;
    tiling?: TilingConfig;
    roughnessFactor?: number;
    textures?: {
        hex_color?: string;
        base?: string;
        normal?: string;
        orm?: string | {
            ao?: string;
            roughness?: string;
            metalness?: string;
        };
    };
}
interface Material {
    id: string;
    areas: TextureAreaParams[];
}
interface ModelData extends GLTF {
}
interface LoadingStatus {
    progress: number;
    steps: number;
    currentStep: number;
    isLoading: boolean;
    currentSrc: string;
    errors?: string;
}
type MaterialMap = {
    [key: string]: THREE.MeshStandardMaterial | undefined;
};
type ARMode = "webxr" | "sceneviewer" | "quicklook";
type UrlProp = string | (() => Promise<string>);
interface ARButtonProps {
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
    children?: React.ReactNode | ((state: {
        isLoading: boolean;
    }) => React.ReactNode);
    className?: string;
    style?: React.CSSProperties;
    modelScale?: [number, number, number];
    onOpen?: (mode: ARMode) => void;
    onSessionEnd?: () => void;
}

declare function ARButton({ prefer, glbUrl, usdzUrl, title, children, className, style, modelScale, onOpen, onSessionEnd, }: ARButtonProps): react_jsx_runtime.JSX.Element;

type ExportModelFunction = (format: "glb" | "usdz", createUrl?: boolean) => Promise<string | Blob | undefined>;
interface ModelContextType {
    model: ModelData | null;
    materials: MaterialMap | null;
    loadingStatus: LoadingStatus;
    /** @param url - URL do arquivo GLB a ser carregado. */
    /** @param initMaterials - Material ou lista de materiais aplicados imediatamente após o carregamento, dentro do mesmo fluxo de loading. */
    loadModel: (url: string, initMaterials?: Material | Material[]) => void;
    /** @param material - Material ou lista de materiais a aplicar na cena atual. */
    applyMaterial: (material: Material[] | Material) => Promise<void>;
    /** @param format - Formato de exportação: `"glb"` ou `"usdz"`. */
    /** @param createUrl - Quando `true`, retorna uma object URL em vez de um Blob. */
    exportModel: ExportModelFunction;
}
interface ModelProviderProps {
    children: React$1.ReactNode;
    /** Chamado sempre que materiais são aplicados, recebendo a lista processada. */
    onMaterialsApplied?: (materials: Material[]) => void;
}
declare function ModelProvider({ children, onMaterialsApplied, }: ModelProviderProps): react_jsx_runtime.JSX.Element;
declare const useModelContext: () => ModelContextType;

export { ARButton, type ARButtonProps, type ARMode, type ExportModelFunction, type LoadingStatus, type Material, type MaterialMap, type ModelContextType, type ModelData, ModelProvider, type ModelProviderProps, type TextureAreaParams, type TextureMapKey, type TextureSlot, type TilingConfig, useModelContext };
