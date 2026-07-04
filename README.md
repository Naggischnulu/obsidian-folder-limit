# Obsidian Folder Limit

A lightweight Obsidian plugin that helps you keep your file explorer clean by limiting the number of files visible in long folders.

If you have folders with hundreds of files (like daily notes, attachments, or Zettelkasten folders), your file explorer can quickly become cluttered and difficult to navigate. This plugin allows you to set a maximum number of files to show per folder, hiding the rest until you need them.

## Features

- **Limit Visible Files**: Set a global limit (e.g., 5 files) for how many files are shown in a folder.
- **Native Context Menu**: Right-click on any folder to toggle between "Show all files" and "Show less files".
- **Zero Scroll Glitches**: Deeply integrated into Obsidian's virtual list rendering to ensure your scrollbars remain accurate, completely avoiding the UI glitches caused by other CSS-hiding plugins.
- **Highly Performant**: Operates without DOM mutation observers, ensuring your vault stays blazing fast even with thousands of files.

## How to use

1. Install and enable the plugin.
2. By default, folders will only show the first 5 files.
3. To view all files in a folder, simply **right-click** the folder in the file explorer and select **"Show all files"**.
4. To collapse the folder back to the limit, right-click it again and select **"Show less files"**.

## Settings

You can customize the maximum number of files shown per folder in the plugin settings under **Folder Limit**. Changing this value updates the file tree immediately.

## Installation

### From the Community Plugins list
1. Open Obsidian Settings.
2. Go to **Community plugins** and ensure Safe mode is **off**.
3. Click **Browse** and search for "Folder Limit".
4. Install and enable the plugin.

### Manual Installation
1. Download the `main.js`, `manifest.json`, and `styles.css` files from the latest [Release](https://github.com/Naggischnulu/obsidian-folder-limit/releases) on GitHub.
2. Create a new folder named `folder-limit` inside your vault's `.obsidian/plugins/` directory.
3. Place the downloaded files into that folder.
4. Reload Obsidian and enable the plugin in the Community Plugins settings.

## License

This project is licensed under the 0-BSD License.
