/** biome-ignore-all lint/style/noNonNullAssertion: <> */
import { useCallback } from "react";
import * as THREE from "three";
import { useModelContext } from "./ModelProvider";
import type { ARButtonProps, ARMode } from "./types";

// ─────────────────────────────────────────────
// Device / support detection
// ─────────────────────────────────────────────

const isIOS = (): boolean =>
	/iphone|ipad|ipod/i.test(navigator.userAgent) ||
	(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const isAndroid = (): boolean => /android/i.test(navigator.userAgent);

const supportsWebXRAR = (): Promise<boolean> =>
	navigator.xr?.isSessionSupported("immersive-ar") ?? Promise.resolve(false);

// ─────────────────────────────────────────────
// Mode launchers
// ─────────────────────────────────────────────

function launchQuickLook(url: string, owned: boolean) {
	// O Safari exige uma âncora com rel="ar" e um filho <img> no DOM
	// para ativar o Quick Look. Criamos e removemos programaticamente
	// para não deixar elementos inacessíveis permanentes no markup.
	const anchor = document.createElement("a");
	anchor.setAttribute("rel", "ar");
	anchor.href = url;
	anchor.appendChild(document.createElement("img"));
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	if (owned) setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function launchSceneViewer(
	url: string,
	owned: boolean,
	title?: string,
	onFallback?: () => void,
) {
	const fallback = encodeURIComponent(window.location.href);

	const params = new URLSearchParams({
		file: url,
		mode: "ar_preferred",
		...(title ? { title } : {}),
	});

	const intent =
		`intent://arvr.google.com/scene-viewer/1.0?${params}` +
		`#Intent;scheme=https;package=com.google.ar.core;` +
		`action=android.intent.action.VIEW;` +
		`S.browser_fallback_url=${fallback};end;`;

	const timer = setTimeout(() => {
		if (owned) URL.revokeObjectURL(url);
		onFallback?.();
	}, 2000);

	const onBlur = () => {
		clearTimeout(timer);
		window.removeEventListener("blur", onBlur);
		if (owned) setTimeout(() => URL.revokeObjectURL(url), 60_000);
	};
	window.addEventListener("blur", onBlur);

	window.location.href = intent;
}

async function launchWebXR(
	modelScene: THREE.Object3D,
	modelScale: [number, number, number],
	onSessionEnd?: () => void,
) {
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.xr.enabled = true;
	Object.assign(renderer.domElement.style, {
		position: "fixed",
		inset: "0",
		zIndex: "9999",
	});
	document.body.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.add(new THREE.AmbientLight(0xffffff, 0.8));
	const dir = new THREE.DirectionalLight(0xffffff, 1.2);
	dir.position.set(2, 4, 3);
	scene.add(dir);

	const modelRoot = new THREE.Group();
	modelRoot.add(modelScene.clone(true));
	modelRoot.visible = false;
	scene.add(modelRoot);

	const session = await navigator.xr!.requestSession("immersive-ar", {
		requiredFeatures: ["hit-test"],
	});
	renderer.xr.setReferenceSpaceType("local");
	await renderer.xr.setSession(session);

	const viewerSpace = await session.requestReferenceSpace("viewer");
	const hitTestSource = await session.requestHitTestSource!({
		space: viewerSpace,
	})!;

	let placed = false;
	const modelPos = new THREE.Vector3();
	let modelRotY = 0;
	let scaleFactor = 1;

	interface TouchPoint {
		id: number;
		x: number;
		y: number;
	}
	let prev: TouchPoint[] = [];

	const dist = (a: TouchPoint, b: TouchPoint) =>
		Math.hypot(b.x - a.x, b.y - a.y);
	const angle = (a: TouchPoint, b: TouchPoint) =>
		Math.atan2(b.y - a.y, b.x - a.x);

	const raycaster = new THREE.Raycaster();
	const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
	const intersection = new THREE.Vector3();
	const ndcOf = (x: number, y: number) =>
		new THREE.Vector2(
			(x / window.innerWidth) * 2 - 1,
			-(y / window.innerHeight) * 2 + 1,
		);

	const onTouchStart = (e: TouchEvent) => {
		if (!placed) return;
		prev = Array.from(e.touches).map((t) => ({
			id: t.identifier,
			x: t.clientX,
			y: t.clientY,
		}));
	};

	const onTouchMove = (e: TouchEvent) => {
		if (!placed) return;
		e.preventDefault();
		const curr: TouchPoint[] = Array.from(e.touches).map((t) => ({
			id: t.identifier,
			x: t.clientX,
			y: t.clientY,
		}));

		if (curr.length === 1 && prev.length === 1) {
			const camera = renderer.xr.getCamera();
			dragPlane.constant = -modelPos.y;
			raycaster.setFromCamera(ndcOf(curr[0].x, curr[0].y), camera);
			const c = raycaster.ray.intersectPlane(dragPlane, intersection.clone());
			raycaster.setFromCamera(ndcOf(prev[0].x, prev[0].y), camera);
			const p = raycaster.ray.intersectPlane(dragPlane, intersection.clone());
			if (c && p) {
				modelPos.x += c.x - p.x;
				modelPos.z += c.z - p.z;
			}
		} else if (curr.length === 2 && prev.length === 2) {
			const pd = dist(prev[0], prev[1]);
			const cd = dist(curr[0], curr[1]);
			if (pd > 0)
				scaleFactor = Math.max(0.1, Math.min(10, scaleFactor * (cd / pd)));
			modelRotY += angle(curr[0], curr[1]) - angle(prev[0], prev[1]);
		}

		modelRoot.position.copy(modelPos);
		modelRoot.rotation.y = modelRotY;
		modelRoot.scale.set(
			modelScale[0] * scaleFactor,
			modelScale[1] * scaleFactor,
			modelScale[2] * scaleFactor,
		);
		prev = curr;
	};

	renderer.domElement.addEventListener("touchstart", onTouchStart, {
		passive: true,
	});
	renderer.domElement.addEventListener("touchmove", onTouchMove, {
		passive: false,
	});

	const cleanup = () => {
		renderer.setAnimationLoop(null);
		hitTestSource?.cancel();
		renderer.domElement.removeEventListener("touchstart", onTouchStart);
		renderer.domElement.removeEventListener("touchmove", onTouchMove);
		renderer.dispose();
		document.body.removeChild(renderer.domElement);
		onSessionEnd?.();
	};
	session.addEventListener("end", cleanup);

	renderer.setAnimationLoop((_, frame) => {
		if (!frame) return;
		const refSpace = renderer.xr.getReferenceSpace();

		if (!placed && hitTestSource && refSpace) {
			const results = frame.getHitTestResults(hitTestSource);
			if (results.length > 0) {
				const pose = results[0].getPose(refSpace);
				if (pose) {
					const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
					modelPos.setFromMatrixPosition(m);
					modelRoot.position.copy(modelPos);
					modelRoot.rotation.setFromRotationMatrix(m);
					modelRoot.scale.set(...modelScale);
					modelRoot.visible = true;
					placed = true;
				}
			}
		}

		renderer.render(scene, renderer.xr.getCamera());
	});
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

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
export function ARButton({
	prefer = ["webxr", "sceneviewer", "quicklook"],
	glbUrl,
	usdzUrl,
	title,
	children,
	className,
	style,
	modelScale = [1, 1, 1],
	onOpen,
	onSessionEnd,
}: ARButtonProps) {
	const { model, exportModel } = useModelContext();

	const handleClick = useCallback(async () => {
		if (!model) return;

		// Resolve a URL do GLB: usa a fornecida ou exporta e cria blob URL
		const resolveGlb = async (): Promise<{ url: string; owned: boolean }> => {
			if (glbUrl) return { url: glbUrl, owned: false };
			const blob = (await exportModel("glb")) as Blob;
			return { url: URL.createObjectURL(blob), owned: true };
		};

		// Resolve a URL do USDZ: usa a fornecida ou exporta e cria blob URL
		const resolveUsdz = async (): Promise<{ url: string; owned: boolean }> => {
			if (usdzUrl) return { url: usdzUrl, owned: false };
			const blob = (await exportModel("usdz")) as Blob;
			return { url: URL.createObjectURL(blob), owned: true };
		};

		// Itera a lista de preferências e tenta o primeiro modo disponível
		const tryModes = async (modes: ARMode[]) => {
			for (const mode of modes) {
				if (mode === "quicklook" && isIOS()) {
					const { url, owned } = await resolveUsdz();
					onOpen?.("quicklook");
					launchQuickLook(url, owned);
					return;
				}

				if (mode === "sceneviewer" && isAndroid()) {
					const { url, owned } = await resolveGlb();
					onOpen?.("sceneviewer");
					const remaining = modes.slice(modes.indexOf("sceneviewer") + 1);
					await launchSceneViewer(url, owned, title, () => tryModes(remaining));
					return;
				}

				if (mode === "webxr" && (await supportsWebXRAR())) {
					onOpen?.("webxr");
					await launchWebXR(model.scene, modelScale, onSessionEnd);
					return;
				}
			}

			console.warn("[ARButton] Nenhum modo AR disponível neste dispositivo.");
		};

		await tryModes(prefer);
	}, [
		model,
		exportModel,
		prefer,
		glbUrl,
		usdzUrl,
		title,
		modelScale,
		onOpen,
		onSessionEnd,
	]);

	return (
		<button
			type="button"
			className={className}
			style={style}
			onClick={handleClick}
			disabled={!model}
		>
			{children}
		</button>
	);
}
