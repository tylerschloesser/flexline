# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always use `bun` instead of `npm`

## Game Description

**Fluxline** is a 2D resource management and crafting game built with React, TypeScript, and canvas rendering. The game features:

### Core Gameplay

- **Resource Mining**: Click on resources (iron, copper, coal, wood, stone) scattered across a procedurally generated world to mine them
- **Crafting System**: Use collected resources to craft items (currently furnaces requiring 5 stone)
- **Building Placement**: Select crafted items and place them in the world by clicking
- **Inventory Management**: Track collected resources and crafted items

### World & Navigation

- **Infinite Procedural World**: Chunk-based world generation with varied terrain and resource distribution
- **Free Camera Movement**: Pan with mouse drag, zoom with scroll wheel, or use WASD keys for movement
- **Persistent State**: Game state is automatically saved and restored between sessions

### Technical Features

- Canvas-based rendering with efficient chunk loading
- Real-time UI updates with React state management
- Mantine UI component library for clean interface design
- TypeScript with Zod schemas for type safety and validation

### Current Game Loop

1. Explore the world to find resources
2. Mine resources by clicking on them
3. Craft items using collected resources
4. Place crafted items in the world to expand your base

The game currently focuses on the foundational mechanics of resource gathering, crafting, and placement, with furnaces as the primary craftable item.

## Commands

### Development

- `bun dev` - Start development server with hot module replacement (HMR)
- `bun run build` - Type check with TypeScript and build for production
- `bun run lint` - Run ESLint checks
- `bun run format` - Format code with Prettier
- `bun run check` - **PREFERRED**: Format, lint, and type check in one command
- `bun run preview` - Preview production build locally

### Code Quality

After making code changes, always run:

- `bun run check` - **PREFERRED**: Runs format + lint + typecheck in one command

Or individually:

- `bun run format` - Format code with Prettier
- `bun run lint` - Check code with ESLint
- `bunx tsc -b` - Type check with TypeScript (just type checking, not full build)

## Architecture

This is a React + TypeScript + Vite application using:

- React 19 with functional components and hooks
- TypeScript for type safety
- Vite as the build tool and dev server
- Mantine UI component library
- ESLint for code quality
- Prettier for code formatting (using default config)

The application follows a standard Vite React template structure with the main entry point at `src/main.tsx` rendering the `App` component.

## important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
Claude should never run the dev server. I Run the dev server in a separate shell always.
