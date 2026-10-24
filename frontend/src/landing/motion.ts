/** Whether the person has asked their system to reduce motion (and whether we can even tell). */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
