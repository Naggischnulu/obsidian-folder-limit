import { App, PluginSettingTab, Setting } from 'obsidian';
import FolderLimitPlugin from './main';

export interface FolderLimitSettings {
	limit: number;
}

export const DEFAULT_SETTINGS: FolderLimitSettings = {
	limit: 5,
};

export class FolderLimitSettingTab extends PluginSettingTab {
	plugin: FolderLimitPlugin;

	constructor(app: App, plugin: FolderLimitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('File limit')
			.setDesc('Number of files to show in a folder before hiding the rest.')
			.addText((text) =>
				text
					.setPlaceholder('5')
					.setValue(this.plugin.settings.limit.toString())
					.onChange(async (value) => {
						const limit = parseInt(value);
						if (!isNaN(limit) && limit > 0) {
							this.plugin.settings.limit = limit;
							await this.plugin.saveSettings();
							// Trigger a refresh of the file explorer view
							this.plugin.triggerSort();
						}
					}),
			);
	}
}
