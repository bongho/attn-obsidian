# Changelog

All notable changes to the ATTN (Audio To Tidied Notes) plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-09-02

### Added
- 🎨 **Template Engine**: Comprehensive placeholder system for dynamic content generation
  - `{{filename}}` - Original audio file name
  - `{{summary}}` - AI-generated summary
  - `{{date:format}}` - Customizable date formatting using moment.js
  - `{{time:format}}` - Customizable time formatting
- 📁 **Custom Save Folder Path**: Specify where generated notes should be saved
- 📝 **Filename Template**: Dynamic filename generation using placeholders
- 🎯 **Content Template**: Fully customizable note structure and formatting
- 🧪 **Comprehensive Test Coverage**: 80+ tests with 91.25% pass rate using TDD methodology

### Changed
- 🔄 **Refactored NoteCreator**: Simplified responsibility to path + content only
- 🎭 **Enhanced main.ts**: Now acts as orchestrator coordinating all modules
- ⚙️ **Extended Settings Interface**: Added new template configuration fields
- 🏗️ **Modular Architecture**: Improved separation of concerns and extensibility

### Improved
- 🚀 **User Experience**: Complete customization of note generation workflow
- 🔧 **Developer Experience**: Better code organization and maintainability
- 📊 **Type Safety**: Enhanced TypeScript interfaces and type checking
- 🛡️ **Error Handling**: More robust error management across all modules

### Technical
- Added `TemplateProcessor` class with moment.js integration
- Extended `ATTNSettings` interface with template fields
- Refactored file path generation logic
- Enhanced settings UI with new template configuration options

## [1.0.0] - 2024-12-01

### Added
- 🎵 **M4A Audio Processing**: Right-click context menu for M4A files
- 🤖 **OpenAI Integration**: Whisper for transcription, GPT-4 for summarization
- 🔐 **Secure API Key Management**: Local storage of OpenAI API key
- 🇰🇷 **Korean Language Optimization**: Enhanced support for Korean audio content
- 📝 **Automated Note Generation**: One-click conversion to structured meeting notes
- ⚙️ **Settings Management**: Configuration panel for API key setup
- 🧪 **Test-Driven Development**: Initial test suite with Jest framework

### Security
- API key stored locally in Obsidian plugin data
- No external data storage beyond OpenAI processing
- Browser environment safety with `dangerouslyAllowBrowser` flag

### Documentation
- Comprehensive README with setup instructions
- API cost information and usage guidelines
- Development setup and contribution guidelines

## [Unreleased]

### Planned for v2.1
- [ ] Multi-format audio support (MP3, WAV, etc.)
- [ ] Full transcript template support (`{{transcript}}` placeholder)
- [ ] Batch processing capabilities
- [ ] Custom prompt configuration

### Planned for v2.2
- [ ] Local AI model support (Whisper.cpp)
- [ ] Speaker recognition features
- [ ] Real-time audio processing

---

## Release Notes Template

### [Version] - Date

#### Added
- New features and capabilities

#### Changed
- Modifications to existing features

#### Improved
- Performance and usability enhancements

#### Fixed
- Bug fixes and issue resolutions

#### Security
- Security-related changes

#### Technical
- Internal improvements and refactoring