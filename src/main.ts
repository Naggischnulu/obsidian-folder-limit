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
		
		const view = this.getFileExplorerView();
		if (!view) return;

		const plugin = this;

		this.register(
			around(Object.getPrototypeOf(view), {
				getSortedFolderItems(old: any) {
					return function (this: any, ...args: any[]) {
						// Retrieve the original unedited sorted children array from Obsidian
						const sortedChildren: PathVirtualElement[] = old.call(this, ...args);
						
						if (!sortedChildren || sortedChildren.length === 0) {
							return sortedChildren;
						}

						try {
							// Attempt to determine the folder path this array belongs to.
							let folderPath = '';
							if (sortedChildren[0]?.file?.parent) {
								folderPath = sortedChildren[0].file.parent.path;
							} else if (args[0]?.file?.path) {
								folderPath = args[0].file.path;
							} else if (args[0]?.path) {
								folderPath = args[0].path;
							}

							if (!folderPath) return sortedChildren;

							const showAll = plugin.folderStates[folderPath];
							const limit = plugin.settings.limit;
							
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
			(await this.loadData()) as Partial<FolderLimitSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.triggerSort();
	}
}
