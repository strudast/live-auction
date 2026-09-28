import { createContext, useContext } from 'react'
import type { LoginInput, RegisterInput, User } from '../api/auth'

// `import type` is required here because the template turns on
// `verbatimModuleSyntax`. It makes the build fail if a type-only import
// isn't marked as such, which keeps the compiled output predictable.

export interface AuthContextValue {
  user: User | null // null = logged out
  isLoading: boolean // true only while we're asking the server "who am I?" on page load
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

// Default is null so we can detect a component being used outside the provider.
export const AuthContext = createContext<AuthContextValue | null>(null)

// Custom hook so components write `const { user } = useAuth()` instead of
// repeating useContext plus the null check everywhere.
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

// Why is this in its own file, separate from the provider component?
// The React Fast Refresh lint rule (`react-refresh/only-export-components`) warns
// when a file exports both components and non-components (hooks, contexts),
// because hot reload then resets state more often than it should.