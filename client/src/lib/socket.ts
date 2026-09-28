import { io } from 'socket.io-client'

// One shared socket for the whole app.
// autoConnect: false because most pages don't need a live connection.
// The auction page connects when it opens and disconnects when it closes.
// withCredentials sends cookies, which matters if the API is on another domain.
//
// In development VITE_SOCKET_URL is unset, so the client connects to its own
// origin and Vite's proxy forwards /socket.io to the server. In production
// you can point it at the API's URL.
const url = import.meta.env.VITE_SOCKET_URL as string | undefined
const options = { withCredentials: true, autoConnect: false }

export const socket = url ? io(url, options) : io(options)