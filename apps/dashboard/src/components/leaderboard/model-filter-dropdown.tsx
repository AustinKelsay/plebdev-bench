/**
 * Purpose: Multi-select dropdown for leaderboard model filtering.
 * Exports: ModelFilterDropdown
 *
 * Invariants:
 * - Empty selection means all models
 * - Supports selecting one, many, or all models from a compact dropdown
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface ModelFilterDropdownProps {
	models: string[];
	selectedModels: string[];
	onSelectionChange: (selectedModels: string[]) => void;
}

const MODEL_SORT_COLLATOR = new Intl.Collator("en", { sensitivity: "variant" });

function buildTriggerLabel(
	selectedModels: string[],
	currentModels: string[],
): string {
	const selectedModelSet = new Set(selectedModels);
	const selectedCurrentModels = currentModels.filter((model) =>
		selectedModelSet.has(model),
	);
	const hasAllCurrentModels =
		currentModels.length > 0 &&
		selectedCurrentModels.length === currentModels.length;
	if (
		selectedModels.length === 0 ||
		selectedCurrentModels.length === 0 ||
		hasAllCurrentModels
	) {
		return "All models";
	}
	if (selectedCurrentModels.length === 1) {
		return selectedCurrentModels[0] ?? "All models";
	}
	return `${selectedCurrentModels.length} models selected`;
}

/**
 * Renders a multi-select dropdown for model filtering.
 *
 * @param props - Model filter props
 * @param props.models - Sorted list of available models
 * @param props.selectedModels - Explicitly selected models; empty means all
 * @param props.onSelectionChange - Called whenever the selection changes
 * @returns React element containing the model filter dropdown
 * @throws {TypeError} When callers violate the runtime props contract, such as
 * passing non-array `models`/`selectedModels` values or omitting
 * `onSelectionChange`
 */
export function ModelFilterDropdown(props: ModelFilterDropdownProps) {
	const { models, selectedModels, onSelectionChange } = props;
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const normalizedSelectedIds = useMemo(() => {
		const modelSet = new Set(models);
		return new Set(selectedModels.filter((selected) => modelSet.has(selected)));
	}, [models, selectedModels]);
	const triggerLabel = useMemo(
		() => buildTriggerLabel(selectedModels, models),
		[selectedModels, models],
	);

	useEffect(() => {
		if (!isOpen) {
			return undefined;
		}

		function handlePointerDown(event: MouseEvent) {
			if (!containerRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		function handleEscape(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen]);

	function handleModelToggle(model: string) {
		const modelSet = new Set(models);
		const normalizedSelectedModels = selectedModels.filter((selected) =>
			modelSet.has(selected),
		);
		const normalizedSelectedModelSet = new Set(normalizedSelectedModels);
		const allSelected =
			selectedModels.length === 0 ||
			normalizedSelectedModelSet.size === 0 ||
			(models.length > 0 &&
				models.every((availableModel) =>
					normalizedSelectedModelSet.has(availableModel),
				));

		if (normalizedSelectedModelSet.has(model)) {
			onSelectionChange(
				normalizedSelectedModels
					.filter((selected) => selected !== model)
					.sort((a, b) => MODEL_SORT_COLLATOR.compare(a, b)),
			);
			return;
		}

		if (allSelected) {
			onSelectionChange(
				models
					.filter((availableModel) => availableModel !== model)
					.sort((a, b) => MODEL_SORT_COLLATOR.compare(a, b)),
			);
			return;
		}

		onSelectionChange(
			[...normalizedSelectedModels, model].sort((a, b) =>
				MODEL_SORT_COLLATOR.compare(a, b),
			),
		);
	}

	function handleOptionKeyDown(
		event: ReactKeyboardEvent<HTMLButtonElement>,
		model: string,
	) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleModelToggle(model);
		}
	}

	return (
		<div ref={containerRef} className="relative">
			<Button
				type="button"
				variant="outline"
				className="flex h-9 w-full items-center justify-between px-3 py-2 text-sm"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				onClick={() => setIsOpen((open) => !open)}
			>
				<span className="truncate text-left">{triggerLabel}</span>
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 opacity-50 transition-transform",
						isOpen ? "rotate-180" : "rotate-0",
					)}
				/>
			</Button>

			{isOpen ? (
				<div className="absolute left-0 z-50 mt-2 w-full min-w-[18rem] rounded border border-border bg-popover shadow-md">
					<div className="border-b border-border px-3 py-2">
						<p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
							Model Filter
						</p>
						<p className="mt-1 text-xs text-foreground-faint">
							Choose one model, a small set, or leave empty for all.
						</p>
					</div>

					<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2"
							onClick={() => onSelectionChange([])}
						>
							All models
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2"
							onClick={() =>
								onSelectionChange(
									[...models].sort((a, b) => MODEL_SORT_COLLATOR.compare(a, b)),
								)
							}
						>
							Select all
						</Button>
					</div>

					<div className="max-h-80 overflow-y-auto p-1">
						{models.map((model) => {
							const isSelected =
								selectedModels.length === 0 ||
								normalizedSelectedIds.size === 0 ||
								normalizedSelectedIds.has(model);

							return (
								<button
									key={model}
									type="button"
									className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
									role="menuitemcheckbox"
									aria-checked={isSelected}
									onClick={() => handleModelToggle(model)}
									onKeyDown={(event) => handleOptionKeyDown(event, model)}
								>
									<span
										className={cn(
											"flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border",
											isSelected
												? "bg-primary text-primary-foreground"
												: "bg-background text-transparent",
										)}
									>
										<Check className="h-3 w-3" />
									</span>
									<span className="truncate">{model}</span>
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
