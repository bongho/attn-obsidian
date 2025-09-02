import { NoteCreator } from '../src/noteCreator';

// Mock Obsidian Vault
class MockVault {
  create = jest.fn();
  
  constructor() {
    this.create.mockResolvedValue(undefined);
  }
}

describe('NoteCreator', () => {
  let noteCreator: NoteCreator;
  let mockVault: MockVault;

  beforeEach(() => {
    mockVault = new MockVault();
    noteCreator = new NoteCreator(mockVault as any);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create NoteCreator instance with vault', () => {
      expect(noteCreator).toBeInstanceOf(NoteCreator);
      expect((noteCreator as any).vault).toBe(mockVault);
    });
  });

  describe('createNote', () => {
    const testContent = `# 회의록

**원본 파일:** meeting.m4a
**생성 날짜:** 2025-09-02

## 요약

이것은 테스트 요약입니다.

---
*이 노트는 ATTN 플러그인에 의해 자동 생성되었습니다.*`;

    test('should create note with given fullPath and content', async () => {
      const fullPath = 'Notes/Meetings/meeting-2025-09-02.md';
      
      await noteCreator.createNote(fullPath, testContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, testContent);
    });

    test('should handle root path correctly', async () => {
      const fullPath = 'meeting-notes.md';
      
      await noteCreator.createNote(fullPath, testContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, testContent);
    });

    test('should handle nested folder paths', async () => {
      const fullPath = 'Notes/2025/September/meeting-02.md';
      
      await noteCreator.createNote(fullPath, testContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, testContent);
    });

    test('should handle Korean folder and file names', async () => {
      const fullPath = '회의록/2025년/9월/회의-02일.md';
      const koreanContent = `# 회의록

**파일명:** 회의녹음.m4a
**날짜:** 2025-09-02

## 요약

한글 요약 내용입니다.`;
      
      await noteCreator.createNote(fullPath, koreanContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, koreanContent);
    });

    test('should handle empty content', async () => {
      const fullPath = 'empty-note.md';
      const emptyContent = '';
      
      await noteCreator.createNote(fullPath, emptyContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, emptyContent);
    });

    test('should handle special characters in path', async () => {
      const fullPath = 'Notes/Meeting (2025-09-02) [Important].md';
      
      await noteCreator.createNote(fullPath, testContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, testContent);
    });

    test('should handle vault creation errors', async () => {
      const error = new Error('Failed to create file');
      mockVault.create.mockRejectedValue(error);
      const fullPath = 'test.md';

      await expect(noteCreator.createNote(fullPath, testContent))
        .rejects.toThrow('노트 생성 실패: Failed to create file');
    });

    test('should preserve content formatting exactly', async () => {
      const formattedContent = `# 회의록

## 주요 내용

### 논의사항
1. **첫 번째 안건**
   - 세부 항목 A
   - 세부 항목 B

2. **두 번째 안건**
   - 세부 항목 C

### 결론
> 중요한 결정사항

\`\`\`javascript
// 코드 예시
const result = processData();
\`\`\`

---
*생성 시각: 2025-09-02 14:30*`;

      const fullPath = 'formatted-note.md';
      
      await noteCreator.createNote(fullPath, formattedContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, formattedContent);
    });

    test('should handle long content without issues', async () => {
      const longContent = 'A'.repeat(10000) + '\n\n' + 'B'.repeat(5000);
      const fullPath = 'long-note.md';
      
      await noteCreator.createNote(fullPath, longContent);

      expect(mockVault.create).toHaveBeenCalledWith(fullPath, longContent);
    });
  });

  describe('error handling', () => {
    test('should handle null fullPath', async () => {
      await expect(noteCreator.createNote(null as any, 'content'))
        .rejects.toThrow('유효하지 않은 파일 경로입니다.');
    });

    test('should handle undefined fullPath', async () => {
      await expect(noteCreator.createNote(undefined as any, 'content'))
        .rejects.toThrow('유효하지 않은 파일 경로입니다.');
    });

    test('should handle empty fullPath', async () => {
      await expect(noteCreator.createNote('', 'content'))
        .rejects.toThrow('유효하지 않은 파일 경로입니다.');
    });

    test('should handle null content', async () => {
      await expect(noteCreator.createNote('test.md', null as any))
        .rejects.toThrow('노트 내용이 필요합니다.');
    });

    test('should handle undefined content', async () => {
      await expect(noteCreator.createNote('test.md', undefined as any))
        .rejects.toThrow('노트 내용이 필요합니다.');
    });

    test('should handle vault errors with proper error messages', async () => {
      const permissionError = new Error('Permission denied');
      mockVault.create.mockRejectedValue(permissionError);
      
      await expect(noteCreator.createNote('test.md', 'content'))
        .rejects.toThrow('노트 생성 실패: Permission denied');
    });

    test('should handle unknown vault errors', async () => {
      mockVault.create.mockRejectedValue('Unknown error');
      
      await expect(noteCreator.createNote('test.md', 'content'))
        .rejects.toThrow('노트 생성 실패: Unknown error');
    });
  });
});