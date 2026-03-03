import * as react_jsx_runtime from 'react/jsx-runtime';
import React from 'react';
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
    category: string;
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

type ExportModelFunction = (format: "glb" | "usdz", createUrl?: boolean) => Promise<string | Blob | undefined>;
interface ModelContextType {
    model: ModelData | null;
    materials: MaterialMap | null;
    appliedMaterials: Record<string, Material>;
    loadingStatus: LoadingStatus;
    loadModel: (url: string) => void;
    applyMaterial: (material: Material[] | Material) => Promise<void>;
    exportModel: ExportModelFunction;
}
interface ModelProviderProps {
    children: React.ReactNode;
    onMaterialsApplied?: (materials: Material[]) => void;
}
declare function ModelProvider({ children, onMaterialsApplied, }: ModelProviderProps): react_jsx_runtime.JSX.Element;
declare const useModelContext: () => ModelContextType;

export { type ExportModelFunction, type LoadingStatus, type Material, type MaterialMap, type ModelContextType, type ModelData, ModelProvider, type ModelProviderProps, type TextureAreaParams, type TextureMapKey, type TextureSlot, type TilingConfig, useModelContext };
