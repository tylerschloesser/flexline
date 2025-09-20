import { useState } from 'react'
import { Container, Title, Button, Text, Group, Stack, Badge, Paper, Center, Image } from '@mantine/core'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl" align="center">
        <Group justify="center">
          <a href="https://vite.dev" target="_blank" rel="noopener noreferrer">
            <Image src={viteLogo} alt="Vite logo" w={100} h={100} />
          </a>
          <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
            <Image src={reactLogo} alt="React logo" w={100} h={100} />
          </a>
        </Group>

        <Title order={1}>Vite + React</Title>

        <Paper shadow="sm" radius="md" p="xl" withBorder>
          <Stack align="center" gap="md">
            <Button
              onClick={() => setCount((count) => count + 1)}
              size="lg"
              variant="filled"
            >
              count is {count}
            </Button>
            <Text size="sm" c="dimmed">
              Edit <Badge variant="light">src/App.tsx</Badge> and save to test HMR
            </Text>
          </Stack>
        </Paper>

        <Center>
          <Text size="sm" c="dimmed" ta="center">
            Click on the Vite and React logos to learn more
          </Text>
        </Center>
      </Stack>
    </Container>
  )
}

export default App
