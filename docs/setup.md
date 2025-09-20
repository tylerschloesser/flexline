I want to create a simple game engine for a Factorio like browser game.
I want to use Pixi for rendering and React for the UI.
I already have a basic React app set up with Vite.
Use pixi viewport to allow for panning and zooming.
Start with two tile types: land and water.
To keep things visually interseting: land is high or low, water is deep or shallow.
Generate and cache a few random textures for each, and use them randomly to add some variety.
Textures should be generated with some SVG noise.
Land tiles can have resources: iron, copper, coal, wood, stone
The world is modeled in chunks of 32x32 tiles.
The world is infinite, so we will generate chunks on demand, when they enter the viewport.
Use a simple Perlin noise algorithm to generate the terrain and place resources.
To keep things simple, clicking on a resource is all it takes to "mine" it.
Resources are infinite for now.
The React UI should show the current resources collected. i.e. an inventory.
Carefully consider how to model the game state such that it can be referenced from both the Pixi rendering code and the React UI code.
Save to local storage so progress is not lost on refresh. Add a button to reset the game state.
Use Zod for schema validation of the game state.
Add a basic crafting system: 5 stone -> 1 furnace.
There is no player character for now, we just move the camera around an interact with the world directly.
