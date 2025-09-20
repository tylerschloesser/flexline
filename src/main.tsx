import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import App from "./App.tsx";
import { game } from "./game/gameInstance";

async function initializeAndRender() {
  try {
    // Wait for the game to initialize completely
    await game.initialize();
    console.log("Game initialized successfully");

    // Now render React with fully initialized game instances
    const gameState = game.getGameState();
    const renderer = game.getRenderer();

    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ColorSchemeScript defaultColorScheme="auto" />
        <MantineProvider defaultColorScheme="auto">
          <App gameState={gameState} renderer={renderer} />
        </MantineProvider>
      </StrictMode>,
    );
  } catch (error) {
    console.error("Failed to initialize game:", error);
    // Show error message to user
    document.getElementById("root")!.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
        <div style="text-align: center;">
          <h1>Failed to initialize game</h1>
          <p>${error instanceof Error ? error.message : String(error)}</p>
          <p>Please refresh the page to try again.</p>
        </div>
      </div>
    `;
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAndRender);
} else {
  initializeAndRender();
}
