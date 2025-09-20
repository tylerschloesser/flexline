import { useState, useEffect, memo, useMemo } from "react";
import {
  Paper,
  Text,
  Button,
  Stack,
  Group,
  Badge,
  Divider,
  Box,
} from "@mantine/core";
import { GameStateManager } from "../game/gameState";
import type { EntityType } from "../game/schemas";

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
    <Box
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
      }}
    >
      {/* Inventory Panel */}
      <Paper
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          minWidth: 200,
          pointerEvents: "auto",
        }}
        p="md"
        withBorder
        shadow="md"
      >
        <Text size="lg" fw={600} mb="sm">
          Inventory
        </Text>
        <Stack gap="xs">
          {Object.entries(inventory).map(([resource, amount]) => (
            <Group key={resource} justify="space-between">
              <Text tt="capitalize">{resource}</Text>
              <Badge color="green" variant="light">
                {amount}
              </Badge>
            </Group>
          ))}
        </Stack>
      </Paper>

      {/* Crafting Panel */}
      <Paper
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          minWidth: 200,
          pointerEvents: "auto",
        }}
        p="md"
        withBorder
        shadow="md"
      >
        <Text size="lg" fw={600} mb="sm">
          Crafting
        </Text>
        <Stack gap="xs">
          <Group>
            <Button
              onClick={() => handleCraft("furnace")}
              disabled={!canCraftFurnace}
              flex={1}
            >
              Furnace (5 stone)
            </Button>
            {craftedItems.furnace > 0 && (
              <Badge color="green" variant="light">
                x{craftedItems.furnace}
              </Badge>
            )}
          </Group>
        </Stack>

        {craftedItems.furnace && craftedItems.furnace > 0 && (
          <>
            <Divider my="md" />
            <Text size="md" fw={500} mb="sm">
              Place Items
            </Text>
            <Stack gap="xs">
              <Button
                onClick={() => handleSelectItem("furnace")}
                variant={
                  selectedCraftingItem === "furnace" ? "filled" : "light"
                }
                color={selectedCraftingItem === "furnace" ? "orange" : "green"}
                leftSection={selectedCraftingItem === "furnace" ? "✓" : ""}
              >
                Furnace {selectedCraftingItem === "furnace" ? "(Selected)" : ""}
              </Button>
            </Stack>
          </>
        )}
      </Paper>

      {/* Controls Panel */}
      <Paper
        style={{
          position: "absolute",
          bottom: 10,
          left: 10,
          pointerEvents: "auto",
        }}
        p="md"
        withBorder
        shadow="md"
      >
        <Text size="lg" fw={600} mb="sm">
          Controls
        </Text>
        <Stack gap="xs" mb="md">
          <Text size="sm" c="dimmed">
            🖱️ Drag to pan
          </Text>
          <Text size="sm" c="dimmed">
            🎯 Click resources to mine
          </Text>
          <Text size="sm" c="dimmed">
            🔍 Scroll to zoom
          </Text>
          <Text size="sm" c="dimmed">
            🏗️ Select items to place them
          </Text>
          <Text size="sm" c="dimmed">
            📦 Click to place selected items
          </Text>
        </Stack>
        <Button onClick={handleReset} color="red" fullWidth>
          Reset Game
        </Button>
      </Paper>
    </Box>
  );
});
