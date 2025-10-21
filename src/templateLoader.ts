import { TFile, Vault, normalizePath } from 'obsidian';

export class TemplateLoader {
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  /**
   * Validate template path to prevent path traversal attacks
   * @param templatePath - Path to validate
   * @returns true if path is safe
   * @throws Error if path contains malicious patterns
   */
  private validateTemplatePath(templatePath: string): void {
    // Normalize the path first
    const normalized = normalizePath(templatePath);

    // Check for path traversal patterns
    if (normalized.includes('..')) {
      throw new Error('Invalid template path: path traversal detected');
    }

    // Ensure path doesn't try to access system directories
    const dangerousPatterns = [
      /^\//, // Absolute paths from root
      /^[a-zA-Z]:/, // Windows drive letters
      /\.\.\//, // Parent directory references
      /\.\.\\/, // Windows parent directory
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(templatePath)) {
        throw new Error(`Invalid template path: contains unsafe pattern "${pattern}"`);
      }
    }

    // Additional check: ensure normalized path is still within vault
    if (normalized.startsWith('/') || normalized.startsWith('\\')) {
      throw new Error('Invalid template path: absolute paths not allowed');
    }
  }

  async loadTemplateFromFile(templatePath: string): Promise<string> {
    if (!templatePath || templatePath.trim() === '') {
      throw new Error('Template file path is empty');
    }

    // Security: validate path before accessing
    this.validateTemplatePath(templatePath);

    try {
      // Normalize path for consistent handling
      const normalizedPath = normalizePath(templatePath);

      // Get the file from the vault
      const file = this.vault.getAbstractFileByPath(normalizedPath);

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

    try {
      // Security check first
      this.validateTemplatePath(templatePath);

      // Then check if file exists
      const normalizedPath = normalizePath(templatePath);
      const file = this.vault.getAbstractFileByPath(normalizedPath);
      return file instanceof TFile;
    } catch (error) {
      // Path validation failed
      console.warn('Template path validation failed:', error);
      return false;
    }
  }
}