import { GameStateManager } from "./game/gameState";
import { GameRenderer } from "./game/renderer";
import { GameUI } from "./components/GameUI";

interface AppProps {
  gameState: GameStateManager;
  renderer: GameRenderer;
}

function App({ gameState, renderer }: AppProps) {
  return <GameUI gameState={gameState} renderer={renderer} />;
}

export default App;
