// Mock obsidian module
jest.mock('obsidian', () => {
  class MockTFile {
    name: string;
    path: string;
    
    constructor(path: string) {
      this.path = path;
      this.name = path.split('/').pop() || path;
    }
  }
  
  return {
    TFile: MockTFile,
    Vault: jest.fn(),
  };
});

import { TemplateLoader } from '../src/templateLoader';
import { TFile } from 'obsidian';

class MockVault {
  private files: Map<string, string> = new Map();
  
  addFile(path: string, content: string) {
    this.files.set(path, content);
  }
  
  getAbstractFileByPath(path: string) {
    if (this.files.has(path)) {
      return new TFile(path);
    }
    return null;
  }
  
  async read(file: TFile): Promise<string> {
    const content = this.files.get(file.path);
    if (content === undefined) {
      throw new Error(`Template file not found: ${file.path}`);
    }
    return content;
  }
}

describe('TemplateLoader', () => {
  let templateLoader: TemplateLoader;
  let mockVault: MockVault;

  beforeEach(() => {
    mockVault = new MockVault();
    templateLoader = new TemplateLoader(mockVault as any);
  });

  describe('loadTemplateFromFile', () => {
    test('should load template content from existing file', async () => {
      const templateContent = '# {{filename}}\n\n{{summary}}\n\n## Transcript\n{{transcript}}';
      mockVault.addFile('Templates/test.md', templateContent);

      const result = await templateLoader.loadTemplateFromFile('Templates/test.md');
      
      expect(result).toBe(templateContent);
    });

    test('should throw error for non-existent file', async () => {
      await expect(templateLoader.loadTemplateFromFile('nonexistent.md'))
        .rejects.toThrow('Template file not found: nonexistent.md');
    });

    test('should throw error for empty path', async () => {
      await expect(templateLoader.loadTemplateFromFile(''))
        .rejects.toThrow('Template file path is empty');
    });
  });

  describe('getTemplateContent', () => {
    test('should return template file content when useTemplateFile is true', async () => {
      const templateContent = '# Custom Template\n{{summary}}';
      const fallbackContent = '# Fallback Template\n{{summary}}';
      mockVault.addFile('template.md', templateContent);

      const result = await templateLoader.getTemplateContent(true, 'template.md', fallbackContent);
      
      expect(result).toBe(templateContent);
    });

    test('should return fallback template when useTemplateFile is false', async () => {
      const templateContent = '# Custom Template\n{{summary}}';
      const fallbackContent = '# Fallback Template\n{{summary}}';
      mockVault.addFile('template.md', templateContent);

      const result = await templateLoader.getTemplateContent(false, 'template.md', fallbackContent);
      
      expect(result).toBe(fallbackContent);
    });

    test('should return fallback when template file fails to load', async () => {
      const fallbackContent = '# Fallback Template\n{{summary}}';

      const result = await templateLoader.getTemplateContent(true, 'nonexistent.md', fallbackContent);
      
      expect(result).toBe(fallbackContent);
    });
  });

  describe('validateTemplateFile', () => {
    test('should return true for existing file', () => {
      mockVault.addFile('valid.md', 'content');
      
      const result = templateLoader.validateTemplateFile('valid.md');
      
      expect(result).toBe(true);
    });

    test('should return false for non-existent file', () => {
      const result = templateLoader.validateTemplateFile('nonexistent.md');
      
      expect(result).toBe(false);
    });

    test('should return false for empty path', () => {
      const result = templateLoader.validateTemplateFile('');
      
      expect(result).toBe(false);
    });
  });
});