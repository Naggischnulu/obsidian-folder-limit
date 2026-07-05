import { Plugin, TAbstractFile } from 'obsidian';
import { around } from 'monkey-around';
import { DEFAULT_SETTINGS, FolderLimitSettings, FolderLimitSettingTab } from './settings';

/**
 * Interface representing Obsidian's internal PathVirtualElement.
 * This is used by the file explorer's virtual list renderer.
 */
interface PathVirtualElement {
	file: TAbstractFile;
	info?: {
		hidden?: boolean;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export default class FolderLimitPlugin extends Plugin {
	settings!: FolderLimitSettings;
	// Tracks whether a user has explicitly chosen to "show all files" for a specific folder path.
	folderStates: Record<string, boolean> = {}; 
	fileExplorerPatched = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FolderLimitSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.initPatch();
		});

		this.registerContextMenu();

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.initPatch();
			})
		);

		// Fallback for mobile: repeatedly try to patch the file explorer until it succeeds.
		// Obsidian mobile often defers initialization of views.
		const patchInterval = window.setInterval(() => {
			if (this.fileExplorerPatched) {
				window.clearInterval(patchInterval);
			} else {
				this.initPatch();
			}
		}, 1000);
		this.registerInterval(patchInterval);
	}

	initPatch() {
		if (this.fileExplorerPatched) return;
		if (this.patchFileExplorer()) {
			this.triggerSort();
		}
	}

	onunload() {
		// The patch is automatically removed because we used this.register(around(...))
		// Trigger a sort so the file explorer redraws and unhides any previously limited files.
		this.triggerSort();
	}

	/**
	 * Registers a native context menu item on folders.
	 * This completely avoids brittle DOM manipulation and MutationObservers.
	 */
	registerContextMenu() {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				// We only add this toggle to folders
				if (!file || !('children' in file)) return;
				
				const isExpanded = this.folderStates[file.path];
				
				menu.addItem((item) => {
					item
						.setTitle(isExpanded ? "Show less files" : "Show all files")
						.setIcon(isExpanded ? "minimize" : "maximize")
						.onClick(() => {
							// Toggle the explicit visibility state for this specific folder
							this.folderStates[file.path] = !isExpanded;
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
							(window as unknown as { folderLimitPluginStates: Record<string, boolean> }).folderLimitPluginStates = this.folderStates;
							this.triggerSort();
						});
				});
			})
		);
	}

	/**
	 * Retrieves the active File Explorer view instance.
	 */
	getFileExplorerView() {
		const leaves = this.app.workspace.getLeavesOfType('file-explorer');
		if (leaves.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Obsidian API is untyped
			return (leaves[0] as unknown as { view: unknown }).view;
		}
		return null;
	}

	/**
	 * Safely patches the FileExplorerView to intercept file list sorting.
	 * This prevents the virtual list scrolling glitch caused by simple CSS hiding.
	 * Returns true if successfully patched.
	 */
	patchFileExplorer(): boolean {
		if (this.fileExplorerPatched) return true;
		
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
		const view = this.getFileExplorerView();
		if (!view) return false;

		// Ensure we are patching the real view prototype, not a mobile placeholder
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Obsidian API is untyped
		const proto = Object.getPrototypeOf(view);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
		if (typeof proto.getSortedFolderItems !== 'function') {
			return false;
		}

		this.register(
			around(proto, {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Obsidian API is untyped
				getSortedFolderItems(old: Function) {
					return function (this: unknown, ...args: unknown[]) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- Obsidian API is untyped
						const sortedChildren: PathVirtualElement[] = old.call(this, ...args);
						
						if (!sortedChildren || sortedChildren.length === 0) {
							return sortedChildren;
						}

						try {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
							let folderPath = '';
							const arg0 = args[0] as { file?: { path: string }, path?: string };
							if (sortedChildren[0]?.file?.parent) {
								folderPath = sortedChildren[0].file.parent.path;
							} else if (arg0?.file?.path) {
								folderPath = arg0.file.path;
							} else if (arg0?.path) {
								folderPath = arg0.path;
							}

							if (!folderPath) return sortedChildren;

							// @ts-ignore - plugin is accessed from outside context
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian API is untyped
							const windowAsAny = window as unknown as { folderLimitPluginStates?: Record<string, boolean>, folderLimitPluginLimit?: number };
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian API is untyped
							const showAll = windowAsAny.folderLimitPluginStates?.[folderPath];
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian API is untyped
							const limit = windowAsAny.folderLimitPluginLimit || 5;
							
							// If the folder exceeds the limit and the user hasn't toggled "show all"
							if (sortedChildren.length > limit) {
								const filtered = sortedChildren.filter((vEl: PathVirtualElement, index: number) => {
									if (index >= limit && !showAll) {
										// Tell Obsidian's virtual list renderer to skip this item entirely
										if (vEl.info) vEl.info.hidden = true;
										return false; 
									}
									// Ensure items are visible otherwise
									if (vEl.info) vEl.info.hidden = false;
									return true;
								});
								
								return filtered;
							} else {
								return sortedChildren;
							}
						} catch (error) {
							// Failsafe: if Obsidian changes its internal API structure, 
							// we catch the error to prevent the file explorer from crashing.
							console.warn("Folder Limit Plugin: Failed to process folder items", error);
							return sortedChildren;
						}
					};
				}
			})
		);

		this.fileExplorerPatched = true;
		return true;
	}
	
	/**
	 * Triggers Obsidian to resort and redraw the file explorer tree.
	 */
	triggerSort() {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Obsidian API is untyped
		const view = this.getFileExplorerView() as { requestSort?: () => void };
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API is untyped
		if (view && typeof view.requestSort === 'function') {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- Obsidian API is untyped
			view.requestSort();
		}
	}

	async loadSettings() {
		const savedData = (await this.loadData()) as unknown;
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			savedData as Partial<FolderLimitSettings>
		);
		// Update global workaround for the monkey patch
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
		(window as unknown as { folderLimitPluginLimit: number }).folderLimitPluginLimit = this.settings.limit;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
		(window as unknown as { folderLimitPluginStates: Record<string, boolean> }).folderLimitPluginStates = this.folderStates;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Obsidian API is untyped
		(window as unknown as { folderLimitPluginLimit: number }).folderLimitPluginLimit = this.settings.limit;
		this.triggerSort();
	}
}
