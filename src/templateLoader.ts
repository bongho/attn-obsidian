import { TFile, Vault } from 'obsidian';

export class TemplateLoader {
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async loadTemplateFromFile(templatePath: string): Promise<string> {
    if (!templatePath || templatePath.trim() === '') {
      throw new Error('Template file path is empty');
    }

    try {
      // Get the file from the vault
      const file = this.vault.getAbstractFileByPath(templatePath);
      
      if (!file || !(file instanceof TFile)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      // Read the file content
      const content = await this.vault.read(file);
      return content;
    } catch (error) {
      console.error('Failed to load template file:', error);
      throw new Error(`Failed to load template file "${templatePath}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTemplateContent(useTemplateFile: boolean, templateFile: string, fallbackTemplate: string): Promise<string> {
    if (useTemplateFile && templateFile && templateFile.trim() !== '') {
      try {
        return await this.loadTemplateFromFile(templateFile);
      } catch (error) {
        console.warn('Failed to load template file, using fallback template:', error);
        return fallbackTemplate;
      }
    }
    return fallbackTemplate;
  }

  validateTemplateFile(templatePath: string): boolean {
    if (!templatePath || templatePath.trim() === '') {
      return false;
    }

    const file = this.vault.getAbstractFileByPath(templatePath);
    return file instanceof TFile;
  }
}