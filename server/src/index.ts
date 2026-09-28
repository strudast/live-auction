import http from 'http'
import mongoose from 'mongoose'
import { env } from './config/env'
import { app } from './app'

async function main() {
  // Connect to the database BEFORE accepting requests. Otherwise the first
  // few requests after a restart would fail while the connection is still opening.
  await mongoose.connect(env.MONGODB_URI)
  console.log('MongoDB connected')

  // We create the HTTP server ourselves instead of calling app.listen(). Under
  // the hood app.listen() does exactly this, but keeping the server object lets
  // us pass it to Socket.IO later: `new Server(server)`. Then HTTP requests
  // and WebSocket connections share a single port, which is what Render exposes.
  const server = http.createServer(app)
  server.listen(env.PORT, () => console.log(`Server on http://localhost:${env.PORT}`))
}

// Any failure during startup (bad database credentials, port in use) is logged
// and the process exits with a non-zero code. Exiting is right: a hosting
// platform sees the crash and restarts or reports it, which beats a
// half-working server that keeps running.
main().catch((err) => {
  console.error(err)
  process.exit(1)
})