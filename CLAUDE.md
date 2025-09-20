# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always use `bun` instead of `npm`

## Commands

### Development
- `bun dev` - Start development server with hot module replacement (HMR)
- `bun run build` - Type check with TypeScript and build for production
- `bun run lint` - Run ESLint checks
- `bun run preview` - Preview production build locally

## Architecture

This is a React + TypeScript + Vite application using:
- React 19 with functional components and hooks
- TypeScript for type safety
- Vite as the build tool and dev server
- ESLint for code quality

The application follows a standard Vite React template structure with the main entry point at `src/main.tsx` rendering the `App` component.

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.