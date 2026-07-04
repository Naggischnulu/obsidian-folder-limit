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
		[key: string]: any;
	};
	[key: string]: any;
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
			this.patchFileExplorer();
			this.triggerSort();
		});

		this.registerContextMenu();

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.patchFileExplorer();
			})
		);
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
							(window as any).folderLimitPluginStates = this.folderStates;
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
			return (leaves[0] as any).view;
		}
		return null;
	}

	/**
	 * Safely patches the FileExplorerView to intercept file list sorting.
	 * This prevents the virtual list scrolling glitch caused by simple CSS hiding.
	 */
	patchFileExplorer() {
		if (this.fileExplorerPatched) return;
		
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		const view = this.getFileExplorerView();
		if (!view) return;

		this.register(
			around(Object.getPrototypeOf(view), {
				getSortedFolderItems(old: any) {
					return function (this: any, ...args: any[]) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
						const sortedChildren: PathVirtualElement[] = old.call(this, ...args);
						
						if (!sortedChildren || sortedChildren.length === 0) {
							return sortedChildren;
						}

						try {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
							let folderPath = '';
							if (sortedChildren[0]?.file?.parent) {
								folderPath = sortedChildren[0].file.parent.path;
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
							} else if (args[0]?.file?.path) {
								folderPath = args[0].file.path;
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
							} else if (args[0]?.path) {
								folderPath = args[0].path;
							}

							if (!folderPath) return sortedChildren;

							// @ts-ignore - plugin is accessed from outside context
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
							const showAll = (window as any).folderLimitPluginStates?.[folderPath]; // Workaround to avoid this alias
							// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
							const limit = (window as any).folderLimitPluginLimit || 5;
							
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
	}
	
	/**
	 * Triggers Obsidian to resort and redraw the file explorer tree.
	 */
	triggerSort() {
		const view = this.getFileExplorerView() as any;
		if (view && typeof view.requestSort === 'function') {
			view.requestSort();
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		// Update global workaround for the monkey patch
		(window as any).folderLimitPluginLimit = this.settings.limit;
		(window as any).folderLimitPluginStates = this.folderStates;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		(window as any).folderLimitPluginLimit = this.settings.limit;
		this.triggerSort();
	}
}
