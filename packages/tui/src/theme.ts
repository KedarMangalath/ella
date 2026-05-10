export const colors = {
  brand:   "#DECBF7",
  accent:  "#B784A7",
  orchid:  "#CA81D5",
  rose:    "#E8A2BE",
  muted:   "#AE99B5",
  success: "#84D2AD",
  warning: "#ECC579",
  danger:  "#F48397",
  cyan:    "#81DAD7",
  gold:    "#F6D678",
  bg:      "#1A0D20",
  dim:     "#6B5A72",
  white:   "#F5F0F8",
} as const;

export type ThemeColor = typeof colors[keyof typeof colors];
