import http from 'http'
import mongoose from 'mongoose'
import { env } from './config/env'
import { app } from './app'
import { initRealtime } from './lib/realtime'

async function main() {
  await mongoose.connect(env.MONGODB_URI)
  console.log('MongoDB connected')

  const server = http.createServer(app)

  // Attach Socket.IO to the SAME http server. HTTP requests and WebSocket
  // connections then share one port, which is all Render exposes.
  initRealtime(server)

  server.listen(env.PORT, () => console.log(`Server on http://localhost:${env.PORT}`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})