import { TemplateProcessor } from '../src/templateProcessor';

// Mock moment for date/time formatting
jest.mock('moment', () => {
  const moment = jest.fn((date?: any) => {
    const mockMoment = {
      format: jest.fn((format: string) => {
        // Mock different date formats
        if (format === 'YYYY-MM-DD') return '2025-09-02';
        if (format === 'YYYY/MM/DD') return '2025/09/02';
        if (format === 'HH:mm') return '14:30';
        if (format === 'HH-mm') return '14-30';
        if (format === 'YYYY-MM-DD HH:mm') return '2025-09-02 14:30';
        return format;
      }),
    };
    return mockMoment;
  });
  
  // Mock static moment calls
  moment.mockImplementation(() => {
    return {
      format: jest.fn((format: string) => {
        if (format === 'YYYY-MM-DD') return '2025-09-02';
        if (format === 'YYYY/MM/DD') return '2025/09/02';
        if (format === 'HH:mm') return '14:30';
        if (format === 'HH-mm') return '14-30';
        if (format === 'YYYY-MM-DD HH:mm') return '2025-09-02 14:30';
        return format;
      }),
    };
  });
  
  return moment;
});

describe('TemplateProcessor', () => {
  let templateProcessor: TemplateProcessor;
  const mockData = {
    filename: '회의녹음.m4a',
    summary: '이것은 회의 요약입니다.\n\n주요 내용:\n- 항목 1\n- 항목 2',
    transcript: '안녕하세요. 오늘 회의를 시작하겠습니다. 첫 번째 안건은...',
  };

  beforeEach(() => {
    templateProcessor = new TemplateProcessor();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create TemplateProcessor instance', () => {
      expect(templateProcessor).toBeInstanceOf(TemplateProcessor);
    });
  });

  describe('process method', () => {
    test('should replace {{filename}} placeholder', () => {
      const template = '회의록_{{filename}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('회의록_회의녹음.m4a');
    });

    test('should replace {{summary}} placeholder', () => {
      const template = '# 요약\n\n{{summary}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe(`# 요약\n\n${mockData.summary}`);
    });

    test('should replace {{transcript}} placeholder', () => {
      const template = '## 전체 내용\n\n{{transcript}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe(`## 전체 내용\n\n${mockData.transcript}`);
    });

    test('should replace {{date}} with default format', () => {
      const template = 'Meeting-{{date}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Meeting-2025-09-02');
    });

    test('should replace {{date:YYYY-MM-DD}} with specified format', () => {
      const template = 'Meeting-{{date:YYYY-MM-DD}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Meeting-2025-09-02');
    });

    test('should replace {{date:YYYY/MM/DD}} with different format', () => {
      const template = 'Meeting-{{date:YYYY/MM/DD}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Meeting-2025/09/02');
    });

    test('should replace {{time}} with default format', () => {
      const template = 'Meeting-{{time}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Meeting-14:30');
    });

    test('should replace {{time:HH-mm}} with specified format', () => {
      const template = 'Meeting-{{time:HH-mm}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Meeting-14-30');
    });

    test('should replace multiple placeholders in one template', () => {
      const template = '{{filename}}-{{date:YYYY-MM-DD}}-{{time:HH-mm}}.md';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('회의녹음.m4a-2025-09-02-14-30.md');
    });

    test('should handle complex template with multiple line breaks', () => {
      const template = `# 회의록

**파일:** {{filename}}
**날짜:** {{date:YYYY-MM-DD}}
**시간:** {{time:HH:mm}}

## 요약

{{summary}}

## 전체 내용

{{transcript}}`;

      const result = templateProcessor.process(template, mockData);
      
      expect(result).toContain('**파일:** 회의녹음.m4a');
      expect(result).toContain('**날짜:** 2025-09-02');
      expect(result).toContain('**시간:** 14:30');
      expect(result).toContain(mockData.summary);
      expect(result).toContain(mockData.transcript);
    });

    test('should handle template with no placeholders', () => {
      const template = 'This is a plain text template';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('This is a plain text template');
    });

    test('should handle empty template', () => {
      const template = '';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('');
    });

    test('should handle missing data properties gracefully', () => {
      const template = '{{filename}}-{{nonexistent}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('회의녹음.m4a-{{nonexistent}}');
    });

    test('should handle partial data object', () => {
      const partialData = { filename: 'test.m4a' };
      const template = '{{filename}}-{{summary}}-{{transcript}}';
      const result = templateProcessor.process(template, partialData);
      
      expect(result).toBe('test.m4a-{{summary}}-{{transcript}}');
    });

    test('should preserve original template when no data provided', () => {
      const template = '{{filename}}-{{date}}';
      const result = templateProcessor.process(template, {});
      
      expect(result).toBe('{{filename}}-2025-09-02'); // date should still work via moment
    });

    test('should handle nested braces correctly', () => {
      const template = 'Text with {{filename}} and {not a placeholder}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('Text with 회의녹음.m4a and {not a placeholder}');
    });

    test('should handle special characters in data', () => {
      const specialData = {
        filename: 'test[special].m4a',
        summary: 'Summary with $pecial @characters & symbols',
      };
      const template = '{{filename}} - {{summary}}';
      const result = templateProcessor.process(template, specialData);
      
      expect(result).toBe('test[special].m4a - Summary with $pecial @characters & symbols');
    });

    test('should handle Unicode characters in templates and data', () => {
      const unicodeData = {
        filename: '한글파일명.m4a',
        summary: '한글 요약 📝 이모지도 포함',
      };
      const template = '파일: {{filename}} | 내용: {{summary}}';
      const result = templateProcessor.process(template, unicodeData);
      
      expect(result).toBe('파일: 한글파일명.m4a | 내용: 한글 요약 📝 이모지도 포함');
    });
  });

  describe('date and time formatting edge cases', () => {
    test('should handle complex date-time formats', () => {
      const template = '{{date:YYYY-MM-DD HH:mm}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('2025-09-02 14:30');
    });

    test('should handle invalid date format gracefully', () => {
      const template = '{{date:INVALID-FORMAT}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('INVALID-FORMAT');
    });

    test('should handle malformed date placeholder', () => {
      const template = '{{date:}}';
      const result = templateProcessor.process(template, mockData);
      
      expect(result).toBe('{{date:}}');
    });
  });

  describe('error handling', () => {
    test('should handle null template', () => {
      expect(() => templateProcessor.process(null as any, mockData)).toThrow('Template must be a string');
    });

    test('should handle undefined template', () => {
      expect(() => templateProcessor.process(undefined as any, mockData)).toThrow('Template must be a string');
    });

    test('should handle null data', () => {
      const template = '{{filename}}';
      const result = templateProcessor.process(template, null as any);
      
      expect(result).toBe('{{filename}}');
    });

    test('should handle undefined data', () => {
      const template = '{{filename}}';
      const result = templateProcessor.process(template, undefined as any);
      
      expect(result).toBe('{{filename}}');
    });
  });
});