import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
	LoadingStatus,
	Material,
	MaterialMap,
	ModelData,
	TextureAreaParams,
} from "./types";

export type ExportModelFunction = (
	format: "glb" | "usdz",
	createUrl?: boolean,
) => Promise<string | Blob | undefined>;

export interface ModelContextType {
	model: ModelData | null;
	materials: MaterialMap | null;
	appliedMaterials: Record<string, Material>;
	loadingStatus: LoadingStatus;
	loadModel: (url: string) => void;
	applyMaterial: (material: Material[] | Material) => Promise<void>;
	exportModel: ExportModelFunction;
}

export interface ModelProviderProps {
	children: React.ReactNode;
	onMaterialsApplied?: (materials: Material[]) => void;
}

// CONTEXT AND PROVIDER
const ModelContext = createContext<ModelContextType | null>(null);

export function ModelProvider({
	children,
	onMaterialsApplied,
}: ModelProviderProps) {
	const [modelData, setModelData] = useState<ModelData | null>(null);
	const [materials, setMaterials] = useState<MaterialMap | null>(null);
	const [appliedMaterials, setAppliedMaterials] = useState<
		Record<string, Material>
	>({});
	const [loadingStatus, setLoadingStatus] = useState<LoadingStatus>({
		isLoading: false,
		steps: 0,
		currentStep: 0,
		progress: 0,
		currentSrc: "",
	});

	const exportUrlRef = React.useRef<string | null>(null);

	const loadingManager = useMemo(() => {
		return new THREE.LoadingManager(
			() =>
				setLoadingStatus((prev) => ({
					...prev,
					progress: 100,
					currentSrc: "",
				})),
			(itemUrl, loaded, total) => {
				const progress = Math.round((loaded / total) * 100);
				setLoadingStatus((prev) => ({
					...prev,
					progress,
					currentSrc: itemUrl,
					currentStep:
						loaded === total ? prev.currentStep + 1 : prev.currentStep,
				}));
			},
			(url) => {
				// Log de erro
				console.error(
					`[ModelProvider] Falha crítica no LoadingManager ao baixar o recurso: ${url}`,
				);
				setLoadingStatus((prev) => ({ ...prev, errors: url }));
			},
		);
	}, []);

	const textureLoader = useMemo(
		() => new THREE.TextureLoader(loadingManager),
		[loadingManager],
	);

	useEffect(() => {
		return () => {
			if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
		};
	}, []);

	const loadModel = useCallback(
		(url: string) => {
			setLoadingStatus({
				isLoading: true,
				steps: 1,
				currentStep: 0,
				progress: 0,
				currentSrc: url,
			});

			const loader = new GLTFLoader(loadingManager);
			loader.load(
				url,
				(loadedModel) => {
					setModelData(loadedModel);

					const extractedMaterials: MaterialMap = {};
					loadedModel.scene.traverse((child) => {
						if (child instanceof THREE.Mesh && child.material) {
							extractedMaterials[child.material.name] =
								child.material as THREE.MeshStandardMaterial;
						}
					});

					setMaterials(extractedMaterials);
					setAppliedMaterials({});
					setLoadingStatus((prev) => ({
						...prev,
						isLoading: false,
						currentStep: 1,
					}));
				},
				undefined,
				(error) => {
					// Log de erro
					console.error(
						`[ModelProvider] Erro ao analisar ou carregar o arquivo glTF/GLB no caminho: ${url}`,
						error,
					);
					setLoadingStatus((prev) => ({
						...prev,
						isLoading: false,
						errors: url,
					}));
				},
			);
		},
		[loadingManager],
	);

	const updateCombinedTexture = useCallback(
		async (materialName: string, params: TextureAreaParams): Promise<void> => {
			if (!materials || !materials[materialName]) {
				console.warn(
					`[ModelProvider] Material '${materialName}' não encontrado na cena atual. Verifique o mapeamento das áreas.`,
				);
				return;
			}

			const mat = materials[materialName];
			const { textures = {}, tiling = 1, roughnessFactor = 1 } = params;

			if (!mat) return;

			// Função auxiliar com tratamento de erro isolado para não quebrar o Promise.all
			const loadAndApply = (
				url: string,
				applyFn: (tex: THREE.Texture) => void,
				disableTiling: boolean | undefined = false,
			) => {
				return new Promise<void>((resolve) => {
					textureLoader.load(
						url,
						(texture) => {
							texture.userData.originalUrl = url;

							texture.flipY = false;

							if (tiling > 0 && !disableTiling) {
								texture.wrapS = THREE.RepeatWrapping;
								texture.wrapT = THREE.RepeatWrapping;
								texture.repeat.set(tiling, tiling);
							}

							applyFn(texture);

							mat.needsUpdate = true;
							resolve();
						},
						undefined,
						(error) => {
							console.error(
								`[ModelProvider] Erro ao carregar a textura: ${url}. O material continuará com a textura anterior.`,
								error,
							);
							resolve();
						},
					);
				});
			};

			const promises: Promise<void>[] = [];

			// hex color
			if (textures.hex_color && !textures.base) {
				const targetColor = textures.hex_color.replace("#", "");
				if (mat.color.getHexString() !== targetColor) {
					mat.color.set(textures.hex_color);
					if (mat.map) {
						mat.map.dispose();
						mat.map = null;
					}
					mat.needsUpdate = true;
				}
				return;
			}

			// Texture Base / Albedo
			if (textures.base && mat.map?.userData?.originalUrl !== textures.base) {
				promises.push(
					loadAndApply(textures.base, (tex) => {
						tex.colorSpace = THREE.SRGBColorSpace;
						if (mat.map) mat.map.dispose();
						mat.color.set("#fff");
						mat.map = tex;
					}),
				);
			}

			// Normal Map
			if (
				textures.normal &&
				mat.normalMap?.userData?.originalUrl !== textures.normal
			) {
				promises.push(
					loadAndApply(textures.normal, (tex) => {
						if (mat.normalMap && mat.normalMap !== tex) {
							mat.normalMap.dispose();
						}
						mat.normalMap = tex;
					}),
				);
			}
			// ORM (Occlusion, Roughness, Metallic)
			if (textures.orm) {
				if (typeof textures.orm === "string") {
					promises.push(
						loadAndApply(textures.orm, (tex) => {
							if (mat.aoMap) mat.aoMap.dispose();
							if (mat.roughnessMap) mat.roughnessMap.dispose();
							if (mat.metalnessMap) mat.metalnessMap.dispose();
							mat.aoMap = mat.roughnessMap = mat.metalnessMap = tex;
							mat.roughness = roughnessFactor;
						}),
					);
				} else {
					const orm = textures.orm;
					if (orm.ao)
						promises.push(
							loadAndApply(
								orm.ao,
								(tex) => {
									if (mat.aoMap) mat.aoMap.dispose();
									mat.aoMap = tex;
								},
								true,
							),
						);
					if (orm.roughness)
						promises.push(
							loadAndApply(orm.roughness, (tex) => {
								if (mat.roughnessMap) mat.roughnessMap.dispose();
								mat.roughnessMap = tex;
								mat.roughness = roughnessFactor;
							}),
						);
					if (orm.metalness)
						promises.push(
							loadAndApply(orm.metalness, (tex) => {
								if (mat.metalnessMap) mat.metalnessMap.dispose();
								mat.metalnessMap = tex;
							}),
						);
				}
			}

			await Promise.all(promises);
		},
		[materials, textureLoader],
	);

	const applyMaterial = useCallback(
		async (materialConfig: Material | Material[]) => {
			if (!materials) return;

			const materialsArray = Array.isArray(materialConfig)
				? materialConfig
				: [materialConfig];
			const totalSteps = materialsArray.reduce(
				(acc, mat) => acc + mat.areas.length,
				0,
			);
			let currentStep = 0;

			setLoadingStatus((prev) => ({
				...prev,
				isLoading: true,
				steps: totalSteps,
				currentStep: 0,
			}));

			setAppliedMaterials((prev) => {
				const updated = { ...prev };
				materialsArray.forEach((mat) => {
					updated[mat.category] = mat;
				});
				return updated;
			});

			if (onMaterialsApplied) onMaterialsApplied(materialsArray);

			for (const mat of materialsArray) {
				for (const area of mat.areas) {
					await updateCombinedTexture(area.area, area);
					currentStep++;
					setLoadingStatus((prev) => ({ ...prev, currentStep }));
				}
			}

			setLoadingStatus((prev) => ({ ...prev, isLoading: false }));
		},
		[materials, updateCombinedTexture, onMaterialsApplied],
	);

	// EXPORT
	const exportToUSDZ = async (
		model: ModelData,
		returnBlob = false,
	): Promise<string | Blob> => {
		const modelClone = model.scene.clone(true);

		modelClone.traverse((child) => {
			if (
				child instanceof THREE.Mesh &&
				child.material instanceof THREE.MeshStandardMaterial
			) {
				child.material = child.material.clone();
				const mat = child.material;

				const hasTiling = [
					mat.map,
					mat.normalMap,
					mat.roughnessMap,
					mat.metalnessMap,
					mat.emissiveMap,
				].some((map) => map && (map.repeat.x !== 1 || map.repeat.y !== 1));

				if (mat.aoMap) {
					if (hasTiling) {
						mat.aoMap = null;
					} else {
						mat.aoMap = mat.aoMap.clone();
						mat.aoMap.repeat.set(1, 1);
						mat.aoMap.wrapS = mat.aoMap.wrapT = THREE.ClampToEdgeWrapping;
						mat.aoMap.channel = 0;
					}
				}

				[
					mat.map,
					mat.normalMap,
					mat.roughnessMap,
					mat.metalnessMap,
					mat.emissiveMap,
				].forEach((m) => {
					if (m) {
						m = m.clone();
						m.channel = 0;
						m.needsUpdate = true;
					}
				});
				mat.needsUpdate = true;
			}
		});

		const usdzExporter = new USDZExporter();

		return new Promise((resolve, reject) => {
			usdzExporter.parse(
				modelClone,
				(result: Uint8Array) => {
					// força que seja ArrayBuffer
					const buffer =
						result.buffer instanceof ArrayBuffer
							? result.buffer
							: new Uint8Array(result).buffer;
					const blob = new Blob([buffer], { type: "model/vnd.usdz+zip" });

					if (returnBlob) {
						resolve(blob);
					} else {
						const url = URL.createObjectURL(blob);
						resolve(url);
					}
				},
				(error: unknown) => {
					console.error("Erro ao exportar para USDZ:", error);
					reject(error);
				},
			);
		});
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: <>
	const exportModel = useCallback(
		async (
			format: "glb" | "usdz",
			createUrl = false,
		): Promise<string | Blob | undefined> => {
			if (exportUrlRef.current) {
				URL.revokeObjectURL(exportUrlRef.current);
				exportUrlRef.current = null;
			}

			if (!modelData) {
				console.warn(
					"[ModelProvider] Tentativa de exportação falhou: Nenhum modelo 3D carregado na memória.",
				);
				return;
			}

			try {
				if (format === "glb") {
					const exporter = new GLTFExporter();
					const result = await exporter.parseAsync(modelData.scene, {
						binary: true,
					});
					const blob = new Blob([result as ArrayBuffer], {
						type: "model/gltf-binary",
					});

					if (createUrl) {
						const url = URL.createObjectURL(blob);
						exportUrlRef.current = url;
						return url;
					}
					return blob;
				}

				if (format === "usdz") {
					const result = await exportToUSDZ(modelData, !createUrl);
					if (createUrl && typeof result === "string") {
						exportUrlRef.current = result;
					}
					return result;
				}
			} catch (error) {
				console.error(
					`[ModelProvider] Erro irreversível ao compilar o modelo para o formato (${format}): `,
					error,
				);
				throw error;
			}
		},
		[modelData],
	);

	return (
		<ModelContext.Provider
			value={{
				model: modelData,
				materials,
				applyMaterial,
				loadModel,
				exportModel,
				loadingStatus,
				appliedMaterials,
			}}
		>
			{children}
		</ModelContext.Provider>
	);
}

export const useModelContext = () => {
	const context = useContext(ModelContext);
	if (!context)
		throw new Error(
			"[ModelProvider] useModelContext foi invocado fora da árvore do ModelProvider.",
		);
	return context;
};
