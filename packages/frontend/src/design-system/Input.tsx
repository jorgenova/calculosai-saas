import { type InputHTMLAttributes, forwardRef, useId } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-graphite-600 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={clsx(
            'w-full h-10 px-3 text-sm bg-white border rounded-lg transition-all duration-150',
            'placeholder:text-graphite-400 focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-100'
              : 'border-graphite-200 focus:border-ink-500 focus:ring-ink-100',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-danger-600 mt-1.5">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-xs text-graphite-500 mt-1.5">
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'
