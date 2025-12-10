# Contributing to GetProfile

First off, thank you for considering contributing to GetProfile! It's people like you that make GetProfile such a great tool for the AI community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Style Guide](#style-guide)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [admin@getprofile.org](mailto:admin@getprofile.org).

## Getting Started

### Prerequisites

- **Node.js** 20 or higher
- **pnpm** 8 or higher
- **PostgreSQL** 15 or higher (or Docker)
- **Git**

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:

   ```bash
   git clone https://github.com/YOUR_USERNAME/getprofile.git
   cd getprofile
   ```

3. **Add the upstream remote**:

   ```bash
   git remote add upstream https://github.com/getprofile/getprofile.git
   ```

4. **Install dependencies**:

   ```bash
   pnpm install
   ```

5. **Set up environment**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

6. **Start the database** (if using Docker):

   ```bash
   docker compose up -d db
   ```

7. **Run migrations**:

   ```bash
   pnpm db:migrate
   ```

8. **Start development servers**:
   ```bash
   pnpm dev
   ```

### Project Structure

```
getprofile/
├── apps/
│   └── server/         # LLM proxy server
├── packages/
│   ├── core/           # Core engine (memory, traits)
│   ├── db/             # Database layer
│   ├── sdk-js/         # JavaScript SDK
│   └── config/         # Configuration utilities
├── config/             # Default configurations
└── docker/             # Docker files
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/getprofile/getprofile/issues) to avoid duplicates.

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs what actually happened
- **Environment details** (OS, Node version, etc.)
- **Relevant logs** or error messages
- **Code samples** if applicable

### Suggesting Features

Feature requests are welcome! Please:

1. Check [existing discussions](https://github.com/getprofile/getprofile/discussions) first
2. Open a new discussion in the "Ideas" category
3. Describe the problem you're trying to solve
4. Explain your proposed solution
5. Consider alternatives you've thought about

### Working on Issues

1. **Comment on the issue** to let others know you're working on it
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
3. **Make your changes** following our style guide
4. **Write/update tests** for your changes
5. **Run the test suite** to ensure nothing is broken
6. **Submit a pull request**

## Pull Request Process

### Before Submitting

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Run the full test suite**:
   ```bash
   pnpm test
   pnpm lint
   pnpm typecheck
   ```
4. **Update CHANGELOG.md** if applicable

### PR Guidelines

- **Fill out the PR template** completely
- **Link to related issues** using keywords (Fixes #123, Closes #456)
- **Keep PRs focused** — one feature or fix per PR
- **Write clear commit messages** following [Conventional Commits](https://www.conventionalcommits.org/)

### Commit Message Format

```
type(scope): short description

[optional body]

[optional footer]
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

Examples:

```
feat(server): add support for Anthropic provider
fix(core): handle empty trait values gracefully
docs(readme): add self-hosting instructions
```

### Review Process

1. A maintainer will review your PR
2. They may request changes — this is normal!
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release 🎉

## Style Guide

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Document public APIs with JSDoc

### Code Formatting

We use Prettier and ESLint. Run before committing:

```bash
pnpm lint        # Check for issues
pnpm lint:fix    # Auto-fix issues
pnpm format      # Format with Prettier
```

### File Organization

- One component/class per file
- Group related files in directories
- Use barrel exports (`index.ts`) for public APIs
- Keep files under 300 lines when possible

### Testing

- Write tests for all new features
- Maintain existing test coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe("TraitEngine", () => {
  describe("extractTraits", () => {
    it("should extract name trait from explicit mention", async () => {
      // Arrange
      const messages = [{ role: "user", content: "Hi, I'm Alex" }];

      // Act
      const traits = await engine.extractTraits(messages);

      // Assert
      expect(traits).toContainEqual(
        expect.objectContaining({ key: "name", value: "Alex" })
      );
    });
  });
});
```

### Documentation

- Update README for user-facing changes
- Add JSDoc for public functions
- Include code examples where helpful
- Keep docs in sync with code

## Community

- **Discussions**: Use [GitHub Discussions](https://github.com/getprofile/getprofile/discussions) for questions and ideas
- **Twitter**: Follow [@getprofile_ai](https://x.com/GetProfileAI) for updates

## Recognition

Contributors are recognized in:

- Our [CONTRIBUTORS.md](./CONTRIBUTORS.md) file
- Release notes
- Our website's community page

Thank you for contributing! 🙏
