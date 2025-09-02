export class App {
  workspace = {
    on: jest.fn(),
    off: jest.fn(),
  };
  vault = {
    create: jest.fn(),
    exists: jest.fn(),
    readBinary: jest.fn(),
  };
  setting = {
    openTabById: jest.fn(),
    closeActiveTab: jest.fn(),
  };
}

export class Plugin {
  app: App;
  manifest: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addSettingTab = jest.fn();
  registerEvent = jest.fn();
  loadData = jest.fn();
  saveData = jest.fn();
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: any;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: jest.fn(),
      createEl: jest.fn().mockReturnValue({
        innerHTML: '',
        children: [],
      }),
    };
  }
}

export class Setting {
  constructor(containerEl: any) {}
  
  setName = jest.fn().mockReturnThis();
  setDesc = jest.fn().mockReturnThis();
  addText = jest.fn().mockReturnThis();
}

export class Notice {
  constructor(message: string, timeout?: number) {}
  hide = jest.fn();
}

export class TFile {
  name: string;
  basename: string;
  extension: string;
  path: string;

  constructor(name: string) {
    this.name = name;
    this.basename = name.replace(/\.[^/.]+$/, '');
    this.extension = name.split('.').pop() || '';
    this.path = `/${name}`;
  }
}

export class Vault {
  create = jest.fn();
  exists = jest.fn();
  readBinary = jest.fn();
}

export class Component {}

export default {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  TFile,
  Vault,
  Component,
};