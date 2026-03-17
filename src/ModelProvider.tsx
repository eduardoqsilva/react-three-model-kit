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
	/** @param url - URL do arquivo GLB a ser carregado. */
	/** @param initMaterials - Material ou lista de materiais aplicados imediatamente após o carregamento, dentro do mesmo fluxo de loading. */
	loadModel: (url: string, initMaterials?: Material | Material[]) => void;
	/** @param material - Material ou lista de materiais a aplicar na cena atual. */
	applyMaterial: (material: Material[] | Material) => Promise<void>;
	/** @param format - Formato de exportação: `"glb"` ou `"usdz"`. */
	/** @param createUrl - Quando `true`, retorna uma object URL em vez de um Blob. */
	exportModel: ExportModelFunction;
}

export interface ModelProviderProps {
	children: React.ReactNode;
	/** Chamado sempre que materiais são aplicados, recebendo a lista processada. */
	onMaterialsApplied?: (materials: Material[]) => void;
}

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

	const countTextureSteps = useCallback((materialsArray: Material[]): number => {
		let count = 0;
		for (const mat of materialsArray) {
			for (const area of mat.areas) {
				const { textures = {} } = area;
				if (textures.base || textures.hex_color) count++;
				if (textures.normal) count++;
				if (textures.orm) {
					if (typeof textures.orm === "string") {
						count++;
					} else {
						if (textures.orm.ao) count++;
						if (textures.orm.roughness) count++;
						if (textures.orm.metalness) count++;
					}
				}
			}
		}
		return count;
	}, []);

	/**
	 * Aplica materiais na cena e gerencia o loading state.
	 * Não exposta no contexto — uso interno via `applyMaterial` e `loadModel`.
	 *
	 * @param materialsArray - Lista de materiais a aplicar.
	 * @param stepOffset - Step inicial do loading; quando > 0, o loading não é reiniciado.
	 * @param materialsMap - Mapa de materiais a usar. Se omitido, usa o estado `materials`.
	 *                       Deve ser passado explicitamente quando chamado dentro do callback
	 *                       do loadModel, pois o estado React ainda não foi atualizado nesse ponto.
	 */
	const runApplyMaterial = useCallback(
		async (
			materialsArray: Material[],
			stepOffset: number,
			materialsMap?: MaterialMap,
		): Promise<void> => {
			const resolvedMaterials = materialsMap ?? materials;

			if (!resolvedMaterials) {
				console.warn(
					"[ModelProvider] runApplyMaterial chamado sem materiais disponíveis. Abortando.",
				);
				setLoadingStatus((prev) => ({
					...prev,
					isLoading: false,
					progress: 100,
				}));
				return;
			}

			const textureSteps = countTextureSteps(materialsArray);
			const totalSteps = stepOffset + textureSteps;
			let currentStep = stepOffset;

			if (stepOffset === 0) {
				setLoadingStatus((prev) => ({
					...prev,
					isLoading: true,
					steps: totalSteps,
					currentStep,
				}));
			}

			if (onMaterialsApplied) onMaterialsApplied(materialsArray);

			for (const mat of materialsArray) {
				for (const area of mat.areas) {
					const threeMat = resolvedMaterials[area.area] as THREE.MeshStandardMaterial;

					if (!threeMat) {
						console.warn(
							`[ModelProvider] Material '${area.area}' não encontrado na cena atual. Pulando área.`,
						);
						currentStep++;
						setLoadingStatus((prev) => ({ ...prev, currentStep }));
						continue;
					}

					const { textures = {}, tiling, roughnessFactor = 1 } = area;

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
						const existingMap = threeMat[key];
						if (existingMap) {
							threeMat[key] = null;
							existingMap.dispose();
							threeMat.needsUpdate = true;
						}
					};

					const loadAndApply = (
						url: string,
						applyFn: (tex: THREE.Texture) => void,
						mapType: TextureMapKey,
					) =>
						new Promise<void>((resolve) => {
							textureLoader.load(
								url,
								(texture) => {
									texture.userData.originalUrl = url;
									texture.flipY = false;

									const repeat = tiling?.repeat ?? [1, 1];
									const excludes = tiling?.excludes ?? [];
									const shouldTile =
										repeat[0] > 0 &&
										repeat[1] > 0 &&
										!excludes.includes(mapType);

									if (shouldTile) {
										texture.wrapS = THREE.RepeatWrapping;
										texture.wrapT = THREE.RepeatWrapping;
										texture.repeat.set(repeat[0], repeat[1]);
									}

									applyFn(texture);
									threeMat.needsUpdate = true;
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

					const promises: Promise<void>[] = [];

					if (textures.hex_color && !textures.base) {
						clearMap("base");
						const targetColor = textures.hex_color.replace("#", "");
						if (threeMat.color.getHexString() !== targetColor) {
							threeMat.color.set(textures.hex_color);
							threeMat.needsUpdate = true;
						}
					} else {
						if (textures.base) {
							if (threeMat.map?.userData?.originalUrl !== textures.base) {
								promises.push(
									loadAndApply(
										textures.base,
										(tex) => {
											tex.colorSpace = THREE.SRGBColorSpace;
											clearMap("base");
											threeMat.color.set("#fff");
											threeMat.map = tex;
										},
										"base",
									),
								);
							}
						} else {
							clearMap("base");
						}

						if (textures.normal) {
							if (threeMat.normalMap?.userData?.originalUrl !== textures.normal) {
								promises.push(
									loadAndApply(
										textures.normal,
										(tex) => {
											clearMap("normal");
											threeMat.normalMap = tex;
										},
										"normal",
									),
								);
							}
						} else {
							clearMap("normal");
						}

						if (textures.orm) {
							if (typeof textures.orm === "string") {
								promises.push(
									loadAndApply(
										textures.orm,
										(tex) => {
											clearMap("ao");
											clearMap("roughness");
											clearMap("metalness");
											threeMat.aoMap = threeMat.roughnessMap = threeMat.metalnessMap = tex;
											threeMat.roughness = roughnessFactor;
										},
										"orm",
									),
								);
							} else {
								const orm = textures.orm;

								if (orm.ao) {
									promises.push(
										loadAndApply(
											orm.ao,
											(tex) => {
												clearMap("ao");
												threeMat.aoMap = tex;
											},
											"ao",
										),
									);
								} else {
									clearMap("ao");
								}

								if (orm.roughness) {
									promises.push(
										loadAndApply(
											orm.roughness,
											(tex) => {
												clearMap("roughness");
												threeMat.roughnessMap = tex;
												threeMat.roughness = roughnessFactor;
											},
											"roughness",
										),
									);
								} else {
									clearMap("roughness");
								}

								if (orm.metalness) {
									promises.push(
										loadAndApply(
											orm.metalness,
											(tex) => {
												clearMap("metalness");
												threeMat.metalnessMap = tex;
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
					}

					await Promise.all(promises);
					currentStep++;
					setLoadingStatus((prev) => ({ ...prev, currentStep }));
				}
			}

			setLoadingStatus((prev) => ({
				...prev,
				isLoading: false,
				currentStep: totalSteps,
				progress: 100,
			}));
		},
		[materials, textureLoader, countTextureSteps, onMaterialsApplied],
	);

	const applyMaterial = useCallback(
		(materialConfig: Material | Material[]): Promise<void> => {
			const arr = Array.isArray(materialConfig) ? materialConfig : [materialConfig];
			return runApplyMaterial(arr, 0);
		},
		[runApplyMaterial],
	);

	/**
	 * Carrega um modelo GLB e, opcionalmente, aplica materiais iniciais
	 * dentro do mesmo fluxo de loading sem interrupção.
	 *
	 * @param url - URL do arquivo GLB.
	 * @param initMaterials - Material ou lista de materiais a aplicar após o carregamento.
	 */
	const loadModel = useCallback(
		(url: string, initMaterials?: Material | Material[]) => {
			const initArray = initMaterials
				? Array.isArray(initMaterials)
					? initMaterials
					: [initMaterials]
				: null;

			const totalSteps = 1 + (initArray ? countTextureSteps(initArray) : 0);

			setLoadingStatus({
				isLoading: true,
				steps: totalSteps,
				currentStep: 0,
				progress: 0,
				currentSrc: url,
			});

			const loader = new GLTFLoader(loadingManager);
			loader.load(
				url,
				(loadedModel) => {
					const extractedMaterials: MaterialMap = {};
					loadedModel.scene.traverse((child) => {
						if (child instanceof THREE.Mesh && child.material) {
							extractedMaterials[child.material.name] =
								child.material as THREE.MeshStandardMaterial;
						}
					});

					setModelData(loadedModel);
					setMaterials(extractedMaterials);
					setLoadingStatus((prev) => ({ ...prev, currentStep: 1 }));

					if (initArray) {
						runApplyMaterial(initArray, 1, extractedMaterials);
					} else {
						setLoadingStatus((prev) => ({
							...prev,
							isLoading: false,
							progress: 100,
						}));
					}
				},
				undefined,
				(error) => {
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
		[loadingManager, countTextureSteps, runApplyMaterial],
	);

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