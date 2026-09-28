import type { InputHTMLAttributes } from 'react'

// A labelled input used by both forms. Styling lives in one place, so a change to
// how inputs look (or their accessibility) happens here and both forms
// pick it up, with no repeated markup in the pages.
//
// Extending InputHTMLAttributes means the component accepts every normal <input>
// prop (type, value, onChange, autoComplete, minLength, ...) without us listing them.
interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export function TextField({ label, id, ...inputProps }: TextFieldProps) {
  // Fall back to the label for the id so <label htmlFor> always matches the input.
  // Clicking the label focuses the input, and screen readers announce it properly.
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300 mb-1">
        {label}
      </label>
      <input
        id={inputId}
        className="w-full rounded-md bg-slate-800 border border-slate-600 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        {...inputProps}
      />
    </div>
  )
}