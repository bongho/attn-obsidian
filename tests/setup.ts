// Import OpenAI shims for Node.js environment
import 'openai/shims/node';

// Mock Obsidian API
global.App = jest.fn();
global.Plugin = jest.fn();
global.PluginSettingTab = jest.fn();
global.Setting = jest.fn();
global.Notice = jest.fn();
global.TFile = jest.fn();
global.Vault = jest.fn();
global.Component = jest.fn();

// Mock DOM methods
Object.defineProperty(window, 'HTMLElement', {
  writable: true,
  value: class MockHTMLElement {},
});

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock File constructor
global.File = jest.fn().mockImplementation((bits, filename, options) => ({
  name: filename,
  size: bits.reduce((acc: number, bit: any) => acc + (bit.length || bit.byteLength || 0), 0),
  type: options?.type || '',
  lastModified: Date.now(),
})) as any;