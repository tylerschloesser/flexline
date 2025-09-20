import { useState, useEffect, memo, useMemo } from "react";
import { GameStateManager } from "../game/gameState";
import type { EntityType } from "../game/schemas";
import "./GameUI.css";

interface GameUIProps {
  gameState: GameStateManager;
}

export const GameUI = memo(function GameUI({ gameState }: GameUIProps) {
  const [inventory, setInventory] = useState(gameState.getInventory());
  const [craftedItems, setCraftedItems] = useState(gameState.getCraftedItems());
  const [selectedCraftingItem, setSelectedCraftingItem] = useState(
    gameState.getSelectedCraftingItem(),
  );

  useEffect(() => {
    const unsubscribe = gameState.subscribe(() => {
      setInventory(gameState.getInventory());
      setCraftedItems(gameState.getCraftedItems());
      setSelectedCraftingItem(gameState.getSelectedCraftingItem());
    });

    return unsubscribe;
  }, [gameState]);

  const handleCraft = (recipe: string) => {
    gameState.craftItem(recipe);
  };

  const handleSelectItem = (itemType: EntityType) => {
    if (selectedCraftingItem === itemType) {
      gameState.setSelectedCraftingItem(null);
    } else {
      gameState.setSelectedCraftingItem(itemType);
    }
  };

  const handleReset = () => {
    if (
      confirm(
        "Are you sure you want to reset the game? All progress will be lost.",
      )
    ) {
      gameState.resetState();
      window.location.reload();
    }
  };

  const canCraftFurnace = useMemo(
    () => inventory.stone >= 5,
    [inventory.stone],
  );

  return (
    <div className="game-ui">
      <div className="ui-panel inventory-panel">
        <h2>Inventory</h2>
        <div className="inventory-list">
          {Object.entries(inventory).map(([resource, amount]) => (
            <div key={resource} className="inventory-item">
              <span className="resource-name">{resource}</span>
              <span className="resource-amount">{amount}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-panel crafting-panel">
        <h2>Crafting</h2>
        <div className="crafting-list">
          <div className="crafting-item">
            <button
              onClick={() => handleCraft("furnace")}
              disabled={!canCraftFurnace}
              className="craft-button"
            >
              Furnace (5 stone)
            </button>
            <span className="crafted-count">
              {craftedItems.furnace ? `x${craftedItems.furnace}` : ""}
            </span>
          </div>
        </div>

        {craftedItems.furnace && craftedItems.furnace > 0 && (
          <div className="placement-section">
            <h3>Place Items</h3>
            <div className="placement-list">
              <button
                onClick={() => handleSelectItem("furnace")}
                className={`placement-button ${selectedCraftingItem === "furnace" ? "selected" : ""}`}
              >
                {selectedCraftingItem === "furnace" ? "✓ " : ""}Furnace{" "}
                {selectedCraftingItem === "furnace" ? "(Selected)" : ""}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ui-panel controls-panel">
        <h2>Controls</h2>
        <div className="controls-info">
          <p>🖱️ Drag to pan</p>
          <p>🎯 Click resources to mine</p>
          <p>🔍 Scroll to zoom</p>
          <p>🏗️ Select items to place them</p>
          <p>📦 Click to place selected items</p>
        </div>
        <button onClick={handleReset} className="reset-button">
          Reset Game
        </button>
      </div>
    </div>
  );
});
