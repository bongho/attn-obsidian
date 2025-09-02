import { Vault } from 'obsidian';

export class NoteCreator {
  private vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async createNote(fullPath: string, content: string): Promise<void> {
    // Validate inputs
    if (!fullPath || typeof fullPath !== 'string' || fullPath.trim() === '') {
      throw new Error('유효하지 않은 파일 경로입니다.');
    }

    if (content === null || content === undefined) {
      throw new Error('노트 내용이 필요합니다.');
    }

    try {
      // Create the note at the specified path with the given content
      await this.vault.create(fullPath, content);
    } catch (error) {
      if (error instanceof Error) {
        // Re-throw our custom validation errors
        if (error.message.includes('유효하지 않은') || error.message.includes('필요합니다')) {
          throw error;
        }
        
        // For vault errors, wrap them
        throw new Error(`노트 생성 실패: ${error.message}`);
      }
      
      // Handle non-Error objects
      throw new Error(`노트 생성 실패: ${error}`);
    }
  }
}