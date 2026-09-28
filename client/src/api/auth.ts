import { isAxiosError } from 'axios'
import { api } from './client'

// `interface` for plain object shapes. The Vite template enables
// `erasableSyntaxOnly`, which forbids TypeScript-only runtime features such as
// enums, so we stick to types that vanish completely at compile time.
export interface User {
  id: string
  name: string
  email: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  name: string
}

// Every endpoint wraps the user like this: { user: {...} }
interface UserResponse {
  user: User
}

// Asks the server "who am I?" using the cookie the browser sends automatically.
// Returns null when nobody is logged in. A 401 here is a normal answer, not an
// error, so we convert it to null. Converting it also lets the caller treat
// "logged out" as an ordinary value, and other failures (server down, 500) still throw.
export async function fetchMe(): Promise<User | null> {
  try {
    const { data } = await api.get<UserResponse>('/auth/me')
    return data.user
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 401) return null
    throw err
  }
}

export async function loginRequest(input: LoginInput): Promise<User> {
  const { data } = await api.post<UserResponse>('/auth/login', input)
  return data.user
}

export async function registerRequest(input: RegisterInput): Promise<User> {
  const { data } = await api.post<UserResponse>('/auth/register', input)
  return data.user
}

export async function logoutRequest(): Promise<void> {
  await api.post('/auth/logout')
}