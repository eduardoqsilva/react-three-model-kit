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
	TextureMapKey,
	TextureSlot,
} from "./types";

export type ExportModelFunction = (
	format: "glb" | "usdz",
	createUrl?: boolean,
) => Promise<string | Blob | undefined>;

export interface ModelContextType {
	model: ModelData | null;
	materials: MaterialMap | null;
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
					`[ModelProvider] Material '${materialName}' não encontrado na cena atual.`,
				);
				return;
			}

			const mat = materials[materialName];
			const { textures = {}, tiling, roughnessFactor = 1 } = params;

			if (!mat) return;

			// CLEAR HELPER
			const clearMap = (mapType: TextureMapKey) => {
				const mapRef: Record<Exclude<TextureMapKey, "orm">, TextureSlot> = {
					base: "map",
					normal: "normalMap",
					ao: "aoMap",
					roughness: "roughnessMap",
					metalness: "metalnessMap",
				};

				if (mapType === "orm") return;

				const key = mapRef[mapType];
				const existingMap = mat[key];

				if (existingMap) {
					mat[key] = null;
					existingMap.dispose();
					mat.needsUpdate = true;
				}
			};

			// LOAD HELPER
			const loadAndApply = (
				url: string,
				applyFn: (tex: THREE.Texture) => void,
				mapType: TextureMapKey,
			) => {
				return new Promise<void>((resolve) => {
					textureLoader.load(
						url,
						(texture) => {
							texture.userData.originalUrl = url;
							texture.flipY = false;

							// TILING CONFIG
							const repeat = tiling?.repeat ?? [1, 1];
							const excludes = tiling?.excludes ?? [];

							const shouldTile =
								repeat &&
								repeat[0] > 0 &&
								repeat[1] > 0 &&
								!excludes.includes(mapType);

							if (shouldTile) {
								texture.wrapS = THREE.RepeatWrapping;
								texture.wrapT = THREE.RepeatWrapping;
								texture.repeat.set(repeat[0], repeat[1]);
							}

							applyFn(texture);
							mat.needsUpdate = true;
							resolve();
						},
						undefined,
						(error) => {
							console.error(
								`[ModelProvider] Erro ao carregar textura: ${url}`,
								error,
							);
							resolve();
						},
					);
				});
			};

			const promises: Promise<void>[] = [];

			// HEX COLOR (modo flat)
			if (textures.hex_color && !textures.base) {
				clearMap("base");

				const targetColor = textures.hex_color.replace("#", "");
				if (mat.color.getHexString() !== targetColor) {
					mat.color.set(textures.hex_color);
					mat.needsUpdate = true;
				}

				return;
			}

			// BASE
			if (textures.base) {
				if (mat.map?.userData?.originalUrl !== textures.base) {
					promises.push(
						loadAndApply(
							textures.base,
							(tex) => {
								tex.colorSpace = THREE.SRGBColorSpace;
								clearMap("base");
								mat.color.set("#fff");
								mat.map = tex;
							},
							"base",
						),
					);
				}
			} else {
				clearMap("base");
			}

			// NORMAL
			if (textures.normal) {
				if (mat.normalMap?.userData?.originalUrl !== textures.normal) {
					promises.push(
						loadAndApply(
							textures.normal,
							(tex) => {
								clearMap("normal");
								mat.normalMap = tex;
							},
							"normal",
						),
					);
				}
			} else {
				clearMap("normal");
			}

			// ORM
			if (textures.orm) {
				if (typeof textures.orm === "string") {
					promises.push(
						loadAndApply(
							textures.orm,
							(tex) => {
								clearMap("ao");
								clearMap("roughness");
								clearMap("metalness");

								mat.aoMap = mat.roughnessMap = mat.metalnessMap = tex;
								mat.roughness = roughnessFactor;
							},
							"orm",
						),
					);
				} else {
					const orm = textures.orm;

					// AO
					if (orm.ao) {
						promises.push(
							loadAndApply(
								orm.ao,
								(tex) => {
									clearMap("ao");
									mat.aoMap = tex;
								},
								"ao",
							),
						);
					} else {
						clearMap("ao");
					}

					// Roughness
					if (orm.roughness) {
						promises.push(
							loadAndApply(
								orm.roughness,
								(tex) => {
									clearMap("roughness");
									mat.roughnessMap = tex;
									mat.roughness = roughnessFactor;
								},
								"roughness",
							),
						);
					} else {
						clearMap("roughness");
					}

					// Metalness
					if (orm.metalness) {
						promises.push(
							loadAndApply(
								orm.metalness,
								(tex) => {
									clearMap("metalness");
									mat.metalnessMap = tex;
								},
								"metalness",
							),
						);
					} else {
						clearMap("metalness");
					}
				}
			} else {
				clearMap("ao");
				clearMap("roughness");
				clearMap("metalness");
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
