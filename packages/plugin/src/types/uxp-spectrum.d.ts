// Type declarations for UXP Spectrum Web Components
import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'sp-body': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          size?: 'XS' | 'S' | 'M' | 'L' | 'XL'
        },
        HTMLElement
      >
      'sp-heading': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          size?: 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL'
        },
        HTMLElement
      >
      'sp-label': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          slot?: string
        },
        HTMLElement
      >
      'sp-textfield': React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement> & {
          quiet?: boolean
          valid?: boolean
          invalid?: boolean
          multiline?: boolean
          grows?: boolean
          rows?: number
        },
        HTMLInputElement
      >
      'sp-button': React.DetailedHTMLProps<
        React.ButtonHTMLAttributes<HTMLButtonElement> & {
          variant?: 'accent' | 'cta' | 'primary' | 'secondary' | 'negative'
          quiet?: boolean
        },
        HTMLButtonElement
      >
      'sp-action-button': React.DetailedHTMLProps<
        React.ButtonHTMLAttributes<HTMLButtonElement> & {
          quiet?: boolean
          selected?: boolean
        },
        HTMLButtonElement
      >
      'sp-divider': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          size?: 'small' | 'medium' | 'large'
        },
        HTMLElement
      >
      'sp-checkbox': React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
      >
      'sp-radio': React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement>,
        HTMLInputElement
      >
      'sp-radio-group': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'sp-slider': React.DetailedHTMLProps<
        React.InputHTMLAttributes<HTMLInputElement> & {
          min?: number
          max?: number
          step?: number
        },
        HTMLInputElement
      >
      'sp-dropdown': React.DetailedHTMLProps<
        React.SelectHTMLAttributes<HTMLSelectElement>,
        HTMLSelectElement
      >
      'sp-menu': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
      'sp-menu-item': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          selected?: boolean
          disabled?: boolean
        },
        HTMLElement
      >
      'sp-progressbar': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          value?: number
          max?: number
          indeterminate?: boolean
        },
        HTMLElement
      >
      'sp-link': React.DetailedHTMLProps<
        React.AnchorHTMLAttributes<HTMLAnchorElement>,
        HTMLAnchorElement
      >
      'sp-icon': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          name?: string
          size?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
        },
        HTMLElement
      >
      'sp-textarea': React.DetailedHTMLProps<
        React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
          quiet?: boolean
        },
        HTMLTextAreaElement
      >
      'sp-field-label': React.DetailedHTMLProps<
        React.LabelHTMLAttributes<HTMLLabelElement> & {
          for?: string
          required?: boolean
          'side-aligned'?: 'start' | 'end'
          size?: 's' | 'm' | 'l' | 'xl'
        },
        HTMLLabelElement
      >
    }
  }
}
