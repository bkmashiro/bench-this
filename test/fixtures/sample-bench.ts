// @bench
export function addNumbers(a: number, b: number) { return a + b }

// @bench label="Array sort"
export const sortArray = (arr: number[]) => [...arr].sort((a, b) => a - b)

// @bench
export async function multiplyNumbers(a: number, b: number) { return a * b }

// not benchmarked
export function helper() { return 42 }
