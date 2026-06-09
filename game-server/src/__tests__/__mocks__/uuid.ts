let counter = 0
export const v4 = () => `test-uuid-${++counter}`
export const reset = () => { counter = 0 }
