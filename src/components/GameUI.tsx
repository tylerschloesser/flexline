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
import { GameRenderer } from "../game/renderer";
import type { EntityType, ResourceType, Entity } from "../game/schemas";

interface GameUIProps {
  gameState: GameStateManager;
  renderer: GameRenderer;
}

export const GameUI = memo(function GameUI({
  gameState,
  renderer,
}: GameUIProps) {
  const [inventory, setInventory] = useState(gameState.getInventory());
  const [craftedItems, setCraftedItems] = useState(gameState.getCraftedItems());
  const [selectedItem, setSelectedItem] = useState(gameState.getSelectedItem());
  const [selectedCraftingItem, setSelectedCraftingItem] = useState(
    gameState.getSelectedCraftingItem(),
  );
  const [hoveredEntity, setHoveredEntity] = useState<Entity | null>(null);

  useEffect(() => {
    const unsubscribe = gameState.subscribe(() => {
      setInventory(gameState.getInventory());
      setCraftedItems(gameState.getCraftedItems());
      setSelectedItem(gameState.getSelectedItem());
      setSelectedCraftingItem(gameState.getSelectedCraftingItem());
    });

    return unsubscribe;
  }, [gameState]);

  useEffect(() => {
    const unsubscribeHover = renderer.onEntityHover((entity) => {
      setHoveredEntity(entity);
    });

    return unsubscribeHover;
  }, [renderer]);

  const handleCraft = (recipe: string) => {
    gameState.craftItem(recipe);
  };

  const handleSelectCraftedItem = (itemType: EntityType) => {
    if (selectedCraftingItem === itemType) {
      gameState.setSelectedCraftingItem(null);
    } else {
      gameState.setSelectedCraftingItem(itemType);
    }
  };

  const handleSelectInventoryItem = (resourceType: ResourceType) => {
    const currentSelectedInventoryItem =
      selectedItem?.type === "inventory" ? selectedItem.itemId : null;
    if (currentSelectedInventoryItem === resourceType) {
      gameState.setSelectedInventoryItem(null);
    } else {
      gameState.setSelectedInventoryItem(resourceType);
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
          {Object.entries(inventory).map(([resource, amount]) => {
            const resourceType = resource as ResourceType;
            const isSelected =
              selectedItem?.type === "inventory" &&
              selectedItem.itemId === resourceType;
            const canSelect = amount > 0;

            return (
              <Group key={resource} justify="space-between">
                <Button
                  variant={
                    isSelected ? "filled" : canSelect ? "subtle" : "default"
                  }
                  color={isSelected ? "orange" : "green"}
                  size="compact-sm"
                  disabled={!canSelect}
                  onClick={() =>
                    canSelect && handleSelectInventoryItem(resourceType)
                  }
                  leftSection={isSelected ? "✓" : ""}
                  style={{
                    justifyContent: "flex-start",
                    flex: 1,
                    textTransform: "capitalize",
                  }}
                >
                  {resource} {isSelected ? "(Selected)" : ""}
                </Button>
                <Badge color={canSelect ? "green" : "gray"} variant="light">
                  {amount}
                </Badge>
              </Group>
            );
          })}
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

        {craftedItems.furnace > 0 && (
          <>
            <Divider my="md" />
            <Text size="md" fw={500} mb="sm">
              Place Items
            </Text>
            <Stack gap="xs">
              <Button
                onClick={() => handleSelectCraftedItem("furnace")}
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
            🏗️ Select crafted items to place them
          </Text>
          <Text size="sm" c="dimmed">
            📦 Select inventory items to insert into entities
          </Text>
          <Text size="sm" c="dimmed">
            🎯 Hover over entities and click to insert selected items
          </Text>
        </Stack>
        <Button onClick={handleReset} color="red" fullWidth>
          Reset Game
        </Button>
      </Paper>

      {/* Entity Inventory Hover UI */}
      {hoveredEntity &&
        ((hoveredEntity.inventory &&
          Object.keys(hoveredEntity.inventory).length > 0) ||
          selectedItem?.type === "inventory") && (
          <Paper
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              minWidth: 200,
              pointerEvents: "none",
              zIndex: 1000,
            }}
            p="md"
            withBorder
            shadow="md"
            bg="rgba(255, 255, 255, 0.95)"
          >
            <Text size="lg" fw={600} mb="sm" tt="capitalize">
              {hoveredEntity.type} Inventory
            </Text>
            <Stack gap="xs">
              {hoveredEntity.inventory &&
              Object.keys(hoveredEntity.inventory).length > 0 ? (
                Object.entries(hoveredEntity.inventory).map(
                  ([resource, amount]) => (
                    <Group key={resource} justify="space-between">
                      <Text tt="capitalize" size="sm">
                        {resource}
                      </Text>
                      <Badge color="blue" variant="light" size="sm">
                        {amount}
                      </Badge>
                    </Group>
                  ),
                )
              ) : (
                <Text size="sm" c="dimmed">
                  Empty
                </Text>
              )}
            </Stack>
            {selectedItem?.type === "inventory" && (
              <Text size="xs" c="dimmed" mt="sm">
                Click to insert {selectedItem.itemId}
              </Text>
            )}
          </Paper>
        )}
    </Box>
  );
});
