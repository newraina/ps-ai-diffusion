# UXP Plugin Development Notes

## Spectrum Components in UXP

There are two Spectrum component systems in UXP:

### 1. Spectrum UXP Widgets (Built-in)
- Use `sp-*` tags directly, no imports needed
- Limited functionality, Adobe has stopped adding new features
- Example: `<sp-button>`, `<sp-textfield>`

### 2. Spectrum Web Components (SWC)
- Requires `@swc-uxp-wrappers/*` and `@swc-react/*` packages
- More features (30+ components)
- Requires `enableSWCSupport` flag in manifest.json

## Current Project Configuration

This project uses **SWC + React**:

### Dependencies
```bash
# UXP-compatible wrappers
pnpm add @swc-uxp-wrappers/utils @swc-uxp-wrappers/button @swc-uxp-wrappers/textfield ...

# Specific versions of React wrappers (note the version format)
pnpm add @swc-react/button@0.19.8-react.3029
pnpm add @swc-react/textfield@0.13.11-react.3163
```

### manifest.json
```json
{
  "host": {
    "app": "PS",
    "minVersion": "24.4.0"  // SWC requires UXP 7.0+, which corresponds to PS 24.4+
  },
  "featureFlags": {
    "enableSWCSupport": true
  }
}
```

### vite.config.ts
```typescript
import { aliases } from '@swc-uxp-wrappers/utils'

export default defineConfig({
  resolve: {
    alias: aliases,  // Maps @spectrum-web-components/* to @swc-uxp-wrappers/*
  },
})
```

### index.tsx
```typescript
import { Theme } from '@swc-react/theme'

// UXP SWC requires global React
window.React = React

// Wrap app with Theme
<Theme theme="spectrum" scale="medium" color="dark">
  <App />
</Theme>
```

## Component Usage

```typescript
import { Button } from '@swc-react/button'
import { Textfield } from '@swc-react/textfield'
import { FieldLabel } from '@swc-react/field-label'

// Use as regular React components
<Button variant="accent" onClick={handleClick}>
  Click me
</Button>

<Textfield
  multiline
  grows
  value={value}
  onInput={(e) => setValue(e.target.value)}
/>
```

## Important Notes

1. **Do NOT use standard @swc-react packages**: Standard versions depend on Lit library APIs like `createTreeWalker` which UXP doesn't support
2. **Version locking**: UXP 8.0 locks SWC components to version 0.37.0
3. **React 19 compatibility**: @swc-react packages have peer dependency on React 17/18, but currently work with React 19

## References

- [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/)
- [UXP SWC Documentation](https://developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-spectrum/swc/)
- [SWC UXP React Starter](https://github.com/AdobeDocs/uxp-photoshop-plugin-samples/tree/main/swc-uxp-react-starter)
