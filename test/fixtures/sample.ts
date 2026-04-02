// @bench
export function parseCSV(input: string): string[][] {
  return input.split('\n').map(line => line.split(','))
}

// @bench name="Sort large array"
export function sortNumbers(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}

// @bench
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// @bench iterations=500
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
