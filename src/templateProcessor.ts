import moment from 'moment';

export interface TemplateData {
  filename?: string;
  summary?: string;
  transcript?: string;
  [key: string]: any;
}

export class TemplateProcessor {
  constructor() {}

  process(template: string, data: TemplateData): string {
    if (typeof template !== 'string') {
      throw new Error('Template must be a string');
    }

    if (!data) {
      data = {};
    }

    let result = template;

    // Replace basic placeholders
    const basicPlaceholders = ['filename', 'summary', 'transcript'];
    
    for (const placeholder of basicPlaceholders) {
      if (data[placeholder] !== undefined) {
        const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
        result = result.replace(regex, String(data[placeholder]));
      }
    }

    // Replace date placeholders with format
    result = result.replace(/\{\{date(?::([^}]+))?\}\}/g, (match, format) => {
      const dateFormat = format || 'YYYY-MM-DD';
      try {
        return moment().format(dateFormat);
      } catch (error) {
        // If format is invalid, return the format string itself
        return dateFormat;
      }
    });

    // Replace time placeholders with format
    result = result.replace(/\{\{time(?::([^}]+))?\}\}/g, (match, format) => {
      const timeFormat = format || 'HH:mm';
      try {
        return moment().format(timeFormat);
      } catch (error) {
        // If format is invalid, return the format string itself
        return timeFormat;
      }
    });

    return result;
  }
}