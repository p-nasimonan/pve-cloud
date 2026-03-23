import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx,astro}"],
  exclude: [],
  globalCss: {
    "html, body": {
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      color: "text-primary",
      minHeight: "100vh",
    },
    "a": {
      color: "brand",
      textDecoration: "none",
    },
    "a:hover": {
      textDecoration: "underline",
    },
    "*, *::before, *::after": {
      boxSizing: "border-box",
    },
  },
  theme: {
    extend: {
      tokens: {
        colors: {
          // Navigation sidebar (AWS dark navy)
          "nav-bg":              { value: "#16191f" },
          "nav-item-hover":      { value: "#2a3a4a" },
          "nav-item-active":     { value: "#0d2136" },
          "nav-indicator":       { value: "#0073bb" },
          "nav-text":            { value: "#b4bec8" },
          "nav-text-active":     { value: "#ffffff" },
          "nav-heading":         { value: "#8b97a2" },
          "nav-divider":         { value: "#2d3748" },
          // Top bar
          "topbar-bg":           { value: "#232f3e" },
          "topbar-border":       { value: "#37475a" },
          "topbar-text":         { value: "#d5dbdb" },
          // Content area
          "page-bg":             { value: "#f2f3f3" },
          // Surfaces
          "surface":             { value: "#ffffff" },
          "surface-hover":       { value: "#f8f9fa" },
          // Borders
          "border":              { value: "#d5dbdb" },
          "border-focus":        { value: "#0073bb" },
          // Brand (AWS blue)
          "brand":               { value: "#0073bb" },
          "brand-hover":         { value: "#005e99" },
          "brand-light":         { value: "#e8f3fb" },
          // Text
          "text-primary":        { value: "#16191f" },
          "text-secondary":      { value: "#5f6b7a" },
          "text-muted":          { value: "#8b97a2" },
          "text-inverse":        { value: "#ffffff" },
          // Status
          "status-running-bg":   { value: "#eafaf1" },
          "status-running-text": { value: "#1d8348" },
          "status-running-dot":  { value: "#1d8348" },
          "status-stopped-bg":   { value: "#f2f3f3" },
          "status-stopped-text": { value: "#5f6b7a" },
          "status-stopped-dot":  { value: "#aab7b8" },
          "status-paused-bg":    { value: "#fef9e7" },
          "status-paused-text":  { value: "#d68910" },
          "status-paused-dot":   { value: "#d68910" },
          // Feedback
          "danger":              { value: "#d13212" },
          "danger-hover":        { value: "#b0290e" },
          "danger-bg":           { value: "#fdf3f1" },
          "danger-border":       { value: "#f5cebe" },
          "success":             { value: "#1d8348" },
          "success-bg":          { value: "#eafaf1" },
          "success-border":      { value: "#a9dfbf" },
          "warning":             { value: "#d68910" },
          "warning-bg":          { value: "#fef9e7" },
          "warning-border":      { value: "#fad7a0" },
        },
        sizes: {
          sidebar: { value: "220px" },
          topbar:  { value: "48px" },
        },
        // margin/padding properties use spacing tokens, not sizes
        spacing: {
          sidebar: { value: "220px" },
          topbar:  { value: "48px" },
        },
        shadows: {
          card:    { value: "0 1px 4px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.06)" },
          "card-hover": { value: "0 2px 8px rgba(0,0,0,0.15)" },
        },
        radii: {
          sm: { value: "4px" },
          md: { value: "6px" },
          lg: { value: "8px" },
          xl: { value: "12px" },
        },
      },
    },
  },
  outdir: "styled-system",
});
