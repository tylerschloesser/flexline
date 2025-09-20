import { useEffect, useState } from "react";
import { game } from "./game/gameInstance";
import { GameUI } from "./components/GameUI";
import "./App.css";

function App() {
  const [gameState, setGameState] = useState(game.getGameState());

  useEffect(() => {
    // Game is already initialized in gameInstance.ts
    // Just set up the state for React components
    setGameState(game.getGameState());
  }, []);

  return <>{gameState && <GameUI gameState={gameState} />}</>;
}

export default App;
