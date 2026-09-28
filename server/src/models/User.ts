import { Schema, model } from 'mongoose'

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },

    // `unique: true` creates a database index, which is the only reliable way to
    // stop duplicate emails. A "check if it exists, then insert" in code has a
    // race condition: two simultaneous signups can both pass the check. The index
    // makes the second insert fail atomically (error code 11000, handled in the route).
    // `lowercase` + `trim` mean "A@x.com " and "a@x.com" count as the same address.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    // `select: false` means queries do NOT return this field unless we ask for it
    // explicitly. That way we can't leak the hash by accident (for example by
    // sending a whole user document as JSON). Login opts in with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
  },
  // Adds createdAt and updatedAt automatically.
  { timestamps: true },
)

export const User = model('User', userSchema)