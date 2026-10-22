/** Colours for partition blocks. Golden-angle hue steps keep neighbouring blocks distinct. */
const hue = (block: number) => (block * 137.5) % 360

export const groupFill = (block: number) => `hsl(${hue(block)} 85% 55% / 0.3)`
export const groupBorder = (block: number) => `hsl(${hue(block)} 70% 40%)`
