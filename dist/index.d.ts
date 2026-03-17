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
interface ARButtonProps {
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

/**
 * Botão que abre o modelo 3D no melhor visualizador AR disponível,
 * respeitando a ordem de prioridade definida em `prefer`.
 *
 * **URLs pré-hospedadas (produção):**
 * Forneça `glbUrl` e/ou `usdzUrl` para evitar a exportação em tempo real
 * e garantir compatibilidade com Scene Viewer no Android.
 *
 * **Sem URLs (desenvolvimento):**
 * O modelo é exportado em tempo real a partir do estado atual do `ModelProvider`.
 * Scene Viewer não funcionará por rejeitar blob URLs — use WebXR como fallback.
 *
 * @example
 * // Produção: URLs pré-hospedadas
 * <ARButton
 *   glbUrl="https://cdn.exemplo.com/produto.glb"
 *   usdzUrl="https://cdn.exemplo.com/produto.usdz"
 *   prefer={["sceneviewer", "quicklook", "webxr"]}
 * />
 *
 * @example
 * // Desenvolvimento: exporta em tempo real
 * <ARButton prefer={["webxr"]} />
 */
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
