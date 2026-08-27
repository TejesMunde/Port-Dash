/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        "link-dark": "hsl(var(--link-on-dark))",
      },
      // The eleven discrete radii of the system. Nothing here is 0 — square corners break the voice.
      borderRadius: {
        xs: "2px",
        sm: "3px",
        DEFAULT: "6px",
        md: "6px",
        lg: "12px",
        xl: "13px",
        "2xl": "19px",
        "3xl": "20px",
        "4xl": "24px",
        "5xl": "36px",
        "6xl": "48px",
        full: "999px",
      },
      // Elevation is either whispered or shouted: 0.06 / 0.08 / 0.16, then 0.8. No middle ground.
      boxShadow: {
        "ps-1": "rgba(0, 0, 0, 0.06) 0px 5px 9px 0px",
        "ps-2": "rgba(0, 0, 0, 0.08) 0px 5px 9px 0px",
        "ps-3": "rgba(0, 0, 0, 0.16) 0px 5px 9px 0px",
        "ps-4": "rgba(0, 0, 0, 0.8) 0px 5px 9px 0px",
      },
      // The only two gradients in the system, and only ever as section backgrounds.
      backgroundImage: {
        "section-light": "linear-gradient(180deg, #ffffff 0%, #f5f7fa 100%)",
        "section-dark": "linear-gradient(180deg, #121314 0%, #000000 100%)",
      },
      transitionDuration: { 180: "180ms" },
    },
  },
  plugins: [],
};
